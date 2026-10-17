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
              (p.price_minor / 100.0)::text AS price,
              CASE WHEN p.old_price_minor IS NULL THEN NULL ELSE (p.old_price_minor / 100.0)::text END AS "oldPrice",
              p.image_url AS image, p.badge, p.stock_count AS stock, p.is_active AS active,
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
    const input = productInput(await readJson(request));
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
    const p = input.data;
    const result = await getPool().query(
      `INSERT INTO shop_products
       (id, category_id, title, subtitle, description, price_minor, old_price_minor, image_url, badge, stock_count, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [p.id,p.category,p.title,p.subtitle,p.description,p.priceMinor,p.oldPriceMinor,p.image,p.badge,p.stock,p.active]
    );
    return NextResponse.json({ id: result.rows[0].id }, { status: 201 });
  } catch (err) { return err instanceof SyntaxError || (err instanceof Error && err.message.startsWith("Content-Type")) ?
    NextResponse.json({ error: "Некорректный JSON." }, { status: 400 }) : failureResponse(err); }
}
