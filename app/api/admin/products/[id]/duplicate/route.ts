import {NextRequest,NextResponse} from "next/server";
import {adminGuard} from "@/lib/server/admin-guard";
import {failureResponse} from "@/lib/server/admin-auth";
import {getPool} from "@/lib/server/db";
import {combinations,signature,type VariantGroup} from "@/lib/variants";
import {isId} from "@/lib/server/admin-validation";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Ctx={params:Promise<{id:string}>};

/** Clone only the catalog definition; stock is reset and new copy starts hidden.
 * Never copy order/cart references or retain immutable article identifiers.
 */
export async function POST(request:NextRequest,{params}:Ctx){
 try{
  const denied=await adminGuard(request,true);if(denied)return denied;
  const {id}=await params;if(!isId(id))return NextResponse.json({error:"Некорректный артикул."},{status:400});
  const client=await getPool().connect();
  try{
   await client.query("BEGIN");
   const original=await client.query<{
    category_id:string;title:string;subtitle:string;description:string;
    price_minor:string;old_price_minor:string|null;image_url:string;badge:string|null;
    images:string[];specs:unknown;variant_groups:VariantGroup[];
   }>(`SELECT category_id,title,subtitle,description,price_minor::text,old_price_minor::text,
       image_url,badge,images,specs,variant_groups FROM shop_products WHERE id=$1 FOR UPDATE`,[id]);
   if(!original.rowCount){await client.query("ROLLBACK");return NextResponse.json({error:"Товар не найден."},{status:404});}
   const p=original.rows[0];
   const oldVariants=await client.query<{
    signature:string;selection:unknown;price_minor:string;old_price_minor:string|null;
    images:string[];is_active:boolean
   }>(`SELECT signature,selection,price_minor::text,old_price_minor::text,images,is_active
       FROM shop_product_variants WHERE product_id=$1`,[id]);
   const variantMap=new Map(oldVariants.rows.map(v=>[v.signature,v]));
   const currentGroups=Array.isArray(p.variant_groups)?p.variant_groups:[];
   const selected=combinations(currentGroups).map(signature);
   if(selected.length>100||selected.some(key=>!variantMap.has(key))){
    await client.query("ROLLBACK");
    return NextResponse.json({error:"Не удалось скопировать варианты: исходные комбинации требуют проверки."},{status:409});
   }
   let newId:string|null=null;
   for(let attempt=0;attempt<8;attempt++){
    const newArticle=await client.query<{id:string}>("SELECT nextval('shop_product_article_seq')::text AS id");
    const result=await client.query<{id:string}>(`INSERT INTO shop_products
      (id,category_id,title,subtitle,description,price_minor,old_price_minor,image_url,badge,
       stock_count,is_active,images,specs,variant_groups)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,FALSE,$10,$11::jsonb,$12::jsonb)
      ON CONFLICT(id) DO NOTHING RETURNING id`,
     [newArticle.rows[0].id,p.category_id,(p.title.slice(0,184)+" (копия)").slice(0,200),
      p.subtitle,p.description,p.price_minor,p.old_price_minor,p.image_url,p.badge,
      p.images,JSON.stringify(p.specs??[]),JSON.stringify(currentGroups)]);
    if(result.rowCount){newId=result.rows[0].id;break;}
   }
   if(!newId)throw Error("Не удалось выделить уникальный артикул");
   for(const key of selected){
    const v=variantMap.get(key)!;
    await client.query(`INSERT INTO shop_product_variants
     (article,product_id,signature,selection,price_minor,old_price_minor,stock_count,images,is_active)
     VALUES (nextval('shop_variant_article_seq')::text,$1,$2,$3::jsonb,$4,$5,0,$6,$7)`,
     [newId,key,JSON.stringify(v.selection),v.price_minor,v.old_price_minor,v.images,v.is_active]);
   }
   await client.query("COMMIT");
   return NextResponse.json({id:newId,variantCount:selected.length,active:false,stock:0},{status:201});
  }catch(err){try{await client.query("ROLLBACK");}catch{}throw err;}finally{client.release();}
 }catch(err){return failureResponse(err);}
}
