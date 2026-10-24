import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,clearCustomerCookie,denyCrossOrigin,emailValid,hashPassword,jsonBody,noStore,object,publicError,verifyPassword} from "@/lib/server/customer-auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const INVALID="Неверный или просроченный код. Запросите новое письмо, если срок истёк.";

export async function POST(req:NextRequest){
 const denied=denyCrossOrigin(req);if(denied)return denied;
 let body:Record<string,unknown>|null;
 try{body=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
 const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
 const code=typeof body?.code==="string"?body.code.trim():"";
 const password=body?.newPassword;
 if(!emailValid(email)||!/^[0-9]{6}$/.test(code))return bad(INVALID);
 if(typeof password!=="string"||password.length<8||password.length>256)
  return bad("Новый пароль должен содержать от 8 до 256 символов.");
 const pool=getPool();
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const found=await client.query<{id:string}>(
   "SELECT id::text FROM shop_customers WHERE lower(email)=$1 FOR UPDATE",[email]);
  if(!found.rowCount){await client.query("ROLLBACK");return bad(INVALID);}
  const id=found.rows[0].id;
  const pending=await client.query<{code_hash:string;valid:boolean;failed_attempts:number}>(`
   SELECT code_hash,expires_at>NOW() AS valid,failed_attempts
   FROM shop_customer_password_resets WHERE customer_id=$1 FOR UPDATE`,[id]);
  const reset=pending.rows[0];
  if(!reset||!reset.valid||reset.failed_attempts>=5){
   await client.query("ROLLBACK");return bad(INVALID);
  }
  if(!(await verifyPassword(code,reset.code_hash))){
   await client.query("UPDATE shop_customer_password_resets SET failed_attempts=failed_attempts+1 WHERE customer_id=$1",[id]);
   await client.query("COMMIT");return bad(INVALID);
  }
  const passwordHash=await hashPassword(password);
  await client.query(`UPDATE shop_customers SET password_hash=$2,failed_attempts=0,locked_until=NULL WHERE id=$1`,
   [id,passwordHash]);
  await client.query("DELETE FROM shop_customer_sessions WHERE customer_id=$1",[id]);
  await client.query("DELETE FROM shop_customer_password_resets WHERE customer_id=$1",[id]);
  await client.query("COMMIT");
  const response=NextResponse.json({ok:true,reloginRequired:true},{headers:noStore});
  clearCustomerCookie(response);
  return response;
 }catch(err){
  try{await client.query("ROLLBACK");}catch{}
  return publicError(err);
 }finally{client.release();}
}
