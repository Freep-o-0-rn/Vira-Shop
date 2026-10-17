import {NextRequest,NextResponse} from "next/server";
import {adminGuard,readJson} from "@/lib/server/admin-guard";
import {failureResponse} from "@/lib/server/admin-auth";
import {getPool} from "@/lib/server/db";
export const runtime="nodejs";export const dynamic="force-dynamic";
type Ctx={params:Promise<{id:string}>};
const allowed:Record<string,string[]>={
 new:["confirmed","cancelled"],
 confirmed:["packing","cancelled"],
 packing:["shipped","cancelled"],
 shipped:["completed"],
 completed:[],cancelled:[]
};
const noStore={"Cache-Control":"no-store"};
const validId=(s:string)=>/^[0-9]{1,19}$/.test(s);

export async function GET(req:NextRequest,{params}:Ctx){
 try{
  const denied=await adminGuard(req);if(denied)return denied;
  const {id}=await params;
  if(!validId(id))return NextResponse.json({error:"Некорректный номер заказа."},{status:400});
  const pool=getPool();
  const result=await pool.query(`SELECT o.id::text,o.status,o.payment_status AS "paymentStatus",
    o.payment_method AS "paymentMethod",o.currency,o.total_minor::text AS "totalMinor",
    o.subtotal_minor::text AS "subtotalMinor",
    o.delivery_method AS "deliveryMethod",
    o.delivery_fee_minor::text AS "deliveryFeeMinor",
    o.delivery_address AS address,o.buyer_note AS note,
    o.created_at AS "createdAt",o.updated_at AS "updatedAt",
    c.name AS "customerName",c.email AS "customerEmail"
    FROM shop_orders o JOIN shop_customers c ON c.id=o.customer_id
    WHERE o.id=$1`,[id]);
  if(!result.rowCount)return NextResponse.json({error:"Заказ не найден."},{status:404});
  const [items,history]=await Promise.all([
   pool.query(`SELECT product_id AS id,title,variant_id AS "variantId",
     variant_selection AS selection,quantity,
     unit_price_minor::text AS "unitMinor",line_total_minor::text AS "lineMinor"
     FROM shop_order_items WHERE order_id=$1 ORDER BY id`,[id]),
   pool.query(`SELECT id::text,kind,from_status AS "fromStatus",to_status AS "toStatus",
     actor_type AS actor,note,created_at AS "createdAt"
     FROM shop_order_events WHERE order_id=$1 ORDER BY id`,[id])
  ]);
  return NextResponse.json({order:{...result.rows[0],items:items.rows,history:history.rows}},
   {headers:noStore});
 }catch(err){return failureResponse(err);}
}
export async function PATCH(req:NextRequest,{params}:Ctx){
 try{
  const denied=await adminGuard(req,true);if(denied)return denied;
  const {id}=await params;
  if(!validId(id))return NextResponse.json({error:"Некорректный номер заказа."},{status:400});
  let b:unknown;try{b=await readJson(req);}catch{return NextResponse.json({error:"Некорректный JSON."},{status:400});}
  if(!b||typeof b!=="object"||Array.isArray(b))return NextResponse.json({error:"Недопустимый запрос."},{status:400});
  const input=b as Record<string,unknown>;
  if(typeof input.status!=="string"||!(input.status in allowed)||
    (input.note!==undefined&&(typeof input.note!=="string"||input.note.trim().length>500))){
    return NextResponse.json({error:"Недопустимый статус или комментарий."},{status:400});
  }
  const next=input.status,note=typeof input.note==="string"?input.note.trim():"";
  const client=await getPool().connect();
  try{
   await client.query("BEGIN");
   const current=await client.query<{status:string}>("SELECT status FROM shop_orders WHERE id=$1 FOR UPDATE",[id]);
   if(!current.rowCount){await client.query("ROLLBACK");return NextResponse.json({error:"Заказ не найден."},{status:404});}
   const before=current.rows[0].status;
   if(!allowed[before]?.includes(next)){
    await client.query("ROLLBACK");return NextResponse.json({error:"Недопустимый переход статуса."},{status:409});
   }
   if(next==="cancelled"){
    // Locking the order makes reservation restoration exactly-once even on a
    // repeated or concurrent administrative request.
    const items=await client.query<{product_id:string;variant_id:string|null;quantity:number}>(
      "SELECT product_id,variant_id,quantity FROM shop_order_items WHERE order_id=$1 ORDER BY product_id,variant_id",[id]);
    for(const item of items.rows){
     if(item.variant_id)await client.query(
       "UPDATE shop_product_variants SET stock_count=stock_count+$1,updated_at=NOW() WHERE article=$2",
       [item.quantity,item.variant_id]);
     else await client.query(
       "UPDATE shop_products SET stock_count=stock_count+$1,updated_at=NOW() WHERE id=$2",
       [item.quantity,item.product_id]);
    }
   }
   await client.query("UPDATE shop_orders SET status=$2,updated_at=NOW() WHERE id=$1",[id,next]);
   await client.query(`INSERT INTO shop_order_events
     (order_id,kind,from_status,to_status,actor_type,note)
     VALUES($1,'status_changed',$2,$3,'admin',$4)`,[id,before,next,note]);
   await client.query("COMMIT");
   return NextResponse.json({id,status:next,previousStatus:before},{headers:noStore});
  }catch(err){try{await client.query("ROLLBACK");}catch{}throw err;}
  finally{client.release();}
 }catch(err){return failureResponse(err);}
}
