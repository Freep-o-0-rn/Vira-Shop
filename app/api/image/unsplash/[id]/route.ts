/**
 * Same-origin delivery for the original demonstration products.
 * On first successful download, cache the JPEG on disk for later visitors.
 * Real customer-uploaded images are served by /api/media/[filename].
 */
import { execFile } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { promisify } from "node:util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const execFileAsync = promisify(execFile);
const MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_ID = /^photo-\d{13}-[0-9a-f]{12}$/;

function isJpeg(data: Uint8Array): boolean {
  return data.byteLength >= 4 && data.byteLength <= MAX_BYTES
    && data[0] === 0xff && data[1] === 0xd8
    && data[data.byteLength - 2] === 0xff && data[data.byteLength - 1] === 0xd9;
}
function imageResponse(image: Uint8Array, source: "local" | "remote"): Response {
  const body = new ArrayBuffer(image.byteLength);
  new Uint8Array(body).set(image);
  return new Response(body, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(image.byteLength),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      "X-Vira-Image-Source": source,
    },
  });
}

async function downloadJpeg(url: string): Promise<Uint8Array> {
  try {
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      cache: "force-cache",
    });
    if (!upstream.ok) throw Error(`Unsplash HTTP ${upstream.status}`);
    const mime = upstream.headers.get("content-type")?.split(";")[0].trim();
    if (mime !== "image/jpeg") throw Error("Unsplash did not return JPEG");
    const declared = Number(upstream.headers.get("content-length") || "0");
    if (declared > MAX_BYTES) throw Error("Unsplash image too large");
    const content = new Uint8Array(await upstream.arrayBuffer());
    if (!isJpeg(content)) throw Error("Unsplash invalid JPEG");
    return content;
  } catch (error) {
    // On managed Windows servers curl.exe can use a different OS proxy /
    // certificate configuration than Node fetch(). The fallback runs
    // automatically and uses only a server-constructed Unsplash URL.
    if (process.platform !== "win32") throw error;
    console.warn("[Vira Shop] Unsplash Node fetch failed, trying curl:", error);
    const { stdout } = await execFileAsync("curl.exe", [
      "--fail", "--silent", "--show-error", "--location",
      "--proto-redir", "=https", "--max-time", "15", url,
    ], { encoding: "buffer", maxBuffer: MAX_BYTES + 1024, timeout: 17000 });
    const content = new Uint8Array(stdout);
    if (!isJpeg(content)) throw Error("curl did not return a valid JPEG");
    return content;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!PHOTO_ID.test(id)) return new Response("Image not found", { status: 404 });
  const path = join(process.cwd(), "public", "uploads", "unsplash-cache", id + ".jpg");
  try {
    const local = await readFile(path);
    if (isJpeg(local)) return imageResponse(new Uint8Array(local), "local");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.error("[Vira Shop] Cache read failed:", error);
  }
  const url = `https://images.unsplash.com/${id}?fit=crop&w=800&q=80&fm=jpg`;
  try {
    const content = await downloadJpeg(url);
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST")
        console.error("[Vira Shop] Unsplash cache write failed:", error);
    }
    return imageResponse(content, "remote");
  } catch (error) {
    console.error("[Vira Shop] Unsplash image unavailable:", id, error);
    return new Response("Image source unavailable", {
      status: 502, headers: { "Cache-Control": "no-store" },
    });
  }
}
