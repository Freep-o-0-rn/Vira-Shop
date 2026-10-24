import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/server/admin-guard";
import { failureResponse } from "@/lib/server/admin-auth";
import { imageExtension, localUploadsAllowed, MAX_IMAGE_BYTES, storeImage } from "@/lib/server/image-storage";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const denied = await adminGuard(request, true);
    if (denied) return denied;
    if (!localUploadsAllowed()) {
      return NextResponse.json({
        error: "Локальная загрузка отключена. Для собственного постоянного сервера включите VIRA_LOCAL_UPLOADS=1.",
      }, { status: 501 });
    }
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_IMAGE_BYTES + 10000)
      return NextResponse.json({ error: "Файл слишком большой (не более 5 МБ)." }, { status: 413 });
    const form = await request.formData();
    const image = form.get("image");
    if (!(image instanceof File))
      return NextResponse.json({ error: "Выберите изображение." }, { status: 400 });
    if (image.size < 12 || image.size > MAX_IMAGE_BYTES)
      return NextResponse.json({ error: "Размер файла: до 5 МБ." }, { status: 413 });
    const content = Buffer.from(await image.arrayBuffer());
    if (!imageExtension(content))
      return NextResponse.json({ error: "Повреждённый или неподдерживаемый PNG, JPEG или WebP." }, { status: 415 });
    const url = await storeImage(content);
    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    return failureResponse(err);
  }
}
