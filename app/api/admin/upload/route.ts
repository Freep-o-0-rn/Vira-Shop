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
    // Disabled by default in production: ephemeral cloud/container disks are
    // unsuitable for durable uploads. Only enable for a managed local/VPS
    // installation where public/uploads is persistent and backed up.
    if (process.env.NODE_ENV === "production" && process.env.VIRA_LOCAL_UPLOADS !== "1") {
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
    // Reject obvious masquerading/truncated inputs before saving.
    const pngValid = png && content.length >= 45 &&
      content.toString("ascii",12,16)==="IHDR" &&
      content.readUInt32BE(16)>0 && content.readUInt32BE(16)<=16000 &&
      content.readUInt32BE(20)>0 && content.readUInt32BE(20)<=16000 &&
      content.toString("ascii",content.length-8,content.length-4)==="IEND";
    const jpgValid = jpeg && content.length >= 32 &&
      content[content.length-2]===255 && content[content.length-1]===217;
    const webpValid = webp && content.length>=20 &&
      content.readUInt32LE(4)+8===content.length &&
      ["VP8 ","VP8L","VP8X"].includes(content.toString("ascii",12,16));
    if(!(pngValid||jpgValid||webpValid))
      return NextResponse.json({error:"Повреждённый или неподдерживаемый файл изображения."},{status:415});
    const dir = join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(join(dir, name), content, { flag: "wx" });
    return NextResponse.json({ url: `/uploads/${name}` }, { status: 201 });
  } catch (err) { return failureResponse(err); }
}
