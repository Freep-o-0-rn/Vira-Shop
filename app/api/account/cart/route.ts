import {NextRequest,NextResponse} from "next/server";
import {getPool} from "@/lib/server/db";
import {bad,customerGuard,jsonBody,noStore,object,publicError} from "@/lib/server/customer-auth";
export const runtime="nodejs";export const dynamic="force-dynamic";
const valid=(v:unknown):v is string=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
const quantityOK=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=99;
type CartLine={id:string;quantity:number;variantId:string|null};
const SELECT=`SELECT c.product_id AS id,c.variant_id AS "variantId",c.quantity,
 p.title,COALESCE(NULLIF(v.images[1],''),p.image_url) AS image,
 COALESCE(v.price_minor,p.price_minor)::text AS "priceMinor",
 COALESCE(v.stock_count,p.stock_count) AS stock,
 (p.is_active AND cat.is_active AND (c.variant_id IS NOT NULL OR p.variant_groups='[]'::jsonb)
 AND (c.variant_id IS NULL OR v.is_active)) AS available,
 COALESCE(v.selection,'[]'::jsonb) AS selection
 FROM shop_customer_cart c JOIN shop_products p ON p.id=c.product_id
 JOIN shop_categories cat ON cat.id=p.category_id
 LEFT JOIN shop_product_variants v ON v.article=c.variant_id AND v.product_id=c.product_id
 WHERE c.customer_id=$1 ORDER BY c.updated_at DESC`;
function parseLine(b:Record<string,unknown>,canDelete=true):CartLine|null{
 const id=b.productId??b.id,v=b.variantId??null,q=b.quantity;
 if(!valid(id)||!(v===null||valid(v))||!quantityOK(q)||(!canDelete&&q===0))return null;
 return {id,variantId:v,quantity:q};
}
async function checkLine(client:Awaited<ReturnType<ReturnType<typeof getPool>["connect"]>>,line:CartLine){
 const p=await client.query<{stock_count:number;is_active:boolean;variant_groups:unknown;category_active:boolean}>(
 `SELECT p.stock_count,p.is_active,p.variant_groups,c.is_active AS category_active FROM shop_products p
   JOIN shop_categories c ON c.id=p.category_id WHERE p.id=$1`,[line.id]);
 if(!p.rowCount||!p.rows[0].is_active||!p.rows[0].category_active)return "Товар недоступен.";
 const groups=p.rows[0].variant_groups;
 if(Array.isArray(groups)&&groups.length>0&&!line.variantId)return "Для товара требуется выбрать вариант.";
 if(line.variantId){
  if(!Array.isArray(groups)||groups.length===0)return "У товара нет вариантов.";
  const v=await client.query<{stock_count:number;is_active:boolean}>(
   "SELECT stock_count,is_active FROM shop_product_variants WHERE article=$1 AND product_id=$2",
   [line.variantId,line.id]);
  if(!v.rowCount||!v.rows[0].is_active)return "Вариант товара недоступен.";
  if(v.rows[0].stock_count<line.quantity)return "Недостаточно выбранного варианта.";
 }else if(p.rows[0].stock_count<line.quantity)return "Недостаточно товара на складе.";
 return null;
}
export async function GET(req:NextRequest){
 try{
  const a=await customerGuard(req);if(a.response)return a.response;
  return NextResponse.json({items:(await getPool().query(SELECT,[a.customer!.id])).rows},{headers:noStore});
 }catch(err){return publicError(err);}
}
export async function PUT(req:NextRequest){
 try{
  const a=await customerGuard(req,true);if(a.response)return a.response;
  let b:Record<string,unknown>|null;try{b=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
  const line=b&&parseLine(b);if(!line)return bad("Некорректные параметры корзины.");
  const client=await getPool().connect();
  try{
   await client.query("BEGIN");
   await client.query("SELECT id FROM shop_customers WHERE id=$1 FOR UPDATE",[a.customer!.id]);
   if(line.quantity===0){
    await client.query("DELETE FROM shop_customer_cart WHERE customer_id=$1 AND product_id=$2 AND variant_key=$3",
      [a.customer!.id,line.id,line.variantId??""]);
   }else{
    const issue=await checkLine(client,line);
    if(issue){await client.query("ROLLBACK");return bad(issue,409);}
    await client.query(`INSERT INTO shop_customer_cart(customer_id,product_id,variant_id,variant_key,quantity)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(customer_id,product_id,variant_key)
      DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=NOW()`,
      [a.customer!.id,line.id,line.variantId,line.variantId??"",line.quantity]);
   }
   const count=await client.query<{n:number}>("SELECT COUNT(*)::int n FROM shop_customer_cart WHERE customer_id=$1",[a.customer!.id]);
   if(count.rows[0].n>50){await client.query("ROLLBACK");return bad("В корзине максимум 50 позиций.",409);}
   const result=await client.query(SELECT,[a.customer!.id]);
   await client.query("COMMIT");
   return NextResponse.json({items:result.rows},{headers:noStore});
  }catch(err){try{await client.query("ROLLBACK");}catch{}throw err;}finally{client.release();}
 }catch(err){return publicError(err);}
}
export async function POST(req:NextRequest){
 try{
  const a=await customerGuard(req,true);if(a.response)return a.response;
  let body:Record<string,unknown>|null;try{body=object(await jsonBody(req));}catch{return bad("Некорректный запрос.");}
  if(!body||!Array.isArray(body.items)||body.items.length>50)return bad("Максимум 50 товаров.");
  const lines=new Map<string,CartLine>();
  for(const raw of body.items){
   const b=object(raw),line=b&&parseLine(b,false);
   if(!line)return bad("Некорректная корзина.");
   const key=line.id+"|"+(line.variantId??"");
   const prev=lines.get(key);
   lines.set(key,{...line,quantity:Math.max(prev?.quantity??0,line.quantity)});
  }
  const client=await getPool().connect();
  try{
   await client.query("BEGIN");
   await client.query("SELECT id FROM shop_customers WHERE id=$1 FOR UPDATE",[a.customer!.id]);
   for(const line of [...lines.values()].sort((a,b)=>(a.id+(a.variantId??"")).localeCompare(b.id+(b.variantId??"")))){
    const issue=await checkLine(client,line);
    if(issue){await client.query("ROLLBACK");return bad(issue+" ("+line.id+")",409);}
    await client.query(`INSERT INTO shop_customer_cart(customer_id,product_id,variant_id,variant_key,quantity)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(customer_id,product_id,variant_key)
      DO UPDATE SET quantity=GREATEST(shop_customer_cart.quantity,EXCLUDED.quantity),updated_at=NOW()`,
      [a.customer!.id,line.id,line.variantId,line.variantId??"",line.quantity]);
   }
   const count=await client.query<{n:number}>("SELECT COUNT(*)::int n FROM shop_customer_cart WHERE customer_id=$1",[a.customer!.id]);
   if(count.rows[0].n>50){await client.query("ROLLBACK");return bad("В корзине максимум 50 позиций.",409);}
   await client.query("COMMIT");
  }catch(err){try{await client.query("ROLLBACK");}catch{}throw err;}finally{client.release();}
  return NextResponse.json({items:(await getPool().query(SELECT,[a.customer!.id])).rows},{headers:noStore});
 }catch(err){return publicError(err);}
}
