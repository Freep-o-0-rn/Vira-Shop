import {getPool} from "@/lib/server/db";
import {combinations,signature,type VariantGroup,type StoreVariant,type VariantSelection} from "@/lib/variants";

const isObj=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==="object"&&!Array.isArray(v);
const clean=(v:unknown,max:number)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=max?v.trim():null;
const urlOK=(s:string)=>s.length<=1500&&( /^\/uploads\/[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/.test(s)||
   (s.startsWith("https://") && !/[<>\s]/.test(s) && (()=>{try{const x=new URL(s);return !x.username&&!x.password;}catch{return false;}})()));
const price=(v:unknown,optional=false):number|null|undefined=>{
 if(optional&&(v===""||v===null||v===undefined))return null;
 if(typeof v!=="string"&&typeof v!=="number")return undefined;
 const s=String(v);
 if(!/^\d{1,10}(\.\d{1,2})?$/.test(s))return undefined;
 const n=Math.round(Number(s)*100);
 return Number.isSafeInteger(n)&&n<=900000000000?n:undefined;
};
export type VariantDraft={
 selection:VariantSelection[];priceMinor:number;oldPriceMinor:number|null;
 stock:number;images:string[];active:boolean
};
export function validateVariantConfig(value:unknown):{groups:VariantGroup[];variants:VariantDraft[]}|null{
 if(!isObj(value)||!Array.isArray(value.groups)||!Array.isArray(value.variants)||
   value.groups.length>3||value.variants.length>100)return null;
 const groups:VariantGroup[]=[],names=new Set<string>();
 for(const raw of value.groups){
  if(!isObj(raw)||!Array.isArray(raw.values)||!raw.values.length||raw.values.length>12)return null;
  const name=clean(raw.name,60),type=raw.type;
  if(!name||!["text","color","image"].includes(String(type))||names.has(name.toLowerCase()))return null;
  names.add(name.toLowerCase());
  const values:VariantGroup["values"]=[],used=new Set<string>();
  for(const item of raw.values){
   if(!isObj(item))return null;
   const label=clean(item.label,80);
   if(!label||used.has(label.toLowerCase()))return null;
   used.add(label.toLowerCase());
   const color=item.color===undefined||item.color===""?undefined:item.color;
   const image=item.image===undefined||item.image===""?undefined:item.image;
   if(color!==undefined&&(typeof color!=="string"||!/^#[0-9a-fA-F]{6}$/.test(color)))return null;
   if(image!==undefined&&(typeof image!=="string"||!urlOK(image)))return null;
   values.push({label,...(color?{color}:{}),...(image?{image}:{})});
  }
  groups.push({name,type:type as VariantGroup["type"],values});
 }
 if(!groups.length)return value.variants.length===0?{groups:[],variants:[]}:null;
 const combinationsList=combinations(groups);
 if(combinationsList.length>100)return null;
 // A saved variant is one exact existing combination, no arbitrary extra attributes.
 const allowed=new Set(combinationsList.map(signature));
 const found=new Set<string>(),variants:VariantDraft[]=[];
 for(const item of value.variants){
  if(!isObj(item)||!Array.isArray(item.selection)||item.selection.length!==groups.length)return null;
  const selection:VariantSelection[]=[];
  for(let i=0;i<groups.length;i++){
   const part=item.selection[i];
   if(!isObj(part)||part.name!==groups[i].name||typeof part.value!=="string")return null;
   selection.push({name:groups[i].name,value:part.value});
  }
  const key=signature(selection);
  if(!allowed.has(key)||found.has(key))return null;
  found.add(key);
  const p=price(item.price),old=price(item.oldPrice,true),stock=item.stock;
  if(p===undefined||p===null||old===undefined||typeof stock!=="number"||
    !Number.isInteger(stock)||stock<0||stock>100000000||typeof item.active!=="boolean"||
    !Array.isArray(item.images)||item.images.length>8||item.images.some(i=>typeof i!=="string"||!urlOK(i)))return null;
  variants.push({selection,priceMinor:p,oldPriceMinor:old,stock,images:[...new Set(item.images as string[])],active:item.active});
 }
 if(variants.length!==combinationsList.length)return null;
 return {groups,variants};
}
export async function loadVariants(productId:string,publicOnly=false):Promise<{groups:VariantGroup[];variants:StoreVariant[]}>{
 const pool=getPool();
 const product=await pool.query<{variant_groups:VariantGroup[]}>("SELECT variant_groups FROM shop_products WHERE id=$1",[productId]);
 if(!product.rowCount)return {groups:[],variants:[]};
 const rows=await pool.query<{article:string;selection:VariantSelection[];price_minor:string;old_price_minor:string|null;stock_count:number;images:string[];is_active:boolean}>(
 `SELECT article,selection,price_minor::text,old_price_minor::text,stock_count,images,is_active
  FROM shop_product_variants WHERE product_id=$1 ${publicOnly?"AND is_active=TRUE":""} ORDER BY article`,[productId]);
 const groups=product.rows[0].variant_groups??[];
 return {groups,variants:rows.rows.map(v=>({article:v.article,selection:v.selection,
  priceMinor:v.price_minor,oldPriceMinor:v.old_price_minor,stock:v.stock_count,
  images:v.images,active:v.is_active}))};
}
export async function saveVariants(productId:string,body:unknown):Promise<"missing"|"ok"|"conflict"|"invalid">{
 const cfg=validateVariantConfig(body);
 if(!cfg)return "invalid";
 const client=await getPool().connect();
 try{
  await client.query("BEGIN");
  const exists=await client.query("SELECT id FROM shop_products WHERE id=$1 FOR UPDATE",[productId]);
  if(!exists.rowCount){await client.query("ROLLBACK");return "missing";}
  const current=await client.query<{article:string;signature:string}>(
    "SELECT article,signature FROM shop_product_variants WHERE product_id=$1",[productId]);
  // Existing variant definitions must never silently change identity: cart and
  // order rows reference their immutable article. Removed combinations archive.
  const prev=new Map(current.rows.map(r=>[r.signature,r.article]));
  await client.query("UPDATE shop_product_variants SET is_active=FALSE,updated_at=NOW() WHERE product_id=$1",[productId]);
  for(const item of cfg.variants){
   const key=signature(item.selection);
   const article=prev.get(key);
   if(article){
    await client.query(`UPDATE shop_product_variants SET selection=$2::jsonb,
      price_minor=$3,old_price_minor=$4,stock_count=$5,images=$6,is_active=$7,updated_at=NOW()
      WHERE article=$1`,[article,JSON.stringify(item.selection),item.priceMinor,item.oldPriceMinor,item.stock,item.images,item.active]);
   }else{
    await client.query(`INSERT INTO shop_product_variants
      (article,product_id,signature,selection,price_minor,old_price_minor,stock_count,images,is_active)
      VALUES(nextval('shop_variant_article_seq')::text,$1,$2,$3::jsonb,$4,$5,$6,$7,$8)`,
      [productId,key,JSON.stringify(item.selection),item.priceMinor,item.oldPriceMinor,item.stock,item.images,item.active]);
   }
  }
  await client.query("UPDATE shop_products SET variant_groups=$2::jsonb,updated_at=NOW() WHERE id=$1",
    [productId,JSON.stringify(cfg.groups)]);
  await client.query("COMMIT");
  return "ok";
 }catch(err){try{await client.query("ROLLBACK");}catch{}throw err;}
 finally{client.release();}
}
