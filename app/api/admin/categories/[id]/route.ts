import { NextRequest, NextResponse } from "next/server";
import { adminGuard, readJson } from "@/lib/server/admin-guard";
import { failureResponse } from "@/lib/server/admin-auth";
import { categoryInput, isCategoryId } from "@/lib/server/admin-validation";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const denied = await adminGuard(request, true);
    if (denied) return denied;
    const { id } = await params;
    if (!isCategoryId(id)) return NextResponse.json({ error: "Некорректный ID." }, { status: 400 });
    const input = categoryInput(await readJson(request));
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
    if (input.data.id !== id) return NextResponse.json({ error: "Изменение ID категории запрещено." }, { status: 400 });
    const c = input.data;
    const result = await getPool().query(
      "UPDATE shop_categories SET title=$2,emoji=$3,tone=$4,is_active=$5 WHERE id=$1 RETURNING id",
      [id,c.title,c.emoji,c.tone,c.active]
    );
    if (!result.rowCount) return NextResponse.json({ error: "Категория не найдена." }, { status: 404 });
    return NextResponse.json({ id });
  } catch (err) { return failureResponse(err); }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const denied = await adminGuard(request, true);
    if (denied) return denied;
    const { id } = await params;
    if (!isCategoryId(id)) return NextResponse.json({ error: "Некорректный ID." }, { status: 400 });
    const result = await getPool().query("DELETE FROM shop_categories WHERE id=$1 RETURNING id", [id]);
    if (!result.rowCount) return NextResponse.json({ error: "Категория не найдена." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) { return failureResponse(err); }
}
