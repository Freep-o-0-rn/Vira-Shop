import { randomBytes, scrypt as callbackScrypt } from "node:crypto";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { PGlite } from "@electric-sql/pglite";

const scrypt = promisify(callbackScrypt);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = join(root, "data", "pgdata");
const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
let db;

try {
  console.log("");
  console.log("Vira Shop — создание или изменение пароля администратора");
  console.log("Папка базы данных:", dataDir);
  console.log("ВАЖНО: магазин должен быть остановлен перед запуском этой команды.");
  console.log("");

  db = await PGlite.create(dataDir);
  const known = await db.query("SELECT login FROM shop_admins ORDER BY login");
  if (known.rows.length) {
    console.log("Существующие логины администраторов:");
    for (const row of known.rows) console.log("  -", row.login);
  } else {
    console.log("Администраторов пока нет.");
  }
  console.log("");

  let login = process.env.VIRA_ADMIN_LOGIN?.trim() || "";
  if (!login) {
    if (!rl) throw new Error("В неинтерактивном режиме нужно указать VIRA_ADMIN_LOGIN.");
    login = (await rl.question("Логин администратора [admin]: ")).trim() || "admin";
  }
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(login)) {
    throw new Error("Логин: от 3 до 64 символов (латиница, цифры, _ или -). Email сюда вводить нельзя.");
  }

  const exists = known.rows.some(row => row.login === login);
  console.log(exists
    ? "Будет ОБНОВЛЁН пароль администратора: " + login
    : "Будет СОЗДАН новый администратор: " + login);
  if (rl) console.log("Пароль будет ВИДЕН на экране при вводе. Не показывайте его посторонним.");

  let password = process.env.VIRA_ADMIN_PASSWORD;
  if (password === undefined) {
    if (!rl) throw new Error("В неинтерактивном режиме нужно указать VIRA_ADMIN_PASSWORD.");
    password = await rl.question("Новый пароль администратора (от 12 символов): ");
    const confirmation = await rl.question("Повторите пароль: ");
    if (password !== confirmation) throw new Error("Пароли не совпадают. Данные НЕ изменены.");
  }
  if (password.length < 12 || password.length > 256) {
    throw new Error("Пароль администратора должен содержать от 12 до 256 символов.");
  }

  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  password = "";

  await db.query("BEGIN");
  try {
    const saved = await db.query(
      `INSERT INTO shop_admins(login, password_hash) VALUES ($1, $2)
       ON CONFLICT(login) DO UPDATE SET password_hash=EXCLUDED.password_hash,
         failed_attempts=0, locked_until=NULL
       RETURNING id`,
      [login, `scrypt$${salt}$${hash}`]
    );
    // Changing the password revokes old administrator sessions.
    await db.query("DELETE FROM shop_admin_sessions WHERE admin_id=$1", [saved.rows[0].id]);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }

  console.log("");
  console.log(exists ? "Пароль администратора УСПЕШНО ИЗМЕНЁН." : "Администратор УСПЕШНО СОЗДАН.");
  console.log("Логин для входа:", login);
  console.log("Адрес:", "http://localhost:3000/admin/login");
  console.log("Для входа снова запустите START-WINDOWS.bat.");
} catch (error) {
  console.error("");
  console.error("ОШИБКА:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  rl?.close();
  if (db) await db.close();
}
