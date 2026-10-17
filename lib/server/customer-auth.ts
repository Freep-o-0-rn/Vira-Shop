import {createHash,randomBytes} from "node:crypto";
import {cookies} from "next/headers";
import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {denyCrossOrigin, hashPassword, verifyPassword} from "@/lib/server/admin-auth";

export {denyCrossOrigin,hashPassword,verifyPassword};
export const CUSTOMER_COOKIE="vira_customer_session";
const TOKEN_TTL=60*60*24*7;

function digest(token:string){return createHash("sha256").update(token).digest("hex")}
export type Customer={id:string;name:string;email:string};
export async function customerByToken(token:string|undefined):Promise<Customer|null>{
 if(!token || !/^[a-f0-9]{64}$/.test(token))return null;
 const r=await getPool().query<Customer>(
  `SELECT c.id::text,c.name,c.email FROM shop_customer_sessions s
    JOIN shop_customers c ON c.id=s.customer_id
    WHERE s.token_hash=$1 AND s.expires_at>NOW()`,[digest(token)]);
 return r.rows[0]??null;
}
export async function currentCustomer():Promise<Customer|null>{
 return customerByToken((await cookies()).get(CUSTOMER_COOKIE)?.value);
}
export async function fromRequest(req:NextRequest):Promise<Customer|null>{
 return customerByToken(req.cookies.get(CUSTOMER_COOKIE)?.value);
}
export async function createCustomerSession(id:string):Promise<string>{
 const token=randomBytes(32).toString("hex");
 await getPool().query("INSERT INTO shop_customer_sessions(token_hash,customer_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '7 days')",[digest(token),id]);
 return token;
}
export async function deleteCustomerSession(token:string|undefined):Promise<void>{
 if(token && /^[a-f0-9]{64}$/.test(token))await getPool().query("DELETE FROM shop_customer_sessions WHERE token_hash=$1",[digest(token)]);
}
export function setCustomerCookie(res:NextResponse,token:string){
 res.cookies.set(CUSTOMER_COOKIE,token,{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/",maxAge:TOKEN_TTL});
}
export function clearCustomerCookie(res:NextResponse){
 res.cookies.set(CUSTOMER_COOKIE,"",{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",path:"/",maxAge:0});
}
export async function customerGuard(req:NextRequest,mutate=false){
 if(mutate){const denied=denyCrossOrigin(req);if(denied)return {customer:null,response:denied};}
 const customer=await fromRequest(req);
 if(!customer)return {customer:null,response:NextResponse.json({error:"Необходимо войти в аккаунт."},{status:401})};
 return {customer,response:null};
}
export const noStore={"Cache-Control":"no-store"};
export function publicError(err:unknown){
 console.error("[Vira Shop] customer request failed:",err);
 return NextResponse.json({error:"Временная ошибка сервера."},{status:503,headers:noStore});
}
export function bad(message:string,status=400){
 return NextResponse.json({error:message},{status,headers:noStore});
}
export function emailValid(value:unknown):value is string {
 return typeof value==="string" && value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
export function passwordValid(value:unknown):value is string{
 return typeof value==="string"&&value.length>=12&&value.length<=256;
}
export async function jsonBody(req:Request,maxBytes=12000):Promise<unknown>{
 const length=Number(req.headers.get("content-length")||0);
 if(length>maxBytes)throw new Error("Request body too large");
 const raw=await req.text();
 if(Buffer.byteLength(raw,"utf8")>maxBytes)throw new Error("Request body too large");
 return JSON.parse(raw);
}
export function object(value:unknown):Record<string,unknown>|null{
 return value && typeof value==="object" && !Array.isArray(value)?value as Record<string,unknown>:null;
}
