import "server-only";
import { PGlite } from "@electric-sql/pglite";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export const DATA_DIR = resolve(process.cwd(), "data", "pgdata");
type Result<T> = { rows: T[]; rowCount: number };

class EmbeddedPool {
  private dbPromise: Promise<PGlite> | undefined;
  private tail: Promise<void> = Promise.resolve();

  private async database(): Promise<PGlite> {
    if (!this.dbPromise) {
      this.dbPromise = (async () => {
        await mkdir(DATA_DIR, { recursive: true });
        return PGlite.create(DATA_DIR);
      })().catch(err => { this.dbPromise = undefined; throw err; });
    }
    return this.dbPromise;
  }

  // PGlite has a single connection. Keep BEGIN/COMMIT sequences isolated
  // from all other requests, including read-only queries.
  private async acquire(): Promise<() => void> {
    let unlock!: () => void;
    const pending = new Promise<void>(resolve => { unlock = resolve; });
    const previous = this.tail;
    this.tail = previous.then(() => pending);
    await previous;
    return unlock;
  }

  private async execute<T>(sql: string, params: unknown[] = []): Promise<Result<T>> {
    const db = await this.database();
    const statement = sql.trim();
    if (!params.length && (statement.match(/;/g)?.length ?? 0) > 1) {
      const results = await db.exec(statement);
      const last = results[results.length - 1];
      const rows = (last?.rows ?? []) as T[];
      return { rows, rowCount: rows.length || last?.affectedRows || 0 };
    }
    const result = await db.query<T>(statement, params);
    return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<Result<T>> {
    const release = await this.acquire();
    try { return await this.execute<T>(sql, params); }
    finally { release(); }
  }

  async connect(): Promise<{
    query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<Result<T>>;
    release: () => void;
  }> {
    const release = await this.acquire();
    try {
      await this.database();
      let finished = false;
      return {
        query: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
          if (finished) throw new Error("Database client already released");
          return this.execute<T>(sql, params);
        },
        release: () => { if (!finished) { finished = true; release(); } },
      };
    } catch (err) { release(); throw err; }
  }
}
const root = globalThis as typeof globalThis & { viraEmbeddedPool?: EmbeddedPool };
export function databaseEnabled(): boolean { return true; }
export function getPool(): EmbeddedPool {
  if (!root.viraEmbeddedPool) root.viraEmbeddedPool = new EmbeddedPool();
  return root.viraEmbeddedPool;
}
