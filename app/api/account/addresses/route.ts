import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,customerGuard,jsonBody,noStore,object,publicError} from "@/lib/server/customer-auth";
export const runtime="nodejs";export const dynamic="force-dynamic";
export type Address={id:string;recipient:string;phone:string;city:string;street:string;building:string;apartment:string;comment:string};
function text(v:unknown,max:number){return typeof v==="string"?v.trim().slice(0,max+1):""}
export function validateAddress(input:unknown){
 const b=object(input);if(!b)return null;
 const recipient=text(b.recipient,120),phone=text(b.phone,32),city=text(b.city,120),
 street=text(b.street,160),building=text(b.building,32),
 apartment=text(b.apartment,32),comment=text(b.comment,500);
 if(recipient.length<2||recipient.length>120||!/^[+0-9()\s-]{6,32}$/.test(phone)||
    !city||city.length>120||!street||street.length>160||!building||building.length>32||
    apartment.length>32||comment.length>500)return null;
 return {recipient,phone,city,street,building,apartment,comment};
}
export async function GET(req:NextRequest){
 try{
  const a=await customerGuard(req);if(a.response)return a.response;
  const rows=await getPool().query(
   `SELECT id::text,recipient,phone,city,street,building,apartment,comment
      FROM shop_customer_addresses WHERE customer_id=$1 ORDER BY id DESC LIMIT 30`,[a.customer!.id]);
  return NextResponse.json({items:rows.rows},{headers:noStore});
 }catch(err){return publicError(err);}
}
export async function POST(req:NextRequest){
 try{
  const a=await customerGuard(req,true);if(a.response)return a.response;
  let b:unknown;try{b=await jsonBody(req);}catch{return bad("Некорректный запрос.");}
  const address=validateAddress(b);if(!address)return bad("Заполните ФИО, телефон, город, улицу и дом.");
  const pool=getPool();
  const count=await pool.query<{n:number}>("SELECT COUNT(*)::int n FROM shop_customer_addresses WHERE customer_id=$1",[a.customer!.id]);
  if(count.rows[0].n>=30)return bad("Допускается не более 30 адресов.",409);
  const row=await pool.query<{id:string}>(
   `INSERT INTO shop_customer_addresses(customer_id,recipient,phone,city,street,building,apartment,comment)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text`,
   [a.customer!.id,address.recipient,address.phone,address.city,address.street,address.building,address.apartment,address.comment]);
  return NextResponse.json({id:row.rows[0].id},{status:201,headers:noStore});
 }catch(err){return publicError(err);}
}
export async function PUT(req:NextRequest){
 try{
  const a=await customerGuard(req,true);if(a.response)return a.response;
  let b:Record<string,unknown>|null;
  try{b=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
  if(typeof b?.id!=="string"||!/^[0-9]{1,19}$/.test(b.id))return bad("Некорректный адрес.");
  const address=validateAddress(b);
  if(!address)return bad("Заполните ФИО, телефон, город, улицу и дом.");
  const changed=await getPool().query(
   `UPDATE shop_customer_addresses SET recipient=$3,phone=$4,city=$5,street=$6,
       building=$7,apartment=$8,comment=$9 WHERE id=$1 AND customer_id=$2 RETURNING id`,
   [b.id,a.customer!.id,address.recipient,address.phone,address.city,address.street,
    address.building,address.apartment,address.comment]);
  if(!changed.rowCount)return bad("Адрес не найден.",404);
  return NextResponse.json({ok:true},{headers:noStore});
 }catch(err){return publicError(err);}
}

export async function DELETE(req:NextRequest){
 try{
  const a=await customerGuard(req,true);if(a.response)return a.response;
  let b:Record<string,unknown>|null;try{b=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
  if(!b || typeof b.id!=="string"||!/^[0-9]{1,19}$/.test(b.id))return bad("Некорректный адрес.");
  const result=await getPool().query("DELETE FROM shop_customer_addresses WHERE id=$1 AND customer_id=$2",[b.id,a.customer!.id]);
  if(!result.rowCount)return bad("Адрес не найден.",404);
  return NextResponse.json({ok:true},{headers:noStore});
 }catch(err){return publicError(err);}
}
