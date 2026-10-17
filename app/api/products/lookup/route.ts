import { lookupProducts } from "@/lib/server/store";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request: Request) {
  const value=new URL(request.url).searchParams.get("ids") ?? "";
  const ids=value ? value.split(",") : [];
  if (ids.length>100 || ids.some(id=>!/^[A-Za-z0-9_-]{1,64}$/.test(id)) || value.length>6500) {
    return Response.json({error:"Некорректные идентификаторы товаров."},{status:400});
  }
  try{
    const items=await lookupProducts([...new Set(ids)]);
    return Response.json({items},{headers:{"Cache-Control":"no-store"}});
  }catch(err){
    console.error("[Vira Shop] Lookup products:",err);
    return Response.json({error:"Не удалось загрузить товары."},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
