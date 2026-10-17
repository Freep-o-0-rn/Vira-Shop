import {NextRequest,NextResponse} from "next/server";
import {adminGuard,readJson} from "@/lib/server/admin-guard";
import {failureResponse} from "@/lib/server/admin-auth";
import {getPool} from "@/lib/server/db";
import {isId} from "@/lib/server/admin-validation";
export const runtime="nodejs";export const dynamic="force-dynamic";
const isObj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
type Bulk={ids:string[];action:"price"|"stock"|"visibility";price?:number;stock?:number;active?:boolean};
function parse(v:unknown):Bulk|null{
 if(!isObj(v)||!Array.isArray(v.ids)||v.ids.length<1||v.ids.length>100||
    v.ids.some(id=>!isId(id))||new Set(v.ids).size!==v.ids.length)return null;
 if(v.action==="price"){
   const val=v.price;
   if(typeof val!=="number"||!Number.isSafeInteger(Math.round(val*100))||
      !Number.isFinite(val)||val<0||val>9000000000||
      Math.abs(val*100-Math.round(val*100))>0.00001)return null;
   return {ids:v.ids,action:"price",price:Math.round(val*100)};
 }
 if(v.action==="stock"){
   const val=v.stock;
   if(typeof val!=="number"||!Number.isSafeInteger(val)||val<0||val>100000000)return null;
   return {ids:v.ids,action:"stock",stock:val};
 }
 if(v.action==="visibility"){
   if(typeof v.active!=="boolean")return null;
   return {ids:v.ids,action:"visibility",active:v.active};
 }
 return null;
}
export async function PATCH(request:NextRequest){
 try{
  const denied=await adminGuard(request,true);if(denied)return denied;
  let body:unknown;try{body=await readJson(request);}catch{return NextResponse.json({error:"Некорректный JSON."},{status:400});}
  const data=parse(body);
  if(!data)return NextResponse.json({error:"Некорректные параметры. Выберите 1–100 уникальных товаров."},{status:400});
  const client=await getPool().connect();
  try{
    await client.query("BEGIN");
    const rows=await client.query<{id:string;has_variants:boolean}>(`SELECT id,
      (variant_groups <> '[]'::jsonb) AS has_variants FROM shop_products
      WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE`,[data.ids]);
    if(rows.rows.length!==data.ids.length){
      await client.query("ROLLBACK");
      return NextResponse.json({error:"Один или несколько товаров не найдены. Изменения не применены."},{status:404});
    }
    if(data.action!=="visibility"&&rows.rows.some(p=>p.has_variants)){
      await client.query("ROLLBACK");
      return NextResponse.json({error:"У товаров с вариантами цены и остатки редактируются отдельно по комбинациям. Ничего не изменено."},{status:409});
    }
    if(data.action==="price")await client.query(
      "UPDATE shop_products SET price_minor=$2,updated_at=NOW() WHERE id=ANY($1::text[])",
      [data.ids,data.price]);
    if(data.action==="stock")await client.query(
      "UPDATE shop_products SET stock_count=$2,updated_at=NOW() WHERE id=ANY($1::text[])",
      [data.ids,data.stock]);
    if(data.action==="visibility")await client.query(
      "UPDATE shop_products SET is_active=$2,updated_at=NOW() WHERE id=ANY($1::text[])",
      [data.ids,data.active]);
    await client.query("COMMIT");
    return NextResponse.json({updated:rows.rows.length,action:data.action});
  }catch(err){try{await client.query("ROLLBACK");}catch{}throw err;}finally{client.release();}
 }catch(err){return failureResponse(err);}
}
