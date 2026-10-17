import {readFile,readdir,mkdir} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {PGlite} from "@electric-sql/pglite";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
const dir=join(root,"data","pgdata");
await mkdir(dir,{recursive:true});
let db;
try {
 db=await PGlite.create(dir);
 await db.query(`CREATE TABLE IF NOT EXISTS shop_schema_migrations (
   filename TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 const folder=join(root,"db","migrations");
 const files=(await readdir(folder)).filter(x=>/^\d+_[\w-]+\.sql$/.test(x)).sort();
 for(const file of files) {
  const exists=await db.query("SELECT 1 FROM shop_schema_migrations WHERE filename=$1",[file]);
  if(exists.rows.length){console.log("Already applied:",file);continue;}
  const sql=await readFile(join(folder,file),"utf8");
  await db.query("BEGIN");
  try{
   await db.exec(sql);
   await db.query("INSERT INTO shop_schema_migrations(filename) VALUES($1)",[file]);
   await db.query("COMMIT");
   console.log("Applied migration:",file);
  }catch(err){await db.query("ROLLBACK");throw err;}
 }
 if(process.argv.includes("--seed")){
  const sql=await readFile(join(root,"db","seed-dev.sql"),"utf8");
  await db.exec(sql);
  console.log("Demo data loaded without overwriting existing records.");
 }
 const stats=await db.query("SELECT COUNT(*)::int AS count FROM shop_products");
 console.log("Local database ready:",dir);
 console.log("Product records:",stats.rows[0].count);
} catch(err){
 console.error("Database setup failed:",err);
 process.exitCode=1;
} finally {if(db)await db.close();}
