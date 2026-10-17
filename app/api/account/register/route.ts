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
