import {listProducts} from "@/lib/server/store";
import {readCatalogFilters} from "@/lib/server/catalog-input";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  const filters=readCatalogFilters(new URL(request.url).searchParams);
  if(!filters)return Response.json({error:"Некорректные параметры каталога."},{status:400});
  try{
    return Response.json(await listProducts(filters),{headers:{"Cache-Control":"no-store"}});
  }catch(err){
    console.error("[Vira Shop] Products:",err);
    return Response.json({error:"Каталог временно недоступен."},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
