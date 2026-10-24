import {randomInt} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,customerGuard,hashPassword,noStore,publicError} from "@/lib/server/customer-auth";
import {mailConfigured,sendVerificationEmail} from "@/lib/server/customer-mail";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(req:NextRequest){
 try{
  const auth=await customerGuard(req,true);if(auth.response)return auth.response;
  if(!mailConfigured())return bad("Подтверждение по email временно недоступно.",503);
  const id=auth.customer!.id;
  const code=randomInt(0,1000000).toString().padStart(6,"0");
  const hash=await hashPassword(code);
  let recipient="";
  const client=await getPool().connect();
  try{
   await client.query("BEGIN");
   // Serialize deletion requests and other account changes.
   const c=await client.query<{email:string}>("SELECT email FROM shop_customers WHERE id=$1 FOR UPDATE",[id]);
   if(!c.rowCount){await client.query("ROLLBACK");return bad("Аккаунт не найден.",404);}
   const active=await client.query<{count:number}>(
    "SELECT COUNT(*)::int AS count FROM shop_orders WHERE customer_id=$1 AND status NOT IN ('completed','cancelled')",[id]);
   if(active.rows[0].count>0){
    await client.query("ROLLBACK");
    return bad("Есть незавершённые заказы. Удаление будет доступно после их завершения или отмены.",409);
   }
   const previous=await client.query<{cooldown:boolean;hourly:number;elapsed:boolean}>(
    `SELECT resend_after>NOW() AS cooldown,sent_in_window AS hourly,
      window_started_at<NOW()-INTERVAL '1 hour' AS elapsed
      FROM shop_customer_deletion_codes WHERE customer_id=$1 FOR UPDATE`,[id]);
   if(previous.rowCount&&previous.rows[0].cooldown){
    await client.query("ROLLBACK");return bad("Повторный запрос доступен через 60 секунд.",429);
   }
   if(previous.rowCount&&!previous.rows[0].elapsed&&previous.rows[0].hourly>=5){
    await client.query("ROLLBACK");return bad("Лимит писем исчерпан. Повторите через час.",429);
   }
   await client.query(`INSERT INTO shop_customer_deletion_codes
    (customer_id,code_hash,expires_at,resend_after,window_started_at,sent_in_window,failed_attempts)
    VALUES($1,$2,NOW()+INTERVAL '10 minutes',NOW()+INTERVAL '60 seconds',NOW(),1,0)
    ON CONFLICT(customer_id) DO UPDATE SET
     code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,
     resend_after=EXCLUDED.resend_after,failed_attempts=0,
     sent_in_window=CASE WHEN shop_customer_deletion_codes.window_started_at<NOW()-INTERVAL '1 hour'
      THEN 1 ELSE shop_customer_deletion_codes.sent_in_window+1 END,
     window_started_at=CASE WHEN shop_customer_deletion_codes.window_started_at<NOW()-INTERVAL '1 hour'
      THEN NOW() ELSE shop_customer_deletion_codes.window_started_at END`,[id,hash]);
   recipient=c.rows[0].email;
   await client.query("COMMIT");
  }catch(err){
   try{await client.query("ROLLBACK");}catch{}
   return publicError(err);
  }finally{client.release();}
  // Release the single embedded DB connection before the SMTP network request.
  try{await sendVerificationEmail(recipient,code,"account-delete");}
  catch(err){
   console.error("[Vira Shop] Account deletion SMTP failed:",err instanceof Error?err.message:"unknown");
   await getPool().query("UPDATE shop_customer_deletion_codes SET resend_after=NOW() WHERE customer_id=$1 AND code_hash=$2",
    [id,hash]).catch(()=>{});
   return bad("Не удалось отправить письмо. Попробуйте ещё раз.",503);
  }
  return NextResponse.json({ok:true,expiresInSeconds:600},{headers:noStore});
 }catch(err){return publicError(err);}
}
