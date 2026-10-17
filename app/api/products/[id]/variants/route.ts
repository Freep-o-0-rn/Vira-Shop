import {getProduct} from "@/lib/server/store";
import {loadVariants} from "@/lib/server/variants-store";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(id))return Response.json({error:"Неверный товар."},{status:404});
 try{
  if(!(await getProduct(id)))return Response.json({error:"Товар не найден."},{status:404});
  return Response.json(await loadVariants(id,true),{headers:{"Cache-Control":"no-store"}});
 }catch(err){console.error("[Vira Shop] Variants:",err);return Response.json({error:"Варианты временно недоступны."},{status:503});}
}
