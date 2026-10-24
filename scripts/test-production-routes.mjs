// Windows/Linux production-route smoke test, independent of Caddy.
// Starts the compiled Next.js app on an ephemeral loopback port and checks
// both home and catalog. Closes the server even when assertions fail.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

const port = 39271;
const base = `http://127.0.0.1:${port}`;
const nextCLI = join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
let output = "";
const server = spawn(process.execPath, [nextCLI, "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", chunk => { output += String(chunk); });
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error("Next.js server terminated early: " + server.exitCode);
    try {
      const probe = await fetch(base + "/catalog", { signal: AbortSignal.timeout(2000) });
      if (probe.status === 200) { ready = true; break; }
    } catch {}
    await pause(500);
  }
  assert.ok(ready, "Next.js server did not become ready.\n" + output);
  for (const route of ["/", "/catalog"]) {
    const res = await fetch(base + route, { redirect: "manual", signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    console.log(`${route}: HTTP ${res.status}, content-type=${res.headers.get("content-type")}, length=${html.length}`);
    if (res.status !== 200) console.error("Page preview:", html.slice(0, 500));
    assert.equal(res.status, 200, `Production route ${route} should return HTTP 200`);
    if (route === "/") {
      assert.ok(html.includes("Хорошие находки."), `Route ${route} must display the homepage, not the catalog`);
    }
  }
  console.log("Production Windows/Linux routes OK.");
} finally {
  server.kill("SIGTERM");
  await pause(750);
  if (server.exitCode === null) server.kill("SIGKILL");
  if (output.trim()) console.log("Next.js server output:\n" + output.slice(-1800));
}
