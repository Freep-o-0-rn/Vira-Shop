import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,customerGuard,jsonBody,noStore,object,publicError} from "@/lib/server/customer-auth";
import {deliveryMethod,deliveryPrice,pickupContact,PAYMENT_METHOD} from "@/lib/checkout-options";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 try{
  const a=await customerGuard(req);if(a.response)return a.response;
  const r=await getPool().query(`SELECT o.id::text,o.status,o.payment_status AS "paymentStatus",
      o.total_minor::text AS "totalMinor",
      o.subtotal_minor::text AS "subtotalMinor",
      o.delivery_fee_minor::text AS "deliveryFeeMinor",
      o.delivery_method AS "deliveryMethod",
      o.logistics_status AS "logisticsStatus",o.carrier_code AS "carrierCode",
      o.tracking_number AS "trackingNumber",o.delivery_point AS "deliveryPoint",
      o.payment_method AS "paymentMethod",
      o.delivery_address AS address,o.buyer_note AS note,
      o.created_at AS "createdAt",
      COALESCE(jsonb_agg(jsonb_build_object('id',i.product_id,'title',i.title,'quantity',i.quantity,
         'unitMinor',i.unit_price_minor::text,'lineMinor',i.line_total_minor::text,
         'variantId',i.variant_id,'selection',i.variant_selection)
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
  const method=deliveryMethod(input?.deliveryMethod??"courier");
  if(typeof key!=="string"||!/^[a-f0-9-]{36}$/.test(key)||
    !method||typeof note!=="string"||note.length>500)return bad("Некорректные параметры заявки.");
  if(method==="ozon_pvz")return bad("ПВЗ Ozon пока недоступны: официальный источник пунктов не подключён.",409);
  if((method==="courier"||method==="transport")&&(typeof addressId!=="string"||!/^[0-9]{1,19}$/.test(addressId)))
    return bad("Для доставки выберите сохранённый адрес.");
  const contact=method==="pickup"?pickupContact(input?.pickupContact):null;
  if(method==="pickup"&&!contact)
    return bad("Для самовывоза укажите имя получателя и телефон.");
  const client=await getPool().connect();
  try{
   await client.query("BEGIN");
   // Serialize checkouts of the same customer so repeated clicks cannot reserve inventory twice.
   await client.query("SELECT id FROM shop_customers WHERE id=$1 FOR UPDATE",[a.customer!.id]);
   const old=await client.query<{id:string}>(
    "SELECT id::text FROM shop_orders WHERE customer_id=$1 AND client_key=$2",[a.customer!.id,key]);
   if(old.rowCount){await client.query("COMMIT");return NextResponse.json({id:old.rows[0].id,reused:true},{headers:noStore});}
   let addressSnapshot:Record<string,unknown>;
   if(method==="courier"||method==="transport"){
     const addresses=await client.query(`SELECT recipient,phone,city,street,building,apartment,comment
       FROM shop_customer_addresses WHERE id=$1 AND customer_id=$2`,[addressId,a.customer!.id]);
     if(!addresses.rowCount){await client.query("ROLLBACK");return bad("Адрес не найден.",404);}
     addressSnapshot=addresses.rows[0] as Record<string,unknown>;
   }else{
     // Pickup point is not assigned until the merchant confirms the request.
     addressSnapshot={recipient:contact!.recipient,phone:contact!.phone,
       city:"",street:"",building:"",apartment:"",comment:"",pickupPoint:"pending"};
   }
   const cart=await client.query<{id:string;variantId:string|null;quantity:number}>(`SELECT product_id AS id,variant_id AS "variantId",quantity
     FROM shop_customer_cart WHERE customer_id=$1 ORDER BY product_id,variant_key`,[a.customer!.id]);
   if(!cart.rows.length){await client.query("ROLLBACK");return bad("Корзина пуста.",409);}
   if(cart.rows.length>50){await client.query("ROLLBACK");return bad("Слишком много позиций.",409);}
   let total=0;
   const products:{id:string;variantId:string|null;selection:{name:string;value:string}[];title:string;priceMinor:number;quantity:number}[]=[];
   for(const line of cart.rows){
     const item=await client.query<{title:string;price_minor:string;stock_count:number;active:boolean}>(`SELECT p.title,p.price_minor::text,p.stock_count,
        (p.is_active AND c.is_active) AS active FROM shop_products p JOIN shop_categories c ON c.id=p.category_id
        WHERE p.id=$1 FOR UPDATE OF p`,[line.id]);
     if(!item.rowCount||!item.rows[0].active){
       await client.query("ROLLBACK");return bad("Товар "+line.id+" недоступен.",409);
     }
     const groups=await client.query<{variant_groups:unknown}>("SELECT variant_groups FROM shop_products WHERE id=$1",[line.id]);
     const variantMode=Array.isArray(groups.rows[0].variant_groups)&&groups.rows[0].variant_groups.length>0;
     let priceMinor=Number(item.rows[0].price_minor);
     let stock=item.rows[0].stock_count;
     let selection:{name:string;value:string}[]=[];
     if(line.variantId){
       if(!variantMode){await client.query("ROLLBACK");return bad("У товара нет вариантов.",409);}
       const variant=await client.query<{price_minor:string;stock_count:number;is_active:boolean;selection:{name:string;value:string}[]}>(`
         SELECT price_minor::text,stock_count,is_active,selection
         FROM shop_product_variants WHERE article=$1 AND product_id=$2 FOR UPDATE`,[line.variantId,line.id]);
       if(!variant.rowCount||!variant.rows[0].is_active){
         await client.query("ROLLBACK");return bad("Выбранный вариант недоступен.",409);
       }
       priceMinor=Number(variant.rows[0].price_minor);
       stock=variant.rows[0].stock_count;
       selection=variant.rows[0].selection;
     }else if(variantMode){
       await client.query("ROLLBACK");return bad("Для товара "+line.id+" сначала выберите вариант.",409);
     }
     if(stock<line.quantity){
       await client.query("ROLLBACK");return bad("Недостаточно товара или выбранного варианта.",409);
     }
     if(!Number.isSafeInteger(priceMinor)||priceMinor<0)throw Error("Invalid DB price");
     const lineTotal=priceMinor*line.quantity;
     if(!Number.isSafeInteger(total+lineTotal))throw Error("Order total outside safe limit");
     total+=lineTotal;
     products.push({id:line.id,variantId:line.variantId,selection,title:item.rows[0].title,priceMinor,quantity:line.quantity});
   }
   for(const p of products){
     if(p.variantId){
       await client.query("UPDATE shop_product_variants SET stock_count=stock_count-$1,updated_at=NOW() WHERE article=$2",[p.quantity,p.variantId]);
     }else{
       await client.query("UPDATE shop_products SET stock_count=stock_count-$1,updated_at=NOW() WHERE id=$2",[p.quantity,p.id]);
     }
   }
   const fee=deliveryPrice(method);
   const order=await client.query<{id:string}>(`INSERT INTO shop_orders
      (customer_id,client_key,total_minor,subtotal_minor,delivery_fee_minor,
        delivery_method,delivery_address,buyer_note,payment_method)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING id::text`,
      [a.customer!.id,key,total,total,fee,method,JSON.stringify(addressSnapshot),
        note.trim(),PAYMENT_METHOD]);
   for(const p of products){
     await client.query(`INSERT INTO shop_order_items(order_id,product_id,title,quantity,unit_price_minor,line_total_minor,variant_id,variant_selection)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[order.rows[0].id,p.id,p.title,p.quantity,p.priceMinor,p.priceMinor*p.quantity,p.variantId,JSON.stringify(p.selection)]);
   }
   await client.query(`INSERT INTO shop_order_events
     (order_id,kind,to_status,actor_type,note)
     VALUES($1,'created','new','customer','Заявка создана покупателем.')`,[order.rows[0].id]);
   await client.query(`INSERT INTO shop_logistics_events
     (order_id,kind,to_status,actor_type,note)
     VALUES($1,'created','awaiting_confirmation','customer','Ожидает подтверждения продавцом.')`,
     [order.rows[0].id]);
   await client.query("DELETE FROM shop_customer_cart WHERE customer_id=$1",[a.customer!.id]);
   await client.query("COMMIT");
   return NextResponse.json({id:order.rows[0].id,totalMinor:String(total),
     subtotalMinor:String(total),deliveryMethod:method,
     deliveryFeeMinor:deliveryPrice(method)===null?null:"0",
     deliveryPricePending:deliveryPrice(method)===null,
     paymentStatus:"unpaid",paymentMethod:PAYMENT_METHOD,paymentEnabled:false},
     {status:201,headers:noStore});
  }catch(err){try{await client.query("ROLLBACK");}catch{}throw err;}
  finally{client.release();}
 }catch(err){return publicError(err);}
}
