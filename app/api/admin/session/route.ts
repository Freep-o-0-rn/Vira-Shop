import { NextRequest, NextResponse } from "next/server";
import { createSession, currentAdmin, denyCrossOrigin, failureResponse, clearSessionCookie, revokeSession, setSessionCookie, verifyPassword, SESSION_COOKIE } from "@/lib/server/admin-auth";
import { getPool } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noCache = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const admin = await currentAdmin();
    return NextResponse.json({ authenticated: Boolean(admin), admin: admin?.login || null }, { headers: noCache });
  } catch (error) { return failureResponse(error); }
}

export async function POST(request: NextRequest) {
  const originError = denyCrossOrigin(request);
  if (originError) return originError;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Некорректный JSON." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Укажите логин и пароль." }, { status: 400 });
  const data = body as Record<string, unknown>;
  if (typeof data.login !== "string" || typeof data.password !== "string" ||
      data.login.length > 64 || data.login.length < 3 || data.password.length > 1024 || !data.password) {
    return NextResponse.json({ error: "Укажите корректный логин и пароль." }, { status: 400 });
  }
  const client = await getPool().connect().catch((error: unknown) => { console.error(error); return null; });
  if (!client) return NextResponse.json({ error: "База данных недоступна." }, { status: 503 });
  try {
    await client.query("BEGIN");
    const found = await client.query<{ id: number; password_hash: string; failed_attempts: number; locked: boolean }>(
      `SELECT id, password_hash, failed_attempts, locked_until > NOW() AS locked
       FROM shop_admins WHERE login = $1 FOR UPDATE`, [data.login]
    );
    const admin = found.rows[0];
    if (!admin) {
      await client.query("COMMIT");
      return NextResponse.json({ error: "Неверный логин или пароль." }, { status: 401, headers: noCache });
    }
    if (admin.locked) {
      await client.query("COMMIT");
      return NextResponse.json({ error: "Слишком много попыток. Повторите через 15 минут." }, { status: 429, headers: noCache });
    }
    const valid = await verifyPassword(data.password, admin.password_hash);
    if (!valid) {
      const attempts = admin.failed_attempts + 1;
      await client.query(
        `UPDATE shop_admins
           SET failed_attempts = $2,
               locked_until = CASE WHEN $2 >= 5 THEN NOW() + INTERVAL '15 minutes' ELSE NULL END
         WHERE id = $1`, [admin.id, attempts >= 5 ? 0 : attempts]
      );
      // When threshold reached, set lock explicitly; counter is reset for next window.
      if (attempts >= 5) {
        await client.query("UPDATE shop_admins SET locked_until = NOW() + INTERVAL '15 minutes' WHERE id = $1", [admin.id]);
      }
      await client.query("COMMIT");
      return NextResponse.json({ error: "Неверный логин или пароль." }, { status: 401, headers: noCache });
    }
    await client.query("UPDATE shop_admins SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [admin.id]);
    await client.query("COMMIT");
    client.release(); // Release embedded DB transaction before making another pooled query.
    const token = await createSession(admin.id);
    const response = NextResponse.json({ authenticated: true }, { headers: noCache });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    return failureResponse(error);
  } finally {
    client.release();
  }
}

export async function DELETE(request: NextRequest) {
  const originError = denyCrossOrigin(request);
  if (originError) return originError;
  try {
    await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json({ success: true }, { headers: noCache });
    clearSessionCookie(response);
    return response;
  } catch (error) { return failureResponse(error); }
}
