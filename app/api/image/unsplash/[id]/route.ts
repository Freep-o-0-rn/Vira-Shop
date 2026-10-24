/**
 * Same-origin delivery of Unsplash-backed product photographs.
 * Locally cached JPEGs in public/uploads/unsplash-cache take priority, so
 * existing storefronts keep showing images when Unsplash is inaccessible.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_ID = /^photo-\d{13}-[0-9a-f]{12}$/;

function isJpeg(data: Uint8Array): boolean {
  return data.length >= 4 && data.length <= MAX_BYTES
    && data[0] === 0xff && data[1] === 0xd8
    && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9;
}

function imageResponse(image: Uint8Array, source: "local" | "remote"): Response {
  return new Response(image, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(image.byteLength),
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
      "X-Vira-Image-Source": source,
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!PHOTO_ID.test(id)) return new Response("Image not found", { status: 404 });

  // These files are included in the existing Windows backup/import workflow.
  const path = join(process.cwd(), "public", "uploads", "unsplash-cache", id + ".jpg");
  try {
    const local = await readFile(path);
    if (isJpeg(local)) return imageResponse(new Uint8Array(local), "local");
    console.error("[Vira Shop] Invalid cached image:", id);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.error("[Vira Shop] Cannot read cached image:", id, error);
  }

  // Existing fallback for images not yet downloaded to local storage.
  try {
    const upstream = await fetch(
      `https://images.unsplash.com/${id}?fit=crop&w=800&q=80&fm=jpg`,
      { signal: AbortSignal.timeout(10000), cache: "force-cache" },
    );
    if (!upstream.ok) {
      console.error("[Vira Shop] Unsplash returned:", upstream.status, id);
      return new Response("Image source unavailable", { status: 502 });
    }
    const type = upstream.headers.get("content-type")?.split(";")[0].trim();
    const size = Number(upstream.headers.get("content-length") || "0");
    if (type !== "image/jpeg" || size > MAX_BYTES) {
      console.error("[Vira Shop] Unsplash unexpected response:", type, size, id);
      return new Response("Unsupported image response", { status: 502 });
    }
    const content = new Uint8Array(await upstream.arrayBuffer());
    if (!isJpeg(content))
      return new Response("Invalid image data", { status: 502 });
    return imageResponse(content, "remote");
  } catch (error) {
    console.error("[Vira Shop] Unsplash fetch failed:", id, error);
    return new Response("Image source unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
