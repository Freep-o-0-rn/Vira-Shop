import { Pool } from "pg";

// Only server-side code may import this module.
const globalForPg = globalThis as typeof globalThis & { viraShopPool?: Pool };

export function databaseEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPool(): Pool {
  if (!databaseEnabled()) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!globalForPg.viraShopPool) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
    });
    pool.on("error", (err) => {
      console.error("[Vira Shop] PostgreSQL idle connection error:", err.message);
    });
    globalForPg.viraShopPool = pool;
  }
  return globalForPg.viraShopPool;
}
