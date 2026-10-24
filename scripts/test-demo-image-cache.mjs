import assert from "node:assert/strict";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { GET } from "../app/api/demo-image/[id]/route.ts";

const id = "photo-1234567890123-123456789abc";
const dir = join(process.cwd(), "public", "uploads", "demo-photo-cache");
const path = join(dir, id + ".jpg");
await mkdir(dir, { recursive: true });
const bytes = Buffer.alloc(48, 42);
bytes[0] = 0xff;
bytes[1] = 0xd8;
bytes[46] = 0xff;
bytes[47] = 0xd9;
await writeFile(path, bytes);
try {
  const context = { params: Promise.resolve({ id }) };
  const image = await GET(new Request("http://localhost:3000/api/demo-image/" + id), context);
  assert.equal(image.status, 200, "A cached image must be served without network access");
  assert.equal(image.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes);
  const invalid = await GET(new Request("http://localhost:3000/api/demo-image/invalid"),
    { params: Promise.resolve({ id: "invalid" }) });
  assert.equal(invalid.status, 404);
  console.log("Offline demo-photo cache route test passed.");
} finally {
  await unlink(path);
}
