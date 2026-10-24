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

/**
 * Removing a populated category requires explicitly choosing a destination.
 * Move all products, including hidden ones, before deletion in one transaction.
 * Orders and variants reference product IDs, so their history is preserved.
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const denied = await adminGuard(request, true);
    if (denied) return denied;
    const { id } = await params;
    if (!isCategoryId(id)) return NextResponse.json({ error: "Некорректный ID." }, { status: 400 });

    let moveToCategoryId: string | null = null;
    if (request.body !== null) {
      let body: unknown;
      try { body = await readJson(request); }
      catch { return NextResponse.json({ error: "Неверные параметры переноса товаров." }, { status: 400 }); }
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          !("moveToCategoryId" in body) || !isCategoryId(body.moveToCategoryId)) {
        return NextResponse.json({ error: "Укажите корректную категорию для переноса товаров." }, { status: 400 });
      }
      moveToCategoryId = body.moveToCategoryId;
      if (moveToCategoryId === id) {
        return NextResponse.json({ error: "Выберите другую категорию для переноса." }, { status: 400 });
      }
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      // Lock the source category before checking its products. This also prevents
      // concurrent inserts with a foreign key reference until the transaction ends.
      const source = await client.query("SELECT id FROM shop_categories WHERE id=$1 FOR UPDATE", [id]);
      if (!source.rowCount) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Категория не найдена." }, { status: 404 });
      }
      if (moveToCategoryId) {
        const destination = await client.query("SELECT id FROM shop_categories WHERE id=$1 FOR UPDATE", [moveToCategoryId]);
        if (!destination.rowCount) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Категория для переноса не найдена." }, { status: 404 });
        }
      }

      const count = await client.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM shop_products WHERE category_id=$1", [id]
      );
      const total = Number(count.rows[0]?.count ?? 0);
      if (total > 0 && !moveToCategoryId) {
        await client.query("ROLLBACK");
        return NextResponse.json({
          error: "В категории есть товары. Выберите категорию, куда их перенести.",
          productCount: total
        }, { status: 409 });
      }

      if (moveToCategoryId) {
        await client.query(
          "UPDATE shop_products SET category_id=$2,updated_at=NOW() WHERE category_id=$1",
          [id,moveToCategoryId]
        );
      }
      await client.query("DELETE FROM shop_categories WHERE id=$1", [id]);
      await client.query("COMMIT");
      return NextResponse.json({ success: true, movedProducts: total, ...(moveToCategoryId ? { moveToCategoryId } : {}) });
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      return failureResponse(error);
    } finally {
      client.release();
    }
  } catch (err) { return failureResponse(err); }
}
