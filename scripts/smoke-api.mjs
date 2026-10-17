import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
let started = false;
for (let i = 0; i < 45; i++) {
  try {
    const res = await fetch(base + "/api/products?limit=100", { signal: AbortSignal.timeout(2000) });
    if (res.ok) { started = true; break; }
  } catch { /* Next.js may still be starting */ }
  await delay(1000);
}
assert.ok(started, "Next.js server did not become ready");

async function check(path, status = 200) {
  const res = await fetch(base + path, { signal: AbortSignal.timeout(5000) });
  assert.equal(res.status, status, path);
  return res.json();
}
const catalog = await check("/api/products?limit=100");
assert.equal(catalog.source, "database");
assert.equal(catalog.total, 12);
assert.equal(catalog.items.length, 12);
const headphones = catalog.items.find((p) => p.id === "p1");
assert.ok(headphones);
assert.equal(headphones.price, 3490);
assert.equal(headphones.stock, 25);

const categories = await check("/api/categories");
assert.equal(categories.source, "database");
assert.equal(categories.items.length, 5);
const narrowed = await check("/api/products?category=electronics&sort=cheap&limit=2&page=1");
assert.equal(narrowed.items.length, 2);
assert.ok(narrowed.items.every((p) => p.category === "electronics"));
assert.ok(narrowed.items[0].price <= narrowed.items[1].price);
const search = await check("/api/products?q=%D0%BD%D0%B0%D1%83%D1%88%D0%BD%D0%B8%D0%BA%D0%B8");
assert.equal(search.total, 1);
const secondPage = await check("/api/products?limit=5&page=2");
assert.equal(secondPage.items.length, 5);
await check("/api/products?sort=bad", 400);
await check("/api/products?limit=10000", 400);
console.log("PostgreSQL API smoke test passed.");
