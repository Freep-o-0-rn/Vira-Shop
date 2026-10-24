import { NextRequest, NextResponse } from "next/server";
import { adminGuard, readJson } from "@/lib/server/admin-guard";
import { failureResponse } from "@/lib/server/admin-auth";
import { localUploadsAllowed } from "@/lib/server/image-storage";
import { ImageImportError, importImage } from "@/lib/server/import-image";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const denied = await adminGuard(request, true);
    if (denied) return denied;
    if (!localUploadsAllowed()) {
      return NextResponse.json({ error: "Загрузка отключена. На собственном сервере включите VIRA_LOCAL_UPLOADS=1." }, { status: 501 });
    }
    const body: unknown = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || !("url" in body) || typeof body.url !== "string")
      return NextResponse.json({ error: "Укажите HTTPS-ссылку на фотографию." }, { status: 400 });
    const url = await importImage(body.url);
    return NextResponse.json({ url }, { status: 201 });
  } catch (error) {
    if (error instanceof ImageImportError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return failureResponse(error);
  }
}
