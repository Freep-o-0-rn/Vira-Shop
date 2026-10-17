import { listProducts, type SortOrder } from "@/lib/server/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMoney(value: string | null): number | null | undefined {
  if (value === null || value === "") return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number <= 9000000000 ? number : undefined;
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const search = (params.get("q") ?? "").trim(), category=params.get("category") ?? "";
  const sort=params.get("sort") ?? "popular";
  const rawPage=params.get("page") ?? "1", rawLimit=params.get("limit") ?? "12";
  const minPrice=parseMoney(params.get("minPrice")),maxPrice=parseMoney(params.get("maxPrice"));
  const stock=params.get("inStock") ?? "false";
  if (search.length>100 || category.length>64 || !/^[a-z0-9_-]*$/.test(category) ||
      !["popular","cheap","expensive","rating"].includes(sort) ||
      !/^\d+$/.test(rawPage) || !/^\d+$/.test(rawLimit) ||
      !Number.isSafeInteger(Number(rawPage)) || Number(rawPage)<1 || Number(rawPage)>100000 ||
      !Number.isSafeInteger(Number(rawLimit)) || Number(rawLimit)<1 || Number(rawLimit)>100 ||
      minPrice===undefined || maxPrice===undefined ||
      (minPrice!==null && maxPrice!==null && minPrice>maxPrice) ||
      !["true","false"].includes(stock)) {
    return Response.json({error:"Некорректные параметры каталога."},{status:400});
  }
  try {
    const result=await listProducts({
      search,category,sort:sort as SortOrder,page:Number(rawPage),limit:Number(rawLimit),
      minPrice,maxPrice,inStock:stock==="true"
    });
    return Response.json(result,{headers:{"Cache-Control":"no-store"}});
  }catch(err){
    console.error("[Vira Shop] Products:",err);
    return Response.json({error:"Каталог временно недоступен."},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
