import {createHash} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,denyCrossOrigin,emailValid,jsonBody,noStore,object,publicError} from "@/lib/server/customer-auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// A temporary secret returned only to the initiating browser proves ownership
// of this pending signup. Email alone must never authorize cancellation.
export async function POST(req:NextRequest){
 const denied=denyCrossOrigin(req);if(denied)return denied;
 let body:Record<string,unknown>|null;
 try{body=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
 const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
 const token=typeof body?.cancelToken==="string"?body.cancelToken:"";
 if(!emailValid(email)||!/^[a-f0-9]{64}$/.test(token))
  return bad("Не удалось подтвердить отмену регистрации.");
 try{
  const hash=createHash("sha256").update(token).digest("hex");
  // Erase the pending name, password hash and verification code immediately.
  // Retain only email and the send-rate window until routine expiry cleanup,
  // otherwise cancelling/restarting could bypass the per-address SMTP quota.
  const result=await getPool().query(
   `UPDATE shop_customer_signup_codes SET
     name='Отменена',password_hash='',code_hash='',cancel_token_hash=NULL,
     expires_at=NOW()-INTERVAL '1 second',failed_attempts=0
     WHERE email=$1 AND cancel_token_hash=$2 AND expires_at>NOW()
     RETURNING email`,
   [email,hash]);
  // A cancelled or expired signup can never be verified or used to log in.
  return NextResponse.json({cancelled:result.rowCount===1},{headers:noStore});
 }catch(err){return publicError(err);}
}
