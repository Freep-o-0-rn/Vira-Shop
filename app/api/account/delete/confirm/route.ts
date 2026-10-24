import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,clearCustomerCookie,customerGuard,jsonBody,noStore,object,publicError,verifyPassword} from "@/lib/server/customer-auth";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// Irreversible action: authentication cookie + emailed single-use code required.
export async function POST(req:NextRequest){
 try{
  const auth=await customerGuard(req,true);if(auth.response)return auth.response;
  let input:Record<string,unknown>|null;
  try{input=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
  const code=typeof input?.code==="string"?input.code.trim():"";
  if(!/^\d{6}$/.test(code))return bad("Введите шестизначный код из письма.");
  if(input?.confirm!==true)return bad("Подтвердите своё согласие на удаление аккаунта.");

  const client=await getPool().connect();
  try{
   await client.query("BEGIN");
   const id=auth.customer!.id;
   const found=await client.query("SELECT id FROM shop_customers WHERE id=$1 FOR UPDATE",[id]);
   if(!found.rowCount){await client.query("ROLLBACK");return bad("Аккаунт не найден.",404);}
   const active=await client.query<{count:number}>(
    "SELECT COUNT(*)::int AS count FROM shop_orders WHERE customer_id=$1 AND status NOT IN ('completed','cancelled')",[id]);
   if(active.rows[0].count>0){
    await client.query("ROLLBACK");
    return bad("Есть незавершённые заказы. Сначала дождитесь завершения или отмены.",409);
   }
   const codes=await client.query<{code_hash:string;expired:boolean;failed_attempts:number}>(
    `SELECT code_hash,expires_at<NOW() AS expired,failed_attempts
      FROM shop_customer_deletion_codes WHERE customer_id=$1 FOR UPDATE`,[id]);
   const pending=codes.rows[0];
   if(!pending){await client.query("ROLLBACK");return bad("Запросите письмо с кодом удаления.",400);}
   if(pending.expired){await client.query("ROLLBACK");return bad("Код истёк. Запросите новое письмо.",410);}
   if(pending.failed_attempts>=5){await client.query("ROLLBACK");return bad("Попытки исчерпаны. Запросите новый код.",429);}
   if(!(await verifyPassword(code,pending.code_hash))){
    await client.query("UPDATE shop_customer_deletion_codes SET failed_attempts=failed_attempts+1 WHERE customer_id=$1",[id]);
    await client.query("COMMIT");
    return bad("Неверный код. Проверьте письмо.",400);
   }
   // Cascades remove address book, sessions, cart and pending deletion code.
   // Completed/cancelled order records stay; their owner becomes NULL.
   await client.query("DELETE FROM shop_customers WHERE id=$1",[id]);
   await client.query("COMMIT");
   const response=NextResponse.json({ok:true,deleted:true},{headers:noStore});
   clearCustomerCookie(response);
   return response;
  }catch(err){
   try{await client.query("ROLLBACK");}catch{}
   return publicError(err);
  }finally{client.release();}
 }catch(err){return publicError(err);}
}
