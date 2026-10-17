import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,clearCustomerCookie,createCustomerSession,currentCustomer,customerGuard,deleteCustomerSession,emailValid,fromRequest,jsonBody,noStore,object,passwordValid,publicError,setCustomerCookie,hashPassword,verifyPassword,denyCrossOrigin,CUSTOMER_COOKIE} from "@/lib/server/customer-auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 try {const customer=await currentCustomer();return NextResponse.json({customer},{headers:noStore});}
 catch(err){return publicError(err);}
}
export async function POST(req:NextRequest){
 const origin=denyCrossOrigin(req);if(origin)return origin;
 let input:Record<string,unknown>|null;
 try{input=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
 if(!input)return bad("Передайте логин и пароль.");
 const email=typeof input.email==="string"?input.email.trim().toLowerCase():"";
 if(!emailValid(email)||!passwordValid(input.password))return bad("Укажите корректный email и пароль от 12 символов.");
 const client=await getPool().connect().catch(()=>null);
 if(!client)return bad("База данных недоступна.",503);
 try{
  await client.query("BEGIN");
  const rows=await client.query<{id:string;name:string;email:string;password_hash:string;failed_attempts:number;locked:boolean}>(
   "SELECT id::text,name,email,password_hash,failed_attempts,locked_until>NOW() AS locked FROM shop_customers WHERE lower(email)=$1 FOR UPDATE",[email]);
  const customer=rows.rows[0];
  if(!customer){await client.query("COMMIT");return bad("Неверный email или пароль.",401);}
  if(customer.locked){await client.query("COMMIT");return bad("Вход временно заблокирован. Повторите через 15 минут.",429);}
  if(!(await verifyPassword(input.password,customer.password_hash))){
   const attempts=customer.failed_attempts+1;
   await client.query("UPDATE shop_customers SET failed_attempts=$2,locked_until=CASE WHEN $2>=5 THEN NOW()+INTERVAL '15 minutes' ELSE NULL END WHERE id=$1",
    [customer.id,attempts>=5?5:attempts]);
   await client.query("COMMIT");return bad("Неверный email или пароль.",401);
  }
  await client.query("UPDATE shop_customers SET failed_attempts=0,locked_until=NULL WHERE id=$1",[customer.id]);
  await client.query("COMMIT");
  const token=await createCustomerSession(customer.id);
  const res=NextResponse.json({customer:{id:customer.id,email:customer.email,name:customer.name}},{headers:noStore});
  setCustomerCookie(res,token);
  return res;
 }catch(err){try{await client.query("ROLLBACK");}catch{}return publicError(err);}
 finally{client.release();}
}
export async function DELETE(req:NextRequest){
 const origin=denyCrossOrigin(req);if(origin)return origin;
 try{
  await deleteCustomerSession(req.cookies.get(CUSTOMER_COOKIE)?.value);
  const res=NextResponse.json({ok:true},{headers:noStore});clearCustomerCookie(res);return res;
 }catch(err){return publicError(err);}
}
