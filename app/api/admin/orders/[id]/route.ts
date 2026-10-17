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
 completed:[],
 cancelled:[]
};
export async function PATCH(req:NextRequest,{params}:Ctx){
 try{
  const denied=await adminGuard(req,true);if(denied)return denied;
  const {id}=await params;
  if(!/^[0-9]{1,19}$/.test(id))return NextResponse.json({error:"Некорректный ID."},{status:400});
  let b:unknown;try{b=await readJson(req);}catch{return NextResponse.json({error:"Некорректный JSON."},{status:400});}
  if(!b||typeof b!=="object"||Array.isArray(b)||!("status" in b)||typeof b.status!=="string"||!(b.status in allowed)){
   return NextResponse.json({error:"Недопустимый статус."},{status:400});
  }
  const next=b.status;
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
    // Restore reserved inventory exactly once while order row is locked.
    const items=await client.query<{product_id:string;quantity:number}>(
      "SELECT product_id,quantity FROM shop_order_items WHERE order_id=$1 ORDER BY product_id",[id]);
    for(const item of items.rows)await client.query(
      "UPDATE shop_products SET stock_count=stock_count+$1,updated_at=NOW() WHERE id=$2",
      [item.quantity,item.product_id]);
   }
   await client.query("UPDATE shop_orders SET status=$2,updated_at=NOW() WHERE id=$1",[id,next]);
   await client.query("COMMIT");
   return NextResponse.json({id,status:next},{headers:{"Cache-Control":"no-store"}});
  }catch(err){try{await client.query("ROLLBACK");}catch{}throw err;}
  finally{client.release();}
 }catch(err){return failureResponse(err);}
}
