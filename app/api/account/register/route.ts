import {randomBytes,randomInt} from "node:crypto";
import {ensurePendingSignupCleanup,pruneExpiredSignups,resumeHash} from "@/lib/server/pending-signup";
import {sendVerificationEmail,verificationEnabled,verificationReady} from "@/lib/server/customer-mail";
import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,createCustomerSession,denyCrossOrigin,emailValid,hashPassword,jsonBody,noStore,object,passwordValid,publicError,setCustomerCookie} from "@/lib/server/customer-auth";
export const runtime="nodejs";
export async function POST(req:NextRequest){
 const denied=denyCrossOrigin(req);if(denied)return denied;
 let b:Record<string,unknown>|null;
 try{b=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
 if(!b)return bad("Заполните поля.");
 const email=typeof b.email==="string"?b.email.trim().toLowerCase():"";
 const name=typeof b.name==="string"?b.name.trim():"";
 if(!emailValid(email)||name.length<2||name.length>120||!passwordValid(b.password))
  return bad("Введите имя (2–120 символов), email и пароль от 6 символов.");

 if(verificationEnabled()){
  if(!verificationReady())return bad("Подтверждение почты ещё не настроено. Попробуйте позже.",503);
  if((b.password as string).length<8)return bad("Пароль должен содержать не менее 8 символов.");
  const code=randomInt(0,1000000).toString().padStart(6,"0");
  const resumeToken=randomBytes(32).toString("hex");
  const resumeTokenHash=resumeHash(resumeToken);
  const hashedPassword=await hashPassword(b.password as string);
  const hashedCode=await hashPassword(code);
  ensurePendingSignupCleanup();
  await pruneExpiredSignups();
  let registrationSeconds=1800;
  let codeSeconds=600;
  const client=await getPool().connect();
  try{
   await client.query("BEGIN");
   const registered=await client.query("SELECT id FROM shop_customers WHERE lower(email)=$1",[email]);
   if(registered.rowCount){
    await client.query("ROLLBACK");return bad("Этот email уже зарегистрирован.",409);
   }
   const previous=await client.query<{cooldown:boolean;hourly:number;elapsed:boolean}>(
    `SELECT resend_after>NOW() AS cooldown,sent_in_window AS hourly,
      window_started_at<NOW()-INTERVAL '1 hour' AS elapsed
      FROM shop_customer_signup_codes WHERE email=$1 FOR UPDATE`,[email]);
   if(previous.rowCount && previous.rows[0].cooldown){
    await client.query("ROLLBACK");return bad("Повторный код можно запросить через 60 секунд.",429);
   }
   if(previous.rowCount && !previous.rows[0].elapsed && previous.rows[0].hourly>=5){
    await client.query("ROLLBACK");return bad("Слишком много запросов. Попробуйте через час.",429);
   }
   const inserted=await client.query<{registration_seconds:number;code_seconds:number}>(`INSERT INTO shop_customer_signup_codes
    (email,name,password_hash,code_hash,expires_at,resend_after,window_started_at,sent_in_window,failed_attempts,resume_token_hash,registration_expires_at)
    VALUES($1,$2,$3,$4,NOW()+INTERVAL '10 minutes',NOW()+INTERVAL '60 seconds',NOW(),1,0,$5,NOW()+INTERVAL '30 minutes')
    ON CONFLICT(email) DO UPDATE SET
     name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,code_hash=EXCLUDED.code_hash,
     resume_token_hash=EXCLUDED.resume_token_hash,
     registration_expires_at=shop_customer_signup_codes.registration_expires_at,
     expires_at=LEAST(EXCLUDED.expires_at,shop_customer_signup_codes.registration_expires_at),
     resend_after=EXCLUDED.resend_after,failed_attempts=0,
     sent_in_window=CASE WHEN shop_customer_signup_codes.window_started_at<NOW()-INTERVAL '1 hour'
      THEN 1 ELSE shop_customer_signup_codes.sent_in_window+1 END,
     window_started_at=CASE WHEN shop_customer_signup_codes.window_started_at<NOW()-INTERVAL '1 hour'
      THEN NOW() ELSE shop_customer_signup_codes.window_started_at END
    RETURNING
      GREATEST(0,CEIL(EXTRACT(EPOCH FROM (registration_expires_at-NOW()))))::int AS registration_seconds,
      GREATEST(0,CEIL(EXTRACT(EPOCH FROM (expires_at-NOW()))))::int AS code_seconds`,
    [email,name,hashedPassword,hashedCode,resumeTokenHash]);
   registrationSeconds=inserted.rows[0].registration_seconds;
   codeSeconds=inserted.rows[0].code_seconds;
   await client.query("COMMIT");
  }catch(err){
   try{await client.query("ROLLBACK");}catch{}
   return publicError(err);
  }finally{client.release();}
  try{await sendVerificationEmail(email,code);}
  catch(err){
   console.error("[Vira Shop] SMTP delivery failed:",err instanceof Error?err.message:"unknown error");
   // Allow another request when a connection failure prevented sending.
   await getPool().query("UPDATE shop_customer_signup_codes SET resend_after=NOW() WHERE email=$1 AND code_hash=$2",
    [email,hashedCode]).catch(()=>{});
   return bad("Не удалось отправить код. Проверьте адрес и повторите попытку.",503);
  }
  return NextResponse.json({verificationRequired:true,email,resumeToken,expiresInSeconds:codeSeconds,registrationExpiresInSeconds:registrationSeconds},
   {status:202,headers:noStore});
 }
 try{
  const hash=await hashPassword(b.password);
  const res=await getPool().query<{id:string}>(
    "INSERT INTO shop_customers(email,name,password_hash) VALUES($1,$2,$3) RETURNING id::text",
    [email,name,hash]);
  const token=await createCustomerSession(res.rows[0].id);
  const response=NextResponse.json({ok:true},{status:201,headers:noStore});
  setCustomerCookie(response,token);return response;
 }catch(err){
  if(typeof err==="object"&&err!==null&&"code" in err&&err.code==="23505")return bad("Этот email уже зарегистрирован.",409);
  return publicError(err);
 }
}
