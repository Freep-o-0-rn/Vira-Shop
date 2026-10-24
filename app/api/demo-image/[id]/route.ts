import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

// Only product-photo IDs are accepted; users cannot supply a URL/host.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHOTO_ID = /^photo-\d{10,13}-[0-9a-f]{12}$/;
const MAX_BYTES = 5 * 1024 * 1024;
const execFileAsync = promisify(execFile);
const inFlight = new Map<string, Promise<Buffer>>();

function validJpeg(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 32 && bytes.byteLength <= MAX_BYTES &&
    bytes[0] === 0xff && bytes[1] === 0xd8 &&
    bytes[bytes.byteLength - 2] === 0xff && bytes[bytes.byteLength - 1] === 0xd9;
}

async function downloadWithNode(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), cache: "no-store" });
  if (!response.ok) throw new Error(`Image source HTTP ${response.status}`);
  const mime = response.headers.get("content-type")?.split(";")[0].trim();
  if (mime !== "image/jpeg") throw new Error(`Unexpected image format: ${mime}`);
  const declared = Number(response.headers.get("content-length") || "0");
  if (declared > MAX_BYTES) throw new Error("Photo exceeds 5 MB");
  const data = Buffer.from(await response.arrayBuffer());
  if (!validJpeg(data)) throw new Error("Invalid JPEG response");
  return data;
}

async function downloadWithCurl(url: string): Promise<Buffer> {
  // Windows curl.exe can use different proxy / system certificate settings
  // than Node.js fetch. No shell is involved and URLs are server-generated.
  const { stdout } = await execFileAsync("curl.exe", [
    "--fail", "--location", "--silent", "--show-error", "--max-time", "18",
    "--proto", "=https", "--proto-redir", "=https", url,
  ], { encoding: "buffer", timeout: 20000, maxBuffer: MAX_BYTES + 1024, windowsHide: true });
  const data = Buffer.from(stdout);
  if (!validJpeg(data)) throw new Error("Invalid JPEG from curl");
  return data;
}

async function fetchPhoto(id: string): Promise<Buffer> {
  // Source domain and URL format are fixed; client-controlled URLs are rejected.
  const original = `https://images.unsplash.com/${id}?fit=crop&w=650&q=80&fm=jpg`;
  const alternate = `https://wsrv.nl/?url=${encodeURIComponent("images.unsplash.com/" + id)}&w=650&q=80&output=jpg`;
  let lastError: unknown;
  for (const url of [original, alternate]) {
    try { return await downloadWithNode(url); }
    catch (error) { lastError = error; }
    if (process.platform === "win32") {
      try { return await downloadWithCurl(url); }
      catch (error) { lastError = error; }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Image provider unavailable");
}

async function loadPhoto(id: string): Promise<Buffer> {
  const path = join(process.cwd(), "public", "uploads", "demo-photo-cache", `${id}.jpg`);
  try {
    const cached = await readFile(path);
    if (validJpeg(cached)) return cached;
    console.warn("[Vira Shop] Invalid cached demo photo, refreshing:", id);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.warn("[Vira Shop] Demo photo cache read issue:", error);
  }
  const image = await fetchPhoto(id);
  const tmp = path + "." + randomUUID() + ".tmp";
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(tmp, image, { flag: "wx" });
    await rename(tmp, path);
  } catch (error) {
    console.warn("[Vira Shop] Demo photo cache write issue:", error);
    try { await unlink(tmp); } catch {}
  }
  return image;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!PHOTO_ID.test(id)) return new Response("Not found", { status: 404 });
  let task = inFlight.get(id);
  if (!task) {
    task = loadPhoto(id);
    inFlight.set(id, task);
    void task.then(() => inFlight.delete(id), () => inFlight.delete(id));
  }
  try {
    const image = await task;
    // Copy to a plain ArrayBuffer for compatibility with TypeScript's BodyInit.
    const body = new ArrayBuffer(image.byteLength);
    new Uint8Array(body).set(image);
    return new Response(body, { headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(image.byteLength),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    }});
  } catch (error) {
    console.error("[Vira Shop] Could not load demo photo", id, error);
    return new Response("Photo provider unavailable", {
      status: 502, headers: { "Cache-Control": "no-store" },
    });
  }
}
