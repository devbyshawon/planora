// Disposable production-mode smoke test. Never reads or changes your Atlas data.
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
if (!existsSync(`${root}client/dist/index.html`)) throw new Error("Run npm run build before npm run smoke:production.");
let db, child;
try {
  db = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ args: ["--nounixsocket"] }] });
  const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening"); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const origin = "https://planora.example";
  child = spawn(process.execPath, ["server/src/index.js"], { cwd: root, env: { ...process.env, NODE_ENV: "production", PORT: String(port), APP_ORIGIN: origin, MONGODB_URI: db.getUri(), JWT_SECRET: randomBytes(48).toString("hex"), TRUST_PROXY: "1", MAIL_MODE: "smtp", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "", MAIL_FROM: "", RESEND_API_KEY: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_REDIRECT_URI: "", GOOGLE_TOKEN_KEY: "" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", value => { output += value; }); child.stderr.on("data", value => { output += value; });
  const target = `http://127.0.0.1:${port}`;
  async function call(path, options = {}) { return fetch(target + path, { ...options, signal: AbortSignal.timeout(5000) }); }
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error("Production server exited before readiness.");
    try { if ((await call("/api/health")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, "Production server must become ready");
  const html = await call("/"); assert.equal(html.status, 200); const source = await html.text(); assert.match(source, /<div id="root">/); assert.ok(html.headers.get("content-security-policy").includes("script-src 'self'"));
  const asset = source.match(/src="([^"]+\.js)"/)[1]; assert.equal((await call(asset)).status, 200);
  const manifestResponse = await call("/manifest.webmanifest"); assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json(); assert.equal(manifest.display, "standalone"); assert.equal(manifest.id, "/");
  for (const icon of manifest.icons) { const response = await call(icon.src); assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /image\/png/); }
  const worker = await call("/sw.js"); assert.equal(worker.status, 200); const workerSource = await worker.text(); assert.ok(!workerSource.includes("__PLANORA_BUILD__")); assert.match(worker.headers.get("content-type"), /javascript/);
  for (const path of ["/offline.html", "/offline.css", "/offline.js"]) assert.equal((await call(path)).status, 200);
  for (const [path, title] of [["/about.html", "About Planora"], ["/privacy.html", "Privacy policy"], ["/terms.html", "Terms of use"]]) {
    const response = await call(path); assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /text\/html/);
    const page = await response.text(); assert.ok(page.includes(`<title>${title}`)); assert.ok(page.includes("mailto:shawon12hossain@gmail.com")); assert.ok(!page.includes('<div id="root">'));
  }
  const legalStyles = await call("/legal.css"); assert.equal(legalStyles.status, 200); assert.match(legalStyles.headers.get("content-type"), /text\/css/);
  const offlineWorkspace = await call("/offline-planner.html"); assert.equal(offlineWorkspace.status, 200); assert.match(await offlineWorkspace.text(), /id="root"/);
  assert.ok(workerSource.includes("/offline-planner.html") && !workerSource.includes("__PLANORA_SHELL_FILES__"));
  const shellPaths = JSON.parse(workerSource.match(/const SHELL_FILES = (\[[^;]+\]);/)[1]);
  for (const path of shellPaths) {
    const response = await call(path); assert.equal(response.status, 200, `Precache resource ${path}`);
    if (/\.js$/.test(path)) assert.match(response.headers.get("content-type"), /javascript/, `Precache JavaScript ${path}`);
    if (/\.css$/.test(path)) assert.match(response.headers.get("content-type"), /text\/css/, `Precache stylesheet ${path}`);
  }
  assert.match(await (await call("/some/client/path")).text(), /<div id="root">/);
  const missing = await call("/api/not-a-route"); assert.equal(missing.status, 404); assert.match(missing.headers.get("content-type"), /json/);
  const headers = { Origin: origin, "X-Planora-Client": "web", "Content-Type": "application/json", "X-Forwarded-Proto": "https" };
  const account = { name: "Production smoke test", email: "production-smoke@example.com", password: "SmokeOnlyPassword123", timeZone: "Asia/Dhaka" };
  const register = await call("/api/auth/register", { method: "POST", headers, body: JSON.stringify(account) }); assert.equal(register.status, 201);
  const cookie = register.headers.getSetCookie().find(value => value.startsWith("planora_session="));
  for (const flag of ["HttpOnly", "Secure", "SameSite=Lax"]) assert.ok(cookie.includes(flag));
  const cookieHeader = cookie.split(";")[0];
  const me = await call("/api/auth/me", { headers: { Cookie: cookieHeader } }); assert.equal(me.status, 200); assert.equal(me.headers.get("cache-control"), "no-store");
  const rejected = await call("/api/auth/register", { method: "POST", headers: { ...headers, Origin: "https://wrong.example" }, body: JSON.stringify(account) }); assert.equal(rejected.status, 403);
  const withoutHeader = await call("/api/auth/logout", { method: "POST", headers: { Origin: origin, Cookie: cookieHeader, "Content-Type": "application/json" }, body: "{}" }); assert.equal(withoutHeader.status, 403);
  const logout = await call("/api/auth/logout", { method: "POST", headers: { ...headers, Cookie: cookieHeader }, body: "{}" }); assert.equal(logout.status, 204);
  assert.equal((await call("/api/auth/me", { headers: { Cookie: cookieHeader } })).status, 401);
  console.log("Production smoke passed: real startup, disposable MongoDB, built SPA/assets, API JSON boundaries, CSP, secure cookies, origin/header rejection, and logout revocation.");
} finally {
  if (child && child.exitCode === null) { const exited = once(child, "exit"); child.kill("SIGTERM"); await exited; }
  if (db) await db.stop();
}
