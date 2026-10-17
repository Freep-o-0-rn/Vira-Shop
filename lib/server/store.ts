import { categories as demoCategories, products as demoProducts, type Product, type StoreCategory } from "@/lib/catalog";
import { databaseEnabled, getPool } from "@/lib/server/db";

export type SortOrder = "popular" | "cheap" | "expensive" | "rating";
export type ProductFilters = {
  search: string;
  category: string;
  sort: SortOrder;
  page: number;
  limit: number;
};
export type ProductList = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
  source: "demo" | "database";
};

const orderBy: Record<SortOrder, string> = {
  popular: "p.reviews DESC, p.rating DESC, p.id ASC",
  cheap: "p.price_minor ASC, p.id ASC",
  expensive: "p.price_minor DESC, p.id ASC",
  rating: "p.rating DESC, p.reviews DESC, p.id ASC",
};

type Row = {
  id: string;
  title: string;
  subtitle: string;
  category: string;
  price_minor: string;
  old_price_minor: string | null;
  rating: string;
  reviews: number;
  image_url: string;
  badge: string | null;
  description: string;
  stock_count: number;
  full_count: string;
};

function mapProduct(row: Row): Product {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    category: row.category,
    price: Number(row.price_minor) / 100,
    ...(row.old_price_minor === null ? {} : { oldPrice: Number(row.old_price_minor) / 100 }),
    rating: Number(row.rating),
    reviews: row.reviews,
    image: row.image_url,
    ...(row.badge ? { badge: row.badge } : {}),
    description: row.description,
    stock: row.stock_count,
  };
}

export async function listProducts(filters: ProductFilters): Promise<ProductList> {
  const { search, category, sort, limit, page } = filters;
  if (!databaseEnabled()) {
    const q = search.toLocaleLowerCase("ru");
    let entries = demoProducts.filter((p) => (!category || p.category === category) &&
      (!q || (p.title + " " + p.subtitle).toLocaleLowerCase("ru").includes(q)));
    if (sort === "cheap") entries = [...entries].sort((a, b) => a.price - b.price);
    if (sort === "expensive") entries = [...entries].sort((a, b) => b.price - a.price);
    if (sort === "rating") entries = [...entries].sort((a, b) => b.rating - a.rating);
    return { items: entries.slice((page - 1) * limit, page * limit), total: entries.length, page, limit, source: "demo" };
  }

  // sort SQL is selected from a fixed server-side mapping; user input is bound as parameters.
  const result = await getPool().query<Row>(
    `SELECT p.id, p.title, p.subtitle, p.category_id AS category,
            p.price_minor::text, p.old_price_minor::text,
            p.rating::text, p.reviews, p.image_url, p.badge, p.description, p.stock_count,
            COUNT(*) OVER ()::text AS full_count
       FROM shop_products p
      WHERE p.is_active = TRUE
        AND ($1::text = '' OR p.category_id = $1)
        AND ($2::text = '' OR p.title ILIKE ('%' || $2 || '%') OR p.subtitle ILIKE ('%' || $2 || '%'))
      ORDER BY ${orderBy[sort]}
      LIMIT $3 OFFSET $4`,
    [category, search, limit, (page - 1) * limit]
  );
  return {
    items: result.rows.map(mapProduct),
    total: result.rows.length ? Number(result.rows[0].full_count) : 0,
    page,
    limit,
    source: "database",
  };
}

export async function listCategories(): Promise<{ items: StoreCategory[]; source: "demo" | "database" }> {
  if (!databaseEnabled()) return { items: demoCategories, source: "demo" };
  const result = await getPool().query<StoreCategory>(
    "SELECT id, title, emoji, tone FROM shop_categories WHERE is_active = TRUE ORDER BY display_order ASC, id ASC"
  );
  return { items: result.rows, source: "database" };
}
