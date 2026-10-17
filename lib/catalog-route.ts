/**
 * Browser address model for the storefront catalog.
 * Keep this module free of browser and framework dependencies so it can be
 * tested with Node as well as reused in the React storefront.
 */
export type StorefrontView = "home" | "catalog" | "favorites" | "cart";
export type CatalogOrder = "popular" | "cheap" | "expensive" | "rating";
export type CatalogRoute = {
  q: string;
  category: string;
  sort: CatalogOrder;
  page: number;
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
};
export const defaultCatalogRoute: CatalogRoute = {
  q: "", category: "", sort: "popular", page: 1,
  minPrice: "", maxPrice: "", inStock: false,
};
const priceValid = (v: string) => /^\d{1,9}(\.\d{1,2})?$/.test(v);
const sortValues: CatalogOrder[] = ["popular", "cheap", "expensive", "rating"];

export function pathToView(path: string): StorefrontView {
  if (path === "/catalog" || path === "/catalog/") return "catalog";
  if (path === "/favorites" || path === "/favorites/") return "favorites";
  if (path === "/cart" || path === "/cart/") return "cart";
  return "home";
}

export function parseCatalogRoute(search: string): CatalogRoute {
  const p = new URLSearchParams(search);
  const q = (p.get("q") ?? "").trim().slice(0, 100);
  const rawCategory = p.get("category") ?? "";
  const category = /^[a-z0-9_-]{1,64}$/.test(rawCategory) ? rawCategory : "";
  const rawSort = p.get("sort") ?? "popular";
  const sort: CatalogOrder = sortValues.includes(rawSort as CatalogOrder) ? rawSort as CatalogOrder : "popular";
  const rawPage = p.get("page") ?? "1";
  const page = /^\d{1,6}$/.test(rawPage) && Number(rawPage) >= 1 && Number(rawPage) <= 100000
    ? Number(rawPage) : 1;
  const min = p.get("minPrice") ?? "";
  const max = p.get("maxPrice") ?? "";
  let minPrice = priceValid(min) ? min : "";
  let maxPrice = priceValid(max) ? max : "";
  if (minPrice && maxPrice && Number(minPrice) > Number(maxPrice)) {
    minPrice = ""; maxPrice = "";
  }
  return {q, category, sort, page, minPrice, maxPrice, inStock:p.get("inStock")==="true"};
}

export function catalogHref(route: CatalogRoute): string {
  const p = new URLSearchParams();
  if (route.q) p.set("q",route.q.trim().slice(0,100));
  if (route.category) p.set("category",route.category);
  if (route.sort !== "popular") p.set("sort",route.sort);
  if (route.minPrice) p.set("minPrice",route.minPrice);
  if (route.maxPrice) p.set("maxPrice",route.maxPrice);
  if (route.inStock) p.set("inStock","true");
  if (route.page > 1) p.set("page",String(route.page));
  const query = p.toString();
  return "/catalog" + (query ? "?"+query : "");
}
