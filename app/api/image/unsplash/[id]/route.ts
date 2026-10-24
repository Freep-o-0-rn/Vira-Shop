/**
 * Same-origin proxy for Unsplash product photographs.
 * Only a validated Unsplash photo ID is accepted: there is no caller-supplied URL,
 * so this endpoint cannot be used to reach arbitrary servers.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_ID = /^photo-\d{13}-[0-9a-f]{12}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!PHOTO_ID.test(id)) {
    return new Response("Image not found", { status: 404 });
  }

  try {
    // JPEG is supported by all browsers, including older mobile browsers.
    const upstream = await fetch(
      `https://images.unsplash.com/${id}?fit=crop&w=800&q=80&fm=jpg`,
      { signal: AbortSignal.timeout(10000), cache: "force-cache" },
    );

    if (!upstream.ok) {
      return new Response("Image source unavailable", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const contentType = upstream.headers.get("content-type")?.split(";")[0].trim();
    const declaredLength = Number(upstream.headers.get("content-length") || "0");
    if (contentType !== "image/jpeg" || declaredLength > MAX_BYTES) {
      return new Response("Unsupported image response", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const content = await upstream.arrayBuffer();
    if (!content.byteLength || content.byteLength > MAX_BYTES) {
      return new Response("Invalid image size", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return new Response(content, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(content.byteLength),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[Vira Shop] Unsplash image proxy:", error);
    return new Response("Image source unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
