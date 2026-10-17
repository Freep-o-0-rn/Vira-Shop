import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin, denyCrossOrigin, denyUnauthenticated } from "@/lib/server/admin-auth";

export async function adminGuard(request: NextRequest, mutate = false): Promise<NextResponse | null> {
  if (mutate) {
    const originError = denyCrossOrigin(request);
    if (originError) return originError;
  }
  if (!(await authorizeAdmin(request))) return denyUnauthenticated();
  return null;
}
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new Error("Content-Type: application/json required");
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 30000) throw new Error("Request body too large");
  return request.json();
}
