import {listProductFacets} from "@/lib/server/store";
import {readCatalogFilters} from "@/lib/server/catalog-input";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  const filters=readCatalogFilters(new URL(request.url).searchParams);
  if(!filters)return Response.json({error:"Некорректные параметры фильтров."},{status:400});
  try{
    return Response.json(await listProductFacets(filters),{headers:{"Cache-Control":"no-store"}});
  }catch(err){
    console.error("[Vira Shop] Product facets:",err);
    return Response.json({error:"Фильтры временно недоступны."},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
