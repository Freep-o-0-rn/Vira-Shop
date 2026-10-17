import {NextRequest,NextResponse} from "next/server";
import {adminGuard,readJson} from "@/lib/server/admin-guard";
import {failureResponse} from "@/lib/server/admin-auth";
import {loadVariants,saveVariants} from "@/lib/server/variants-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
type Ctx={params:Promise<{id:string}>};
export async function GET(req:NextRequest,{params}:Ctx){
 try{
  const denied=await adminGuard(req);if(denied)return denied;
  const {id}=await params;if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id))return NextResponse.json({error:"Неверный ID."},{status:400});
  return NextResponse.json(await loadVariants(id),{headers:{"Cache-Control":"no-store"}});
 }catch(err){return failureResponse(err);}
}
export async function PUT(req:NextRequest,{params}:Ctx){
 try{
  const denied=await adminGuard(req,true);if(denied)return denied;
  const {id}=await params;if(!/^[a-zA-Z0-9_-]{1,64}$/.test(id))return NextResponse.json({error:"Неверный ID."},{status:400});
  let data:unknown;try{data=await readJson(req);}catch{return NextResponse.json({error:"Некорректный JSON."},{status:400});}
  const result=await saveVariants(id,data);
  if(result==="invalid")return NextResponse.json({error:"Недопустимые параметры. Не более 3 групп, 100 комбинаций. Нужны все комбинации."},{status:400});
  if(result==="missing")return NextResponse.json({error:"Товар не найден."},{status:404});
  return NextResponse.json({ok:true});
 }catch(err){return failureResponse(err);}
}
