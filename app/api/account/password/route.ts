import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,clearCustomerCookie,CUSTOMER_COOKIE,customerGuard,hashPassword,jsonBody,noStore,object,publicError,verifyPassword} from "@/lib/server/customer-auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(req:NextRequest){
 try{
  const auth=await customerGuard(req,true);if(auth.response)return auth.response;
  let body:Record<string,unknown>|null;
  try{body=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
  const current=body?.currentPassword,newPassword=body?.newPassword;
  if(typeof current!=="string"||current.length<6||current.length>256||
     typeof newPassword!=="string"||newPassword.length<8||newPassword.length>256)
   return bad("Введите текущий пароль и новый пароль от 8 до 256 символов.");
  if(current===newPassword)return bad("Новый пароль должен отличаться от старого.");

  const client=await getPool().connect();
  try{
   await client.query("BEGIN");
   const rows=await client.query<{password_hash:string}>(
    "SELECT password_hash FROM shop_customers WHERE id=$1 FOR UPDATE",[auth.customer!.id]);
   if(!rows.rowCount){await client.query("ROLLBACK");return bad("Аккаунт не найден.",404);}
   if(!(await verifyPassword(current,rows.rows[0].password_hash))){
    await client.query("ROLLBACK");return bad("Текущий пароль неверный.",401);
   }
   const hash=await hashPassword(newPassword);
   await client.query("UPDATE shop_customers SET password_hash=$2,failed_attempts=0,locked_until=NULL WHERE id=$1",
    [auth.customer!.id,hash]);
   // Old cookies from all devices must stop working immediately.
   await client.query("DELETE FROM shop_customer_sessions WHERE customer_id=$1",[auth.customer!.id]);
   await client.query("COMMIT");
  }catch(err){try{await client.query("ROLLBACK");}catch{}throw err;}
  finally{client.release();}
  const response=NextResponse.json({ok:true,reloginRequired:true},{headers:noStore});
  clearCustomerCookie(response);
  return response;
 }catch(err){return publicError(err);}
}
