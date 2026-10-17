import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import dotenv from "dotenv";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: join(root, ".env.local"), override: false });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set. Copy .env.example to .env.local and start Docker Compose.");
  process.exit(1);
}
const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 8000 });
try {
  await pool.query("SELECT 1");
  await pool.query(`CREATE TABLE IF NOT EXISTS shop_schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const dir = join(root, "db", "migrations");
  const migrationFiles = (await readdir(dir)).filter((x) => /^\d+_[\w-]+\.sql$/.test(x)).sort();
  for (const file of migrationFiles) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const exists = await client.query("SELECT 1 FROM shop_schema_migrations WHERE filename = $1", [file]);
      if (exists.rowCount === 0) {
        const sql = await readFile(join(dir, file), "utf8");
        await client.query(sql);
        await client.query("INSERT INTO shop_schema_migrations(filename) VALUES ($1)", [file]);
        console.log("Applied migration:", file);
      } else console.log("Already applied:", file);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  if (process.argv.includes("--seed")) {
    const sql = await readFile(join(root, "db", "seed-dev.sql"), "utf8");
    await pool.query(sql);
    console.log("Demo data seeded without overwriting existing records.");
  }
  const stats = await pool.query("SELECT COUNT(*)::int AS count FROM shop_products");
  console.log("PostgreSQL ready. Product records:", stats.rows[0].count);
} catch (err) {
  console.error("Database setup failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
