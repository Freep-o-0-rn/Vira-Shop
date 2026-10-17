import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,customerGuard,jsonBody,noStore,object,publicError} from "@/lib/server/customer-auth";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
  const a=await customerGuard(req);if(a.response)return a.response;
  const r=await getPool().query(`SELECT o.id::text,o.status,o.payment_status AS "paymentStatus",
      o.total_minor::text AS "totalMinor",o.delivery_address AS address,o.buyer_note AS note,
      o.created_at AS "createdAt",
      COALESCE(jsonb_agg(jsonb_build_object('id',i.product_id,'title',i.title,'quantity',i.quantity,
         'unitMinor',i.unit_price_minor::text,'lineMinor',i.line_total_minor::text)
         ORDER BY i.id) FILTER(WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
    FROM shop_orders o LEFT JOIN shop_order_items i ON i.order_id=o.id
    WHERE o.customer_id=$1 GROUP BY o.id ORDER BY o.created_at DESC LIMIT 100`,[a.customer!.id]);
  return NextResponse.json({items:r.rows},{headers:noStore});
 }catch(err){return publicError(err);}
}
export async function POST(req:NextRequest){
 try{
  const a=await customerGuard(req,true);if(a.response)return a.response;
  let input:Record<string,unknown>|null;try{input=object(await jsonBody(req));}catch{return bad("Некорректный JSON.");}
  const key=input?.key, addressId=input?.addressId,note=input?.note??"";
  if(typeof key!=="string"||!/^[a-f0-9-]{36}$/.test(key)||
    typeof addressId!=="string"||!/^[0-9]{1,19}$/.test(addressId)||
    typeof note!=="string"||note.length>500)return bad("Укажите адрес и корректный идентификатор заявки.");
  const client=await getPool().connect();
  try{
   await client.query("BEGIN");
   // Serialize checkouts of the same customer so repeated clicks cannot reserve inventory twice.
   await client.query("SELECT id FROM shop_customers WHERE id=$1 FOR UPDATE",[a.customer!.id]);
   const old=await client.query<{id:string}>(
    "SELECT id::text FROM shop_orders WHERE customer_id=$1 AND client_key=$2",[a.customer!.id,key]);
   if(old.rowCount){await client.query("COMMIT");return NextResponse.json({id:old.rows[0].id,reused:true},{headers:noStore});}
   const addresses=await client.query(`SELECT recipient,phone,city,street,building,apartment,comment
     FROM shop_customer_addresses WHERE id=$1 AND customer_id=$2`,[addressId,a.customer!.id]);
   if(!addresses.rowCount){await client.query("ROLLBACK");return bad("Адрес не найден.",404);}
   const cart=await client.query<{id:string;quantity:number}>(`SELECT product_id AS id,quantity
     FROM shop_customer_cart WHERE customer_id=$1 ORDER BY product_id`,[a.customer!.id]);
   if(!cart.rows.length){await client.query("ROLLBACK");return bad("Корзина пуста.",409);}
   if(cart.rows.length>50){await client.query("ROLLBACK");return bad("Слишком много позиций.",409);}
   let total=0;
   const products:{id:string;title:string;priceMinor:number;quantity:number}[]=[];
   for(const line of cart.rows){
     const item=await client.query<{title:string;price_minor:string;stock_count:number;active:boolean}>(`SELECT p.title,p.price_minor::text,p.stock_count,
        (p.is_active AND c.is_active) AS active FROM shop_products p JOIN shop_categories c ON c.id=p.category_id
        WHERE p.id=$1 FOR UPDATE OF p`,[line.id]);
     if(!item.rowCount||!item.rows[0].active||item.rows[0].stock_count<line.quantity){
       await client.query("ROLLBACK");return bad("Товар "+line.id+" закончился или недоступен. Обновите корзину.",409);
     }
     const priceMinor=Number(item.rows[0].price_minor);
     if(!Number.isSafeInteger(priceMinor)||priceMinor<0)throw Error("Invalid DB price");
     const lineTotal=priceMinor*line.quantity;
     if(!Number.isSafeInteger(total+lineTotal))throw Error("Order total outside safe limit");
     total+=lineTotal;
     products.push({id:line.id,title:item.rows[0].title,priceMinor,quantity:line.quantity});
   }
   for(const p of products){
     await client.query("UPDATE shop_products SET stock_count=stock_count-$1,updated_at=NOW() WHERE id=$2",
        [p.quantity,p.id]);
   }
   const order=await client.query<{id:string}>(`INSERT INTO shop_orders
      (customer_id,client_key,total_minor,delivery_address,buyer_note)
      VALUES($1,$2,$3,$4::jsonb,$5) RETURNING id::text`,
      [a.customer!.id,key,total,JSON.stringify(addresses.rows[0]),note.trim()]);
   for(const p of products){
     await client.query(`INSERT INTO shop_order_items(order_id,product_id,title,quantity,unit_price_minor,line_total_minor)
       VALUES($1,$2,$3,$4,$5,$6)`,[order.rows[0].id,p.id,p.title,p.quantity,p.priceMinor,p.priceMinor*p.quantity]);
   }
   await client.query("DELETE FROM shop_customer_cart WHERE customer_id=$1",[a.customer!.id]);
   await client.query("COMMIT");
   return NextResponse.json({id:order.rows[0].id,totalMinor:String(total),paymentStatus:"unpaid"},
     {status:201,headers:noStore});
  }catch(err){try{await client.query("ROLLBACK");}catch{}throw err;}
  finally{client.release();}
 }catch(err){return publicError(err);}
}
