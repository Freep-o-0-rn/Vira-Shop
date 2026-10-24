/** Rewrite only known Unsplash image URLs to a first-party image endpoint.
 * Existing uploaded photos and other HTTPS images are not modified.
 */
export function localDemoPhoto(src: string): string {
  if (!src || !src.startsWith("https://images.unsplash.com/")) return src;
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" || url.hostname !== "images.unsplash.com" ||
        url.port || url.username || url.password) return src;
    const match = /^\/(photo-\d{10,13}-[0-9a-f]{12})$/.exec(url.pathname);
    return match ? `/api/demo-image/${match[1]}` : src;
  } catch {
    return src;
  }
}
