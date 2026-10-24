import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function imageExtension(content: Buffer): "png" | "jpg" | "webp" | null {
  if (content.length < 12 || content.length > MAX_IMAGE_BYTES) return null;
  const png = content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (png) {
    return content.length >= 45 &&
      content.toString("ascii", 12, 16) === "IHDR" &&
      content.readUInt32BE(16) > 0 && content.readUInt32BE(16) <= 16000 &&
      content.readUInt32BE(20) > 0 && content.readUInt32BE(20) <= 16000 &&
      content.toString("ascii", content.length - 8, content.length - 4) === "IEND"
      ? "png" : null;
  }
  if (content[0] === 255 && content[1] === 216) {
    return content.length >= 32 &&
      content[content.length - 2] === 255 &&
      content[content.length - 1] === 217 ? "jpg" : null;
  }
  if (content.toString("ascii", 0, 4) === "RIFF" &&
      content.toString("ascii", 8, 12) === "WEBP") {
    return content.length >= 20 &&
      content.readUInt32LE(4) + 8 === content.length &&
      ["VP8 ", "VP8L", "VP8X"].includes(content.toString("ascii", 12, 16))
      ? "webp" : null;
  }
  return null;
}

export function localUploadsAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.VIRA_LOCAL_UPLOADS === "1";
}

export async function storeImage(content: Buffer): Promise<string> {
  const ext = imageExtension(content);
  if (!ext) throw new Error("INVALID_IMAGE");
  const dir = join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${ext}`;
  await writeFile(join(dir, name), content, { flag: "wx" });
  // Keep established database URLs compatible; publicImageUrl maps them to
  // /api/media/ at render time for reliable production delivery.
  return `/uploads/${name}`;
}
