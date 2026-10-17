import { NextRequest, NextResponse } from "next/server";
import { adminGuard, readJson } from "@/lib/server/admin-guard";
import { failureResponse } from "@/lib/server/admin-auth";
import { categoryInput } from "@/lib/server/admin-validation";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const denied = await adminGuard(request);
    if (denied) return denied;
    const result = await getPool().query(
      `SELECT c.id,c.title,c.emoji,c.tone,c.display_order AS "order",c.is_active AS active,
       COUNT(p.id)::int AS "productCount"
       FROM shop_categories c LEFT JOIN shop_products p ON p.category_id = c.id
       GROUP BY c.id ORDER BY c.display_order, c.id`
    );
    return NextResponse.json({ items: result.rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) { return failureResponse(err); }
}

export async function POST(request: NextRequest) {
  try {
    const denied = await adminGuard(request, true);
    if (denied) return denied;
    const input = categoryInput(await readJson(request));
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
    const c = input.data;
    await getPool().query(
      `INSERT INTO shop_categories (id,title,emoji,tone,is_active,display_order)
       VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(MAX(display_order),0)+1 FROM shop_categories))`,
      [c.id,c.title,c.emoji,c.tone,c.active]
    );
    return NextResponse.json({ id: c.id }, { status: 201 });
  } catch (err) { return failureResponse(err); }
}
