import "server-only";
import {createHash} from "node:crypto";
import {getPool} from "@/lib/server/db";

const state=globalThis as typeof globalThis & {
 viraPendingCleanupTimer?: ReturnType<typeof setInterval>;
};
export function resumeHash(token:string):string{
 return createHash("sha256").update(token).digest("hex");
}
export function validResumeToken(token:unknown):token is string{
 return typeof token==="string"&&/^[a-f0-9]{64}$/.test(token);
}
export async function pruneExpiredSignups():Promise<void>{
 await getPool().query("DELETE FROM shop_customer_signup_codes WHERE registration_expires_at<=NOW() AND expires_at<=NOW()");
}
export function ensurePendingSignupCleanup():void{
 if(state.viraPendingCleanupTimer)return;
 // Expire only after the signup window AND the last issued code both end.
 // Process-local housekeeping while Next.js is running. It starts on first
 // account API request and runs roughly once per minute; if the server is
 // stopped, the next account request prunes expired rows on startup.
 const timer=setInterval(()=>{
  void pruneExpiredSignups().catch(error=>{
   console.warn("[Vira Shop] pending signup cleanup failed:",
    error instanceof Error?error.message:"unknown");
  });
 },60000);
 timer.unref?.();
 state.viraPendingCleanupTimer=timer;
}
