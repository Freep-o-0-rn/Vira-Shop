import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,customerGuard,jsonBody,noStore,object,publicError} from "@/lib/server/customer-auth";
export const runtime="nodejs";export const dynamic="force-dynamic";
const validProduct=(v:unknown):v is string=>typeof v==="string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const qty=(v:unknown):v is number=>typeof v==="number" && Number.isSafeInteger(v) && v>=0 && v<=99;
const SELECT=`SELECT c.product_id AS id,c.quantity,p.title,p.image_url AS image,p.price_minor::text AS "priceMinor",
  p.stock_count AS stock,(p.is_active AND cat.is_active) AS available
 FROM shop_customer_cart c JOIN shop_products p ON p.id=c.product_id
 JOIN shop_categories cat ON cat.id=p.category_id
 WHERE c.customer_id=$1 ORDER BY c.updated_at DESC`;
export async function GET(req:NextRequest){
 try{
  const a=await customerGuard(req);if(a.response)return a.response;
  const r=await getPool().query(SELECT,[a.customer!.id]);
  return NextResponse.json({items:r.rows},{headers:noStore});
 }catch(err){return publicError(err);}
}
export async function PUT(req:NextRequest){
 try{
  const a=await customerGuard(req,true);if(a.response)return a.response;
  let body:Record<string,unknown>|null;try{body=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
  if(!body || !validProduct(body.productId) || !qty(body.quantity))return bad("Некорректные параметры корзины.");
  const id=body.productId,q=body.quantity,db=getPool();
  if(q===0){
   await db.query("DELETE FROM shop_customer_cart WHERE customer_id=$1 AND product_id=$2",[a.customer!.id,id]);
  }else{
   const p=await db.query<{stock_count:number}>(`SELECT p.stock_count FROM shop_products p
     JOIN shop_categories c ON c.id=p.category_id WHERE p.id=$1 AND p.is_active AND c.is_active`,[id]);
   if(!p.rowCount)return bad("Товар недоступен.",409);
   if(p.rows[0].stock_count<q)return bad("Недостаточно товара на складе.",409);
   await db.query(`INSERT INTO shop_customer_cart(customer_id,product_id,quantity)
      VALUES($1,$2,$3) ON CONFLICT(customer_id,product_id)
      DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=NOW()`,[a.customer!.id,id,q]);
  }
  const rows=await db.query(SELECT,[a.customer!.id]);
  return NextResponse.json({items:rows.rows},{headers:noStore});
 }catch(err){return publicError(err);}
}
export async function POST(req:NextRequest){
 try{
  const a=await customerGuard(req,true);if(a.response)return a.response;
  let b:Record<string,unknown>|null;try{b=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
  if(!b||!Array.isArray(b.items)||b.items.length>50)return bad("Допускается не более 50 товаров.");
  const items=new Map<string,number>();
  for(const row of b.items){
   const v=object(row);if(!v||!validProduct(v.id)||!qty(v.quantity)||v.quantity===0)return bad("Некорректная корзина.");
   items.set(v.id,Math.max(v.quantity,items.get(v.id)||0));
  }
  const db=getPool(),client=await db.connect();
  try{
   await client.query("BEGIN");
   // One customer lock also serializes cart changes across concurrent checkout requests.
   await client.query("SELECT id FROM shop_customers WHERE id=$1 FOR UPDATE",[a.customer!.id]);
   for(const [id,quantity] of [...items].sort(([a],[b])=>a.localeCompare(b))){
    const p=await client.query<{stock_count:number}>(`SELECT p.stock_count FROM shop_products p
       JOIN shop_categories c ON c.id=p.category_id WHERE p.id=$1 AND p.is_active AND c.is_active`,[id]);
    if(!p.rowCount||p.rows[0].stock_count<quantity){
     await client.query("ROLLBACK");return bad("Товар "+id+" недоступен или его недостаточно.",409);
    }
    await client.query(`INSERT INTO shop_customer_cart(customer_id,product_id,quantity)
       VALUES($1,$2,$3) ON CONFLICT(customer_id,product_id)
       DO UPDATE SET quantity=GREATEST(shop_customer_cart.quantity,EXCLUDED.quantity),updated_at=NOW()`,
       [a.customer!.id,id,quantity]);
   }
   const count=await client.query<{n:number}>("SELECT COUNT(*)::int n FROM shop_customer_cart WHERE customer_id=$1",[a.customer!.id]);
   if(count.rows[0].n>50){await client.query("ROLLBACK");return bad("В корзине может быть максимум 50 разных товаров.",409);}
   await client.query("COMMIT");
  }catch(e){try{await client.query("ROLLBACK");}catch{}throw e;}finally{client.release();}
  const rows=await db.query(SELECT,[a.customer!.id]);
  return NextResponse.json({items:rows.rows},{headers:noStore});
 }catch(err){return publicError(err);}
}
