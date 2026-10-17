import { createHash, randomBytes, scrypt as callbackScrypt } from "node:crypto";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import dotenv from "dotenv";
import { Pool } from "pg";

const scrypt = promisify(callbackScrypt);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: join(root, ".env.local"), override: false });

async function askPassword() {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error("Требуется интерактивный терминал или переменная окружения VIRA_ADMIN_PASSWORD.");
  }
  return new Promise((resolvePassword, reject) => {
    const input = process.stdin;
    let value = "";
    process.stdout.write("Пароль администратора (символы скрыты): ");
    input.setRawMode(true); input.resume(); input.setEncoding("utf8");
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          input.off("data", onData);
          input.setRawMode(false); input.pause();
          process.stdout.write("\n");
          resolvePassword(value);
          return;
        }
        if (char === "\u0003") {
          input.off("data", onData); input.setRawMode(false); input.pause(); process.stdout.write("\n");
          reject(new Error("Отменено."));
          return;
        }
        if (char === "\u007f" || char === "\b") { value = value.slice(0,-1); continue; }
        if (char >= " " && char !== "\u007f" && value.length < 256) value += char;
      }
    };
    input.on("data", onData);
  });
}

let login = process.env.VIRA_ADMIN_LOGIN?.trim();
let password = process.env.VIRA_ADMIN_PASSWORD;
if (!login) {
  if (!process.stdin.isTTY) throw new Error("Укажите VIRA_ADMIN_LOGIN для неинтерактивного запуска.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  login = (await rl.question("Логин администратора [admin]: ")).trim() || "admin";
  rl.close();
}
if (!password) password = await askPassword();
if (!/^[a-zA-Z0-9_-]{3,64}$/.test(login)) throw new Error("Логин: 3–64 символа латиницей.");
if (password.length < 12 || password.length > 256) throw new Error("Пароль должен содержать от 12 до 256 символов.");
if (!process.env.DATABASE_URL) throw new Error("Сначала настройте базу через SETUP-DATABASE-WINDOWS.bat.");
const salt = randomBytes(16).toString("hex");
const hash = (await scrypt(password, salt, 64)).toString("hex");
password = "";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  const result = await pool.query(
    `INSERT INTO shop_admins(login, password_hash) VALUES ($1, $2)
     ON CONFLICT(login) DO UPDATE SET password_hash=EXCLUDED.password_hash, failed_attempts=0, locked_until=NULL
     RETURNING id`, [login, `scrypt$${salt}$${hash}`]
  );
  // Revoke every existing session when password is reset.
  await pool.query("DELETE FROM shop_admin_sessions WHERE admin_id=$1", [result.rows[0].id]);
  console.log("Администратор создан / пароль обновлён. Логин:", login);
  console.log("Вход: http://localhost:3000/admin/login");
} finally { await pool.end(); }
