import { NextRequest, NextResponse } from "next/server";
import { adminGuard, readJson } from "@/lib/server/admin-guard";
import { failureResponse } from "@/lib/server/admin-auth";
import { productInput } from "@/lib/server/admin-validation";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const denied = await adminGuard(request);
    if (denied) return denied;
    const result = await getPool().query(
      `SELECT p.id, p.title, p.subtitle, p.description, p.category_id AS category,
              ROUND((CASE WHEN p.variant_groups <> '[]'::jsonb
                THEN COALESCE((SELECT MIN(v.price_minor) FROM shop_product_variants v
                  WHERE v.product_id=p.id AND v.is_active=TRUE),p.price_minor)
                ELSE p.price_minor END)::numeric / 100, 2)::text AS price,
              CASE WHEN p.variant_groups <> '[]'::jsonb THEN NULL
                WHEN p.old_price_minor IS NULL THEN NULL
                ELSE ROUND(p.old_price_minor::numeric / 100, 2)::text END AS "oldPrice",
              p.image_url AS image, p.images, p.specs, p.badge,
              CASE WHEN p.variant_groups <> '[]'::jsonb THEN
                (SELECT COALESCE(SUM(v.stock_count),0)::int FROM shop_product_variants v
                  WHERE v.product_id=p.id AND v.is_active=TRUE)
                ELSE p.stock_count END AS stock,
              (p.variant_groups <> '[]'::jsonb) AS "hasVariants",
              (SELECT COUNT(*)::int FROM shop_product_variants v
                WHERE v.product_id=p.id AND v.is_active=TRUE) AS "variantCount",
              (SELECT COALESCE(array_agg(v.article ORDER BY v.article),ARRAY[]::text[])
                FROM shop_product_variants v WHERE v.product_id=p.id) AS "variantArticles",
              p.is_active AS active,
              p.created_at AS "createdAt"
         FROM shop_products p ORDER BY p.created_at DESC, p.id ASC LIMIT 1000`
    );
    return NextResponse.json({ items: result.rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) { return failureResponse(err); }
}

export async function POST(request: NextRequest) {
  try {
    const denied = await adminGuard(request, true);
    if (denied) return denied;
    const input = productInput(await readJson(request),true);
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
    const p = input.data;
    let created: {id:string}|null=null;
    for(let attempt=0;attempt<5;attempt++){
      try{
    const result=await getPool().query<{id:string}>(
      `INSERT INTO shop_products
       (id, category_id, title, subtitle, description, price_minor, old_price_minor, image_url, badge, stock_count, is_active, images, specs)
       VALUES (CASE WHEN $1::text = '' THEN nextval('shop_product_article_seq')::text ELSE $1::text END,
         $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING id`,
      [p.id,p.category,p.title,p.subtitle,p.description,p.priceMinor,p.oldPriceMinor,p.image,p.badge,p.stock,p.active,p.images,JSON.stringify(p.specs)]
    );
        created=result.rows[0];
        break;
      }catch(err){
        const duplicate=err&&typeof err==="object"&&"code" in err&&err.code==="23505";
        if(p.id===""&&duplicate&&attempt<4)continue;
        throw err;
      }
    }
    if(!created)throw new Error("Unable to allocate a unique article");
    return NextResponse.json({ id: created.id, article: created.id }, { status: 201 });
  } catch (err) {
    if(err && typeof err==="object" && "code" in err && err.code==="23505")
      return NextResponse.json({error:"Такой артикул уже существует. Повторите создание товара."},{status:409});
    return err instanceof SyntaxError || (err instanceof Error && err.message.startsWith("Content-Type")) ?
    NextResponse.json({ error: "Некорректный JSON." }, { status: 400 }) : failureResponse(err); }
}
