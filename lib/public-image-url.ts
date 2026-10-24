/**
 * Serve Unsplash product photos through our own origin.
 * Browsers on some mobile networks cannot reach images.unsplash.com directly.
 * Uploaded (/uploads/), relative and other HTTPS images are left unchanged.
 */
export function publicImageUrl(source: string): string {
  if (!source || !source.startsWith("https://")) return source;
  try {
    const url = new URL(source);
    if (url.hostname !== "images.unsplash.com" || url.port || url.username || url.password) return source;
    const match = /^\/(photo-\d{13}-[0-9a-f]{12})$/.exec(url.pathname);
    return match ? `/api/image/unsplash/${match[1]}` : source;
  } catch {
    return source;
  }
}
