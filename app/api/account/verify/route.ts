import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {ensurePendingSignupCleanup,pruneExpiredSignups} from "@/lib/server/pending-signup";
import {bad,createCustomerSession,denyCrossOrigin,emailValid,jsonBody,noStore,object,publicError,
 setCustomerCookie,verifyPassword} from "@/lib/server/customer-auth";
import {verificationEnabled} from "@/lib/server/customer-mail";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(req:NextRequest){
 const denied=denyCrossOrigin(req);if(denied)return denied;
 if(!verificationEnabled())return bad("Подтверждение почты не включено.",404);
 let body:Record<string,unknown>|null;
 try{body=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
 const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
 const code=typeof body?.code==="string"?body.code.trim():"";
 if(!emailValid(email)||!/^[0-9]{6}$/.test(code))return bad("Введите шестизначный код из письма.");

 ensurePendingSignupCleanup();
 try{await pruneExpiredSignups();}catch(err){return publicError(err);}
 const client=await getPool().connect();
 let id:string;
 let name:string;
 try{
  await client.query("BEGIN");
  const pending=await client.query<{name:string;password_hash:string;code_hash:string;expired:boolean;failed_attempts:number}>(
   `SELECT name,password_hash,code_hash,expires_at<NOW() AS expired,failed_attempts
     FROM shop_customer_signup_codes WHERE email=$1 AND expires_at>NOW() FOR UPDATE`,[email]);
  const row=pending.rows[0];
  if(!row){await client.query("ROLLBACK");return bad("Код подтверждения истёк или регистрация не найдена. Запросите новый код, если 30 минут ещё не прошли.",410);}
  if(row.expired){await client.query("ROLLBACK");return bad("Срок действия кода истёк. Запросите новый.",410);}
  if(row.failed_attempts>=5){await client.query("ROLLBACK");return bad("Слишком много попыток. Запросите новый код.",429);}
  if(!(await verifyPassword(code,row.code_hash))){
   await client.query("UPDATE shop_customer_signup_codes SET failed_attempts=failed_attempts+1 WHERE email=$1",[email]);
   await client.query("COMMIT");return bad("Неверный код. Проверьте письмо и повторите попытку.",400);
  }
  const created=await client.query<{id:string}>(
   "INSERT INTO shop_customers(email,name,password_hash) VALUES($1,$2,$3) RETURNING id::text",
   [email,row.name,row.password_hash]);
  id=created.rows[0].id;
  name=row.name;
  await client.query("DELETE FROM shop_customer_signup_codes WHERE email=$1",[email]);
  await client.query("COMMIT");
 }catch(err){
  try{await client.query("ROLLBACK");}catch{}
  if(typeof err==="object"&&err!==null&&"code" in err&&err.code==="23505")
   return bad("Аккаунт с этим email уже существует.",409);
  return publicError(err);
 }finally{client.release();}
 try{
  const token=await createCustomerSession(id);
  const response=NextResponse.json({customer:{id,email,name}},{
   status:201,headers:noStore
  });
  setCustomerCookie(response,token);
  return response;
 }catch(err){return publicError(err);}
}
