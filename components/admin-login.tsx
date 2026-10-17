"use client";
import { useState, type FormEvent } from "react";
export default function AdminLogin() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch("/api/admin/session", {
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({login, password}),cache:"no-store"
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не удалось войти.");
      window.location.assign("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа.");
      setBusy(false);
    }
  }
  return <main className="admin-login-page">
    <form className="admin-login-panel" onSubmit={(event)=>void submit(event)}>
      <a href="/" className="admin-login-brand"><span>v.</span> vira shop</a>
      <p className="admin-eyebrow">ПАНЕЛЬ УПРАВЛЕНИЯ</p>
      <h1>Вход администратора</h1>
      <p className="admin-help">Логин и пароль создаются через CREATE-ADMIN-WINDOWS.bat после настройки PostgreSQL.</p>
      {error && <p className="admin-alert" role="alert">{error}</p>}
      <label>Логин <input autoComplete="username" required value={login} maxLength={64} onChange={e=>setLogin(e.target.value)}/></label>
      <label>Пароль <input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <button className="admin-primary" disabled={busy} type="submit">{busy?"Проверка…":"Войти"}</button>
      <a className="admin-back" href="/">← Вернуться в магазин</a>
    </form>
  </main>;
}
