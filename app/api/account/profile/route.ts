import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,customerGuard,jsonBody,noStore,object,publicError} from "@/lib/server/customer-auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// Email is read-only until mail verification is connected.
export async function PATCH(req:NextRequest){
 try{
  const auth=await customerGuard(req,true);if(auth.response)return auth.response;
  let body:Record<string,unknown>|null;
  try{body=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
  const name=typeof body?.name==="string"?body.name.trim():"";
  if(name.length<2||name.length>120)return bad("Имя должно содержать от 2 до 120 символов.");
  const result=await getPool().query<{id:string;name:string;email:string}>(
   "UPDATE shop_customers SET name=$2 WHERE id=$1 RETURNING id::text,name,email",
   [auth.customer!.id,name]);
  if(!result.rowCount)return bad("Аккаунт не найден.",404);
  return NextResponse.json({customer:result.rows[0]},{headers:noStore});
 }catch(err){return publicError(err);}
}
