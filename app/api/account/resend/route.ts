import {randomInt} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {ensurePendingSignupCleanup,pruneExpiredSignups,resumeHash,validResumeToken} from "@/lib/server/pending-signup";
import {bad,denyCrossOrigin,emailValid,hashPassword,jsonBody,noStore,object,publicError} from "@/lib/server/customer-auth";
import {sendVerificationEmail,verificationReady} from "@/lib/server/customer-mail";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(req:NextRequest){
 const denied=denyCrossOrigin(req);if(denied)return denied;
 if(!verificationReady())return bad("Отправка кодов сейчас недоступна.",503);
 let b:Record<string,unknown>|null;
 try{b=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
 const email=typeof b?.email==="string"?b.email.trim().toLowerCase():"";
 const token=b?.resumeToken;
 if(!emailValid(email)||!validResumeToken(token))return bad("Данные регистрации недействительны.");
 ensurePendingSignupCleanup();
 try{await pruneExpiredSignups();}catch(err){return publicError(err);}
 const code=randomInt(0,1000000).toString().padStart(6,"0");
 const hash=await hashPassword(code);
 let rowRemaining=0;
 const client=await getPool().connect();
 try{
  await client.query("BEGIN");
  const row=await client.query<{cooldown:boolean;hourly:number;elapsed:boolean;remaining:number}>(
    `SELECT resend_after>NOW() AS cooldown,sent_in_window AS hourly,
       window_started_at<NOW()-INTERVAL '1 hour' AS elapsed,
       GREATEST(0,CEIL(EXTRACT(EPOCH FROM (registration_expires_at-NOW()))))::int AS remaining
       FROM shop_customer_signup_codes WHERE email=$1 AND resume_token_hash=$2
       AND registration_expires_at>NOW() FOR UPDATE`,[email,resumeHash(token)]);
  if(!row.rowCount){await client.query("ROLLBACK");return bad("Регистрация истекла. Заполните форму ещё раз.",410);}
  rowRemaining=row.rows[0].remaining;
  if(row.rows[0].cooldown){await client.query("ROLLBACK");return bad("Новое письмо доступно через 60 секунд.",429);}
  if(!row.rows[0].elapsed&&row.rows[0].hourly>=5){
   await client.query("ROLLBACK");return bad("Лимит писем на этот адрес исчерпан. Повторите через час.",429);
  }
  await client.query(`UPDATE shop_customer_signup_codes SET code_hash=$2,
    expires_at=LEAST(NOW()+INTERVAL '10 minutes',registration_expires_at),
    resend_after=NOW()+INTERVAL '60 seconds',
    failed_attempts=0,
    sent_in_window=CASE WHEN window_started_at<NOW()-INTERVAL '1 hour' THEN 1 ELSE sent_in_window+1 END,
    window_started_at=CASE WHEN window_started_at<NOW()-INTERVAL '1 hour' THEN NOW() ELSE window_started_at END
    WHERE email=$1 AND resume_token_hash=$3`,[email,hash,resumeHash(token)]);
  await client.query("COMMIT");
 }catch(err){
  try{await client.query("ROLLBACK");}catch{}
  return publicError(err);
 }finally{client.release();}
 try{await sendVerificationEmail(email,code);}
 catch(err){
  console.error("[Vira Shop] SMTP resend failed:",err instanceof Error?err.message:"unknown");
  await getPool().query("UPDATE shop_customer_signup_codes SET resend_after=NOW() WHERE email=$1 AND code_hash=$2",
   [email,hash]).catch(()=>{});
  return bad("Не удалось отправить код. Повторите попытку.",503);
 }
 return NextResponse.json({ok:true,expiresInSeconds:Math.min(600,rowRemaining),registrationExpiresInSeconds:rowRemaining},{headers:noStore});
}
