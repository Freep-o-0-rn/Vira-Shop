import { NextRequest, NextResponse } from "next/server";
import { adminGuard, readJson } from "@/lib/server/admin-guard";
import { failureResponse } from "@/lib/server/admin-auth";
import { isId, productInput } from "@/lib/server/admin-validation";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const denied = await adminGuard(request, true);
    if (denied) return denied;
    const { id } = await params;
    if (!isId(id)) return NextResponse.json({ error: "Некорректный ID." }, { status: 400 });
    const input = productInput(await readJson(request));
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
    const p = input.data;
    if (p.id !== id) return NextResponse.json({ error: "Нельзя изменить ID товара." }, { status: 400 });
    const result = await getPool().query(
      `UPDATE shop_products
       SET category_id=$2,title=$3,subtitle=$4,description=$5,price_minor=$6,old_price_minor=$7,
           image_url=$8,badge=$9,stock_count=$10,is_active=$11,images=$12,specs=$13::jsonb,updated_at=NOW()
       WHERE id=$1 RETURNING id`,
      [p.id,p.category,p.title,p.subtitle,p.description,p.priceMinor,p.oldPriceMinor,p.image,p.badge,p.stock,p.active,p.images,JSON.stringify(p.specs)]
    );
    if (!result.rowCount) return NextResponse.json({ error: "Товар не найден." }, { status: 404 });
    return NextResponse.json({ id: result.rows[0].id });
  } catch (err) { return failureResponse(err); }
}
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const denied=await adminGuard(request,true);
    if(denied)return denied;
    const {id}=await params;
    if(!isId(id))return NextResponse.json({error:"Некорректный ID товара."},{status:400});
    let body:unknown;
    try { body=await readJson(request); }
    catch { return NextResponse.json({error:"Некорректный JSON."},{status:400}); }
    if(!body || typeof body!=="object" || Array.isArray(body) ||
       !("active" in body) || typeof body.active!=="boolean")
      return NextResponse.json({error:"Укажите active: true или false."},{status:400});
    const active=body.active;
    const result=await getPool().query(
      "UPDATE shop_products SET is_active=$2,updated_at=NOW() WHERE id=$1 RETURNING id,is_active AS active",
      [id,active]
    );
    if(!result.rowCount)return NextResponse.json({error:"Товар не найден."},{status:404});
    return NextResponse.json({id,active},{headers:{"Cache-Control":"no-store"}});
  }catch(err){return failureResponse(err);}
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const denied = await adminGuard(request, true);
    if (denied) return denied;
    const { id } = await params;
    if (!isId(id)) return NextResponse.json({ error: "Некорректный ID." }, { status: 400 });
    const result = await getPool().query("UPDATE shop_products SET is_active=FALSE, updated_at=NOW() WHERE id=$1 RETURNING id",[id]);
    if (!result.rowCount) return NextResponse.json({ error: "Товар не найден." }, { status: 404 });
    return NextResponse.json({ success: true, hidden: true });
  } catch (err) { return failureResponse(err); }
}
