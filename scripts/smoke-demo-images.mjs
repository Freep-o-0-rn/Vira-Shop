import assert from "node:assert/strict";

const base = "http://127.0.0.1:3000";
let ready = false;
for (let i = 0; i < 50; i++) {
  try {
    const r = await fetch(base + "/catalog");
    if (r.status === 200) { ready = true; break; }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 400));
}
assert.ok(ready, "Shop not ready");
for (const path of ["/", "/catalog", "/admin/login"]) {
  const res = await fetch(base + path);
  assert.equal(res.status, 200, path + " must not return 404");
}
const invalid = await fetch(base + "/api/demo-image/not-a-photo-id");
assert.equal(invalid.status, 404);
const catalog = await fetch(base + "/api/products?limit=12");
assert.equal(catalog.status, 200);
const payload = await catalog.json();
assert.ok(payload.items.length > 0);
for (const p of payload.items) {
  if (p.image.includes("unsplash.com")) throw Error("External demo photo leaked: " + p.id);
  if (p.image) assert.ok(
    p.image.startsWith("/api/demo-image/") || p.image.startsWith("/uploads/") || p.image.startsWith("https://"),
    "Unexpected photo URL " + p.id,
  );
}
console.log("Stable homepage, catalog, admin login and image routing: OK");
