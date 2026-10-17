import { getProduct } from "@/lib/server/store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(_request: Request,{params}:Context) {
  const {id}=await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return Response.json({error:"Товар не найден."},{status:404});
  }
  try{
    const item=await getProduct(id);
    return item?Response.json({item},{headers:{"Cache-Control":"no-store"}}):
      Response.json({error:"Товар не найден."},{status:404,headers:{"Cache-Control":"no-store"}});
  }catch(err){
    console.error("[Vira Shop] Product details:",err);
    return Response.json({error:"Товар временно недоступен."},{status:503});
  }
}
