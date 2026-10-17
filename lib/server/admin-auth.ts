import { createHash, randomBytes, scrypt as callbackScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getPool } from "@/lib/server/db";
import { NextResponse } from "next/server";

const scrypt = promisify(callbackScrypt);
export const SESSION_COOKIE = "vira_admin_session";
const TTL_SECONDS = 60 * 60 * 24; // 24 hours

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, digest] = encoded.split("$");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt ?? "") ||
      !/^[a-f0-9]{128}$/.test(digest ?? "")) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(digest, "hex");
  return timingSafeEqual(actual, expected);
}

function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function findAdminSession(token: string | undefined): Promise<{ id: number; login: string } | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const query = await getPool().query<{ id: number; login: string }>(
    `SELECT a.id, a.login FROM shop_admin_sessions s
       JOIN shop_admins a ON a.id = s.admin_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash(token)]
  );
  return query.rows[0] ?? null;
}

export async function currentAdmin(): Promise<{ id: number; login: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return findAdminSession(token);
}

export async function authorizeAdmin(request: NextRequest): Promise<boolean> {
  return Boolean(await findAdminSession(request.cookies.get(SESSION_COOKIE)?.value));
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: 0,
  });
}

export async function createSession(adminId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await getPool().query(
    "INSERT INTO shop_admin_sessions (token_hash, admin_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '24 hours')",
    [tokenHash(token), adminId]
  );
  return token;
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  await getPool().query("DELETE FROM shop_admin_sessions WHERE token_hash = $1", [tokenHash(token)]);
}

export function validOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const supplied = new URL(origin);
    if (supplied.origin !== origin || !["http:", "https:"].includes(supplied.protocol)) return false;
    const configuredOrigin = process.env.APP_ORIGIN?.trim();
    if (configuredOrigin) {
      const expected = new URL(configuredOrigin);
      return configuredOrigin === expected.origin && origin === expected.origin;
    }
    // Without a configured public origin, only allow local development.
    if (process.env.NODE_ENV === "production") return false;
    const host = request.headers.get("host");
    return Boolean(host) && (origin === "http://" + host || origin === "https://" + host);
  } catch { return false; }
}

export function denyCrossOrigin(request: Request): NextResponse | null {
  if (!validOrigin(request)) {
    return NextResponse.json({ error: "Недопустимый источник запроса." }, { status: 403 });
  }
  return null;
}

export function denyUnauthenticated(): NextResponse {
  return NextResponse.json({ error: "Необходим вход администратора." }, { status: 401 });
}

export function failureResponse(error: unknown): NextResponse {
  const pgCode = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  if (pgCode === "23505") return NextResponse.json({ error: "Такой идентификатор уже используется." }, { status: 409 });
  if (pgCode === "23503") return NextResponse.json({ error: "Нельзя удалить категорию с привязанными товарами." }, { status: 409 });
  console.error("[Vira Shop] Admin API error", error);
  return NextResponse.json({ error: "Ошибка сервера или подключения к базе данных." }, { status: 503 });
}
