// Verify images written AFTER next build are available without restarting.
// Run while a production/dev server is listening on port 3000.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const filename = randomUUID() + ".png";
const dir = join(process.cwd(), "public", "uploads");
const path = join(dir, filename);
// A valid 1x1 PNG, created only for this test; never touches customer data.
const expected = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDdkAAAAASUVORK5CYII=",
  "base64",
);

await mkdir(dir, { recursive: true });
await writeFile(path, expected, { flag: "wx" });
try {
  let response;
  for (let i = 0; i < 30; i++) {
    try {
      response = await fetch("http://127.0.0.1:3000/api/media/" + filename);
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  assert.ok(response, "shop server is not responding");
  assert.equal(response.status, 200, "new upload must be served immediately");
  assert.equal(response.headers.get("content-type"), "image/png");
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(bytes, expected, "image must remain byte-identical");
  const invalid = await fetch("http://127.0.0.1:3000/api/media/not-an-image.png");
  assert.equal(invalid.status, 404, "invalid file IDs must not be served");
  console.log("Verified: dynamically uploaded photo is accessible immediately.");
} finally {
  await rm(path, { force: true });
}
