import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serve uploaded files on demand. Files created after Next.js build are
// intentionally NOT served through Next.js's static public/ file manifest.
const FILENAME = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|jpeg|webp)$/;
const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
};
const MAX_SIZE = 5 * 1024 * 1024;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  if (!FILENAME.test(filename)) return new Response("Not found", { status: 404 });
  const path = join(process.cwd(), "public", "uploads", filename);
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size < 12 || info.size > MAX_SIZE)
      return new Response("Not found", { status: 404 });
    const bytes = await readFile(path);
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      headers: {
        "Content-Type": MIME[filename.split(".").pop()!],
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.error("[Vira Shop] Cannot read uploaded image:", error);
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
