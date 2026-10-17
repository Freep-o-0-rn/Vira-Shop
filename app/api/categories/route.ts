import { listCategories } from "@/lib/server/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await listCategories(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[Vira Shop] GET /api/categories:", err);
    return Response.json({ error: "Категории временно недоступны. Проверьте PostgreSQL." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
