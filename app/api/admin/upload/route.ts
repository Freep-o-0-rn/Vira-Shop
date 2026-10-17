import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { adminGuard } from "@/lib/server/admin-guard";
import { failureResponse } from "@/lib/server/admin-auth";

export const runtime = "nodejs";
const MAX_SIZE = 5 * 1024 * 1024;
export async function POST(request: NextRequest) {
  try {
    const denied = await adminGuard(request, true);
    if (denied) return denied;
    // Local disk uploads are not durable across container deployments.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Загрузка изображений в production отключена до подключения объектного хранилища." }, { status: 501 });
    }
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_SIZE + 10000) return NextResponse.json({ error: "Файл слишком большой (не более 5 МБ)." }, { status: 413 });
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File)) return NextResponse.json({ error: "Выберите изображение." }, { status: 400 });
    if (image.size < 12 || image.size > MAX_SIZE) return NextResponse.json({ error: "Размер файла: до 5 МБ." }, { status: 413 });
    const content = Buffer.from(await image.arrayBuffer());
    const png = content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = content[0] === 255 && content[1] === 216 && content[2] === 255;
    const webp = content.toString("ascii",0,4) === "RIFF" && content.toString("ascii",8,12) === "WEBP";
    const ext = png ? "png" : jpeg ? "jpg" : webp ? "webp" : null;
    if (!ext) return NextResponse.json({ error: "Разрешены только PNG, JPEG и WebP." }, { status: 415 });
    const dir = join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(dir, name), content, { flag: "wx" });
    return NextResponse.json({ url: `/uploads/${name}` }, { status: 201 });
  } catch (err) { return failureResponse(err); }
}
