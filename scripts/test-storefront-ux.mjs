import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const shop=readFileSync(new URL("../components/shop.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");

const required=[
 'const [catalog, setCatalog] = useState<Product[]>([])',
 'const [storeCategories, setStoreCategories] = useState<StoreCategory[]>([])',
 'setCatalogSource("error")',
 'setHomeReloadKey(k=>k+1)',
 'className="storefront-product-skeleton"',
 'className="storefront-category-skeleton"',
 'className="catalog-mobile-controls"',
 'aria-expanded={filtersOpen}',
 'aria-controls="catalog-filter-panel"',
 'className={"catalog-filters"+(filtersOpen?" is-open":"")}',
 'className="storefront-clear-filters"',
 'onClick={resetFilters}',
 'className="site-mobile-bottom-nav"',
 'aria-current={view===target?"page":undefined}',
 'className="storefront-service-notice"',
];
for(const text of required)assert.ok(shop.includes(text),"Missing storefront UX feature: "+text);
assert.ok(!shop.includes("Каталог загружается из PostgreSQL"),
 "Do not expose technical database messages to customers");
assert.ok(!shop.includes("временно показаны демонстрационные товары"),
 "Do not pretend demonstration goods are real on connection failure");
assert.match(css, /@media\(max-width:780px\)\{[\s\S]*?\.catalog-filters:not\(\.is-open\)\{display:none\}/,
 "Mobile filters must collapse");
assert.match(css, /@media\(max-width:600px\)\{[\s\S]*?\.site-mobile-bottom-nav\{display:grid/,
 "Quick navigation must appear only on mobile");
console.log("Storefront loading, mobile navigation and catalog filters structure passed.");
