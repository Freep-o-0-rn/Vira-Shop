/** Return a same-origin URL for every file uploaded through the admin panel.
 * Legacy /uploads/... links stay valid in the database and in imports.
 */
export function publicImageUrl(source: string): string {
  if (!source) return source;
  const upload = /^\/uploads\/([a-f0-9-]{36}\.(?:png|jpe?g|webp))$/.exec(source);
  if (upload) return `/api/media/${upload[1]}`;
  if (!source.startsWith("https://")) return source;
  try {
    const url = new URL(source);
    if (url.hostname !== "images.unsplash.com" || url.port || url.username || url.password)
      return source;
    const match = /^\/(photo-\d{13}-[0-9a-f]{12})$/.exec(url.pathname);
    return match ? `/api/image/unsplash/${match[1]}` : source;
  } catch {
    return source;
  }
}
