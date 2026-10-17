import { categories as demoCategories, products as demoProducts, type Product, type ProductSpec, type StoreCategory } from "@/lib/catalog";
import { databaseEnabled, getPool } from "@/lib/server/db";

export type SortOrder = "popular" | "cheap" | "expensive" | "rating";
export type ProductFilters = {
  search: string; category: string; sort: SortOrder; page: number; limit: number;
  minPrice: number | null; maxPrice: number | null; inStock: boolean;
};
export type ProductList = {
  items: Product[]; total: number; page: number; limit: number;
  totalPages: number; source: "demo" | "database";
};
const orderBy: Record<SortOrder, string> = {
  popular: "p.reviews DESC, p.rating DESC, p.id ASC",
  cheap: "p.price_minor ASC, p.id ASC",
  expensive: "p.price_minor DESC, p.id ASC",
  rating: "p.rating DESC, p.reviews DESC, p.id ASC",
};
type Row = {
  id: string; title: string; subtitle: string; category: string;
  price_minor: string; old_price_minor: string | null;
  rating: string; reviews: number; image_url: string; badge: string | null;
  description: string; stock_count: number; images: string[] | null; specs: ProductSpec[] | null;
};
const columns = `p.id, p.title, p.subtitle, p.category_id AS category,
 p.price_minor::text, p.old_price_minor::text, p.rating::text, p.reviews,
 p.image_url, p.badge, p.description, p.stock_count, p.images, p.specs`;

function mapProduct(row: Row): Product {
  const images = Array.isArray(row.images) && row.images.length ? row.images :
    (row.image_url ? [row.image_url] : []);
  return {
    id: row.id, title: row.title, subtitle: row.subtitle, category: row.category,
    price: Number(row.price_minor) / 100,
    ...(row.old_price_minor === null ? {} : { oldPrice: Number(row.old_price_minor) / 100 }),
    rating: Number(row.rating), reviews: row.reviews, image: images[0] ?? "",
    images, specs: Array.isArray(row.specs) ? row.specs : [],
    ...(row.badge ? { badge: row.badge } : {}),
    description: row.description, stock: row.stock_count,
  };
}
function demoProduct(p: Product): Product {
  return { ...p, images: p.image ? [p.image] : [], specs: p.specs ?? [] };
}
const demo = demoProducts.map(demoProduct);

export async function listProducts(filters: ProductFilters): Promise<ProductList> {
  const { search, category, sort, limit, page, minPrice, maxPrice, inStock } = filters;
  if (!databaseEnabled()) {
    const q = search.toLocaleLowerCase("ru");
    let entries = demo.filter(p => (!category || p.category === category) &&
      (!q || (p.title+" "+p.subtitle).toLocaleLowerCase("ru").includes(q)) &&
      (minPrice === null || p.price >= minPrice) &&
      (maxPrice === null || p.price <= maxPrice) &&
      (!inStock || (p.stock ?? 20) > 0));
    if (sort === "cheap") entries = [...entries].sort((a,b) => a.price - b.price);
    if (sort === "expensive") entries = [...entries].sort((a,b) => b.price - a.price);
    if (sort === "rating") entries = [...entries].sort((a,b) => b.rating - a.rating);
    return {
      items: entries.slice((page - 1)*limit, page*limit), total: entries.length, page, limit,
      totalPages: Math.ceil(entries.length/limit), source: "demo"
    };
  }
  const values = [
    category, search,
    minPrice === null ? null : Math.round(minPrice*100),
    maxPrice === null ? null : Math.round(maxPrice*100),
    inStock,
  ];
  const fromWhere = `FROM shop_products p
    JOIN shop_categories c ON c.id=p.category_id AND c.is_active=TRUE
    WHERE p.is_active=TRUE
      AND ($1::text='' OR p.category_id=$1)
      AND ($2::text='' OR p.title ILIKE ('%' || $2 || '%') OR p.subtitle ILIKE ('%' || $2 || '%'))
      AND ($3::bigint IS NULL OR p.price_minor >= $3)
      AND ($4::bigint IS NULL OR p.price_minor <= $4)
      AND (NOT $5::boolean OR p.stock_count > 0)`;
  const client = await getPool().connect();
  try {
    // Same snapshot for the count and page, even if another administrator changes the catalog.
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const count = await client.query<{ total: string }>(`SELECT COUNT(*)::text AS total ${fromWhere}`,values);
    const total = Number(count.rows[0].total);
    const results = await client.query<Row>(
      `SELECT ${columns} ${fromWhere} ORDER BY ${orderBy[sort]} LIMIT $6 OFFSET $7`,
      [...values,limit,(page-1)*limit]
    );
    await client.query("COMMIT");
    return { items:results.rows.map(mapProduct),total,page,limit,totalPages:Math.ceil(total/limit),source:"database" };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch {}
    throw err;
  } finally { client.release(); }
}
export async function getProduct(id: string): Promise<Product | null> {
  if (!databaseEnabled()) return demo.find(p=>p.id===id) ?? null;
  const result = await getPool().query<Row>(
    `SELECT ${columns} FROM shop_products p
       JOIN shop_categories c ON c.id=p.category_id AND c.is_active=TRUE
       WHERE p.id=$1 AND p.is_active=TRUE LIMIT 1`, [id]);
  return result.rows.length ? mapProduct(result.rows[0]) : null;
}
export async function lookupProducts(ids: string[]): Promise<Product[]> {
  if (ids.length===0) return [];
  if (!databaseEnabled()) return ids.flatMap(id=>{const p=demo.find(x=>x.id===id);return p?[p]:[];});
  const result = await getPool().query<Row>(
    `SELECT ${columns} FROM shop_products p
       JOIN shop_categories c ON c.id=p.category_id AND c.is_active=TRUE
       WHERE p.id=ANY($1::text[]) AND p.is_active=TRUE`, [ids]);
  const map = new Map(result.rows.map(row=>[row.id,mapProduct(row)]));
  return ids.flatMap(id=>{const p=map.get(id);return p?[p]:[];});
}
export async function listCategories(): Promise<{items:StoreCategory[];source:"demo"|"database"}> {
  if (!databaseEnabled()) return {items:demoCategories,source:"demo"};
  const result = await getPool().query<StoreCategory>(
    "SELECT id,title,emoji,tone FROM shop_categories WHERE is_active=TRUE ORDER BY display_order,id");
  return {items:result.rows,source:"database"};
}
