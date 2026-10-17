import { listProducts, type SortOrder } from "@/lib/server/store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const search = (searchParams.get("q") ?? "").trim();
  const category = searchParams.get("category") ?? "";
  const sort = searchParams.get("sort") ?? "popular";
  const rawPage = searchParams.get("page") ?? "1";
  const rawLimit = searchParams.get("limit") ?? "24";

  if (search.length > 100 || category.length > 64 || !/^[a-z0-9_-]*$/.test(category)) {
    return Response.json({ error: "Некорректный поисковый запрос или категория" }, { status: 400 });
  }
  if (!["popular", "cheap", "expensive", "rating"].includes(sort)) {
    return Response.json({ error: "Некорректная сортировка" }, { status: 400 });
  }
  const page = Number(rawPage);
  const limit = Number(rawLimit);
  if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawLimit) ||
      !Number.isSafeInteger(page) || page < 1 || page > 100000 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    return Response.json({ error: "Параметры page и limit должны быть целыми числами (limit 1–100)" }, { status: 400 });
  }

  try {
    const result = await listProducts({ search, category, sort: sort as SortOrder, page, limit });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[Vira Shop] GET /api/products:", err);
    return Response.json({ error: "Каталог временно недоступен. Проверьте PostgreSQL и миграции." },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
