import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,denyCrossOrigin,emailValid,jsonBody,noStore,object,publicError} from "@/lib/server/customer-auth";
import {ensurePendingSignupCleanup,pruneExpiredSignups,resumeHash,validResumeToken} from "@/lib/server/pending-signup";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// Only a browser with the secret issued at signup may resume the pending flow.
export async function POST(req:NextRequest){
 const denied=denyCrossOrigin(req);if(denied)return denied;
 let b:Record<string,unknown>|null;
 try{b=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
 const email=typeof b?.email==="string"?b.email.trim().toLowerCase():"";
 const token=b?.resumeToken;
 if(!emailValid(email)||!validResumeToken(token))return bad("Недопустимые данные регистрации.");
 try{
  ensurePendingSignupCleanup();
  await pruneExpiredSignups();
  const r=await getPool().query<{
   registrationseconds:number;codeseconds:number;resendseconds:number
  }>(`SELECT
      GREATEST(0,CEIL(EXTRACT(EPOCH FROM (registration_expires_at-NOW()))))::int AS registrationseconds,
      GREATEST(0,CEIL(EXTRACT(EPOCH FROM (expires_at-NOW()))))::int AS codeseconds,
      GREATEST(0,CEIL(EXTRACT(EPOCH FROM (resend_after-NOW()))))::int AS resendseconds
     FROM shop_customer_signup_codes
     WHERE email=$1 AND resume_token_hash=$2 AND (registration_expires_at>NOW() OR expires_at>NOW())`,
    [email,resumeHash(token)]);
  const row=r.rows[0];
  if(!row)return NextResponse.json({pending:false},{headers:noStore});
  return NextResponse.json({
   pending:true,email,registrationExpiresInSeconds:row.registrationseconds,
   verificationGraceSeconds:Math.max(row.registrationseconds,row.codeseconds),
   canResend:row.registrationseconds>0,
   codeExpiresInSeconds:row.codeseconds,resendAfterSeconds:row.resendseconds
  },{headers:noStore});
 }catch(err){return publicError(err);}
}
