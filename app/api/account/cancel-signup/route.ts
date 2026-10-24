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
  const result=await getPool().query(
   "DELETE FROM shop_customer_signup_codes WHERE email=$1 AND cancel_token_hash=$2 RETURNING email",
   [email,hash]);
  // Same response whether a pending signup has expired or does not exist.
  return NextResponse.json({cancelled:result.rowCount===1},{headers:noStore});
 }catch(err){return publicError(err);}
}
