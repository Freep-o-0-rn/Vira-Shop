import {createHash,randomInt} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,denyCrossOrigin,emailValid,hashPassword,jsonBody,noStore,object,publicError} from "@/lib/server/customer-auth";
import {mailConfigured,sendVerificationEmail} from "@/lib/server/customer-mail";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const RESPONSE={ok:true,message:"Если аккаунт существует, письмо с кодом восстановления будет отправлено."};

// Do not reveal whether an email address has an account, is on cooldown,
// or is currently locked. Rate limits are stored for unknown emails as well.
export async function POST(req:NextRequest){
 const denied=denyCrossOrigin(req);if(denied)return denied;
 if(!mailConfigured())return bad("Восстановление доступа временно недоступно.",503);
 let body:Record<string,unknown>|null;
 try{body=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
 const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
 if(!emailValid(email))return bad("Укажите корректный email.");
 const emailHash=createHash("sha256").update(email).digest("hex");
 const code=randomInt(0,1_000_000).toString().padStart(6,"0");
 // Deliberately hash on all paths to reduce observable differences.
 const codeHash=await hashPassword(code);
 const client=await getPool().connect();
 let send=false;
 try{
  await client.query("BEGIN");
  await client.query(`INSERT INTO shop_customer_password_reset_rates
   (email_hash,window_started_at,sent_in_window,resend_after)
   VALUES($1,NOW(),0,NOW()) ON CONFLICT(email_hash) DO NOTHING`,[emailHash]);
  const q=await client.query<{cooldown:boolean;hourly:number;elapsed:boolean}>(`SELECT
   resend_after>NOW() AS cooldown,sent_in_window AS hourly,
   window_started_at<=NOW()-INTERVAL '1 hour' AS elapsed
   FROM shop_customer_password_reset_rates WHERE email_hash=$1 FOR UPDATE`,[emailHash]);
  const rate=q.rows[0];
  if(!rate.cooldown&&(rate.elapsed||rate.hourly<3)){
   await client.query(`UPDATE shop_customer_password_reset_rates SET
    resend_after=NOW()+INTERVAL '60 seconds',
    sent_in_window=CASE WHEN window_started_at<=NOW()-INTERVAL '1 hour'
     THEN 1 ELSE sent_in_window+1 END,
    window_started_at=CASE WHEN window_started_at<=NOW()-INTERVAL '1 hour'
     THEN NOW() ELSE window_started_at END WHERE email_hash=$1`,[emailHash]);
   const customer=await client.query<{id:string}>(
    "SELECT id::text FROM shop_customers WHERE lower(email)=$1",[email]);
   if(customer.rowCount){
    await client.query(`INSERT INTO shop_customer_password_resets
      (customer_id,code_hash,expires_at,failed_attempts)
      VALUES($1,$2,NOW()+INTERVAL '10 minutes',0)
      ON CONFLICT(customer_id) DO UPDATE SET
       code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,failed_attempts=0`,
     [customer.rows[0].id,codeHash]);
    send=true;
   }
  }
  await client.query("COMMIT");
 }catch(err){
  try{await client.query("ROLLBACK");}catch{}
  return publicError(err);
 }finally{client.release();}
 if(send){
  try{await sendVerificationEmail(email,code,"password-reset");}
  catch(err){
   console.error("[Vira Shop] password recovery email not sent:",
    err instanceof Error?err.message:"unknown error");
   // Do not expose account existence in the error response.
  }
 }
 return NextResponse.json(RESPONSE,{headers:noStore});
}
