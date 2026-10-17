import {parseSpecFilters} from "@/lib/catalog-route";
import type {ProductFilters,SortOrder} from "@/lib/server/store";

function money(value:string|null):number|null|undefined{
  if(value===null||value==="")return null;
  if(!/^\d{1,9}(\.\d{1,2})?$/.test(value))return undefined;
  const result=Number(value);
  return Number.isFinite(result)&&result<=9000000000?result:undefined;
}
export function readCatalogFilters(params:URLSearchParams):ProductFilters|null{
  const search=(params.get("q")??"").trim(),category=params.get("category")??"";
  const sort=params.get("sort")??"popular";
  const rawPage=params.get("page")??"1",rawLimit=params.get("limit")??"12";
  const minPrice=money(params.get("minPrice")),maxPrice=money(params.get("maxPrice"));
  const stock=params.get("inStock")??"false";
  const specs=parseSpecFilters(params.getAll("spec"));
  if(search.length>100 || category.length>64 || !/^[a-z0-9_-]*$/.test(category) ||
     !["popular","cheap","expensive","rating"].includes(sort) ||
     !/^\d+$/.test(rawPage) || !/^\d+$/.test(rawLimit) ||
     !Number.isSafeInteger(Number(rawPage)) || Number(rawPage)<1 || Number(rawPage)>100000 ||
     !Number.isSafeInteger(Number(rawLimit)) || Number(rawLimit)<1 || Number(rawLimit)>100 ||
     minPrice===undefined || maxPrice===undefined || specs===null ||
     (minPrice!==null && maxPrice!==null && minPrice>maxPrice) ||
     !["true","false"].includes(stock))return null;
  return {
    search,category,sort:sort as SortOrder,
    page:Number(rawPage),limit:Number(rawLimit),minPrice,maxPrice,
    inStock:stock==="true",specs
  };
}
