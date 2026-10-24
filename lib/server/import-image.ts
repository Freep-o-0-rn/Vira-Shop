import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
import { get } from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { imageExtension, MAX_IMAGE_BYTES, storeImage } from "@/lib/server/image-storage";

export class ImageImportError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function allowedPublicIPv4(ip: string): boolean {
  const v = ip.split(".").map(Number);
  if (v.length !== 4 || v.some(x => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a,b,c] = v;
  // Reject non-global and reserved destinations (SSRF). Reject all IPv6
  // by resolving/pinning A records only.
  if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 255) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && c === 0))) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function parseUrl(value: string, base?: URL): URL {
  if (typeof value !== "string" || value.length > 1500 || !value.trim())
    throw new ImageImportError("Некорректный адрес изображения.");
  let result: URL;
  try { result = base ? new URL(value, base) : new URL(value); }
  catch { throw new ImageImportError("Введите корректную HTTPS-ссылку."); }
  if (result.protocol !== "https:" || result.port || result.username || result.password ||
      isIP(result.hostname) !== 0 ||
      !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(result.hostname) ||
      result.hostname.endsWith(".localhost") || result.hostname.endsWith(".local")) {
    throw new ImageImportError("Разрешены только публичные HTTPS-адреса изображений.");
  }
  return result;
}

async function fetchPinned(url: URL): Promise<{ body: Buffer; headers: IncomingHttpHeaders; status: number }> {
  let records: string[];
  try { records = await resolve4(url.hostname); }
  catch { throw new ImageImportError("Не удалось найти сервер фотографии.", 502); }
  if (records.length === 0 || records.some(ip => !allowedPublicIPv4(ip)))
    throw new ImageImportError("Адрес изображения недоступен для безопасной загрузки.");
  const ip = records[0];
  return new Promise((resolve, reject) => {
    const req = get(url, {
      family: 4,
      lookup: (_hostname, _options, callback) => callback(null, ip, 4),
      headers: { Accept: "image/jpeg,image/png,image/webp", "User-Agent": "ViraShop/0.15 Image Import" },
    }, async response => {
      try {
        const status = response.statusCode || 502;
        // Redirects are handled by the caller and validated on every hop.
        if (status >= 300 && status < 400) {
          response.resume();
          resolve({ body: Buffer.alloc(0), headers: response.headers, status });
          return;
        }
        if (status !== 200) throw new ImageImportError("Сайт-источник не отдал изображение.", 502);
        const contentLength = Number(response.headers["content-length"] || "0");
        if (contentLength > MAX_IMAGE_BYTES) throw new ImageImportError("Изображение превышает 5 МБ.", 413);
        const contentType = String(response.headers["content-type"] || "").split(";")[0].trim();
        if (!["image/png", "image/jpeg", "image/webp"].includes(contentType))
          throw new ImageImportError("По ссылке нет PNG, JPEG или WebP.", 415);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of response) {
          const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += b.length;
          if (size > MAX_IMAGE_BYTES) throw new ImageImportError("Изображение превышает 5 МБ.", 413);
          chunks.push(b);
        }
        resolve({ body: Buffer.concat(chunks), headers: response.headers, status });
      } catch (error) { reject(error); response.destroy(); }
    });
    req.setTimeout(12000, () => req.destroy(new ImageImportError("Превышено время загрузки фотографии.", 502)));
    req.on("error", reject);
  });
}

export async function importImage(source: string): Promise<string> {
  let url = parseUrl(source);
  for (let redirects = 0; redirects < 4; redirects++) {
    const response = await fetchPinned(url);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) throw new ImageImportError("Ссылка перенаправляет на неизвестный адрес.", 502);
      url = parseUrl(location, url);
      continue;
    }
    if (!imageExtension(response.body))
      throw new ImageImportError("Получено повреждённое или неподдерживаемое изображение.", 415);
    return storeImage(response.body);
  }
  throw new ImageImportError("Слишком много перенаправлений при загрузке изображения.", 502);
}
