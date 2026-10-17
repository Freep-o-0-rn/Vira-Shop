export type ProductInput = {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  images: string[];
  specs: { name: string; value: string }[];
  badge: string | null;
  priceMinor: number;
  oldPriceMinor: number | null;
  stock: number;
  active: boolean;
};

export function isId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}
export function isCategoryId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_-]{1,64}$/.test(value);
}
export function amountToMinor(value: unknown): number | null {
  const input = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof input !== "string" || !/^\d{1,9}(\.\d{1,2})?$/.test(input)) return null;
  const [rub, kop = ""] = input.split(".");
  const minor = Number(rub) * 100 + Number(kop.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor <= 900000000000 ? minor : null;
}
export function validImage(value: string): boolean {
  if (!value) return true;
  if (/^\/uploads\/[a-f0-9-]{36}\.(png|jpe?g|webp)$/.test(value)) return true;
  try { const url = new URL(value); return url.protocol === "https:" && value.length <= 1500 && !url.username && !url.password; }
  catch { return false; }
}
export function productInput(value: unknown, autoArticle = false): { data: ProductInput } | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Передайте объект товара." };
  const obj = value as Record<string, unknown>;
  if (!isId(obj.id) && !(autoArticle && (obj.id === "" || obj.id === undefined))) return { error: "Неверный артикул товара." };
  if (!isCategoryId(obj.category)) return { error: "Укажите допустимую категорию." };
  if (typeof obj.title !== "string" || obj.title.trim().length < 1 || obj.title.length > 200) return { error: "Название: 1–200 символов." };
  const subtitle = typeof obj.subtitle === "string" ? obj.subtitle.trim() : "";
  const description = typeof obj.description === "string" ? obj.description.trim() : "";
  const badge = typeof obj.badge === "string" && obj.badge.trim() ? obj.badge.trim() : null;
  const image = typeof obj.image === "string" ? obj.image.trim() : "";
  if (subtitle.length > 500 || description.length > 10000 || (badge?.length ?? 0) > 50 || !validImage(image)) {
    return { error: "Некорректное описание, значок или адрес изображения (разрешён HTTPS или /uploads/)." };
  }
  const proposedImages = obj.images === undefined ? (image ? [image] : []) : obj.images;
  if (!Array.isArray(proposedImages) || proposedImages.length > 8 ||
      proposedImages.some((entry: unknown) => typeof entry !== "string" || !entry || !validImage(entry))) {
    return { error: "Можно указать до 8 корректных HTTPS-фотографий." };
  }
  const images = [...new Set(proposedImages as string[])];
  if (image && !images.includes(image)) images.unshift(image);
  if (images.length > 8) return { error: "Не более 8 изображений." };
  if (image && images[0] !== image) {
    const index=images.indexOf(image); if(index>=0)images.splice(index,1);
    images.unshift(image);
  }
  const inputSpecs = obj.specs === undefined ? [] : obj.specs;
  if (!Array.isArray(inputSpecs) || inputSpecs.length > 20 ||
      inputSpecs.some((item: unknown) =>
        !item || typeof item !== "object" || Array.isArray(item) ||
        typeof (item as {name?:unknown}).name !== "string" ||
        typeof (item as {value?:unknown}).value !== "string" ||
        !(item as {name:string}).name.trim() ||
        (item as {name:string}).name.length > 80 ||
        !(item as {value:string}).value.trim() ||
        (item as {value:string}).value.length > 200)) {
    return { error: "Характеристики: до 20 пар «название — значение»." };
  }
  const specs = (inputSpecs as {name:string;value:string}[]).map(s=>({name:s.name.trim(),value:s.value.trim()}));
  const priceMinor = amountToMinor(obj.price);
  const oldPriceMinor = obj.oldPrice === "" || obj.oldPrice === null || obj.oldPrice === undefined ? null : amountToMinor(obj.oldPrice);
  if (priceMinor === null || (obj.oldPrice !== "" && obj.oldPrice !== undefined && obj.oldPrice !== null && oldPriceMinor === null)) {
    return { error: "Цена должна быть положительным числом рублей, максимум две цифры после точки." };
  }
  const stock = obj.stock;
  if (typeof stock !== "number" || !Number.isSafeInteger(stock) || stock < 0 || stock > 100000000) {
    return { error: "Остаток должен быть целым числом от 0 до 100 000 000." };
  }
  if (typeof obj.active !== "boolean") return { error: "Укажите статус товара." };
  return {
    data: { id: typeof obj.id === "string" ? obj.id : "", category: obj.category, title: obj.title.trim(),
      subtitle, description, badge, image: images[0] ?? '', images, specs, priceMinor, oldPriceMinor, stock, active: obj.active }
  };
}
export function categoryInput(value: unknown): { data: { id: string; title: string; emoji: string; tone: string; active: boolean } } | { error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Передайте объект категории." };
  const obj = value as Record<string, unknown>;
  if (!isCategoryId(obj.id) || typeof obj.title !== "string" || obj.title.trim().length < 1 || obj.title.length > 120) {
    return { error: "Неверный ID или название категории." };
  }
  if (typeof obj.emoji !== "string" || obj.emoji.length > 48 ||
      typeof obj.tone !== "string" || !["blue", "peach", "pink", "green", "lilac"].includes(obj.tone) ||
      typeof obj.active !== "boolean") {
    return { error: "Некорректная иконка, цвет или статус категории." };
  }
  return { data: { id: obj.id, title: obj.title.trim(), emoji: obj.emoji, tone: obj.tone, active: obj.active } };
}
