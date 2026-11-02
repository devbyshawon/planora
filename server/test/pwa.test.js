import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const root = new URL("../../client/", import.meta.url);
const source = readFileSync(new URL("src/service-worker.js", root), "utf8");
const origin = "https://planora.example";
function worker() {
  const events = {}, stores = new Map(), calls = [];
  let fail = false, contentType = "application/javascript", cacheControl = "public", status = 200;
  let skipped = 0, claimed = 0;
  const key = request => new URL(typeof request === "string" ? request : request.url, origin).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(request, response) { store.set(key(request), response.clone()); },
        async match(request) { return store.get(key(request))?.clone(); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const self = {
    location: { origin },
    clients: { async claim() { claimed++; } },
    async skipWaiting() { skipped++; },
    addEventListener(type, callback) { events[type] = callback; },
  };
  runInNewContext(source.replace("__PLANORA_BUILD__", "test-version"), {
    self, caches, URL, Response,
    Request: class extends Request { constructor(path, options) { super(new URL(path, origin), options); } },
    fetch: async request => {
      calls.push(request);
      if (fail) throw new TypeError("Network unavailable");
      const path = key(request);
      const response = new Response(path.endsWith("/offline.html") ? "Public offline screen" : "Resource", {
        status, headers: { "Content-Type": contentType, "Cache-Control": cacheControl },
      });
      Object.defineProperty(response, "type", { value: "basic" });
      return response;
    },
  });
  return {
    stores, calls, caches,
    get skipped() { return skipped; }, get claimed() { return claimed; },
    set offline(value) { fail = value; }, set type(value) { contentType = value; },
    set cacheControl(value) { cacheControl = value; }, set status(value) { status = value; },
    async lifecycle(type, data) {
      let pending;
      events[type]({ data, waitUntil(value) { pending = value; } });
      await pending;
    },
    async request(path, options = {}) {
      let pending;
      events.fetch({ request: { url: new URL(path, origin).href, method: "GET", mode: "cors", ...options }, respondWith(value) { pending = value; } });
      return pending ? await pending : null;
    },
  };
}

test("PWA installation only precaches the public offline screen without credentials", async () => {
  const w = worker();
  await w.lifecycle("install");
  assert.equal(w.skipped, 0);
  assert.equal(w.calls.length, 3);
  assert.ok(w.calls.every(request => request.credentials === "omit"));
  assert.deepEqual([...w.stores.get("planora-public-test-version").keys()].sort(),
    ["/offline.css", "/offline.html", "/offline.js"].map(path => origin + path));
});

test("PWA bypasses API reads/writes, exports, OAuth callbacks, external requests and non-hashed URLs", async () => {
  const w = worker();
  for (const path of ["/api", "/api/auth/me", "/api/tasks", "/api/exports/download", "/api/google/callback?code=PRIVATE", "https://accounts.google.com/", "/assets/private.js", "/assets/index-12345678.js?token=PRIVATE"]) {
    assert.equal(await w.request(path), null, path);
  }
  assert.equal(await w.request("/api/google/callback?code=PRIVATE", { mode: "navigate" }), null);
  assert.equal(await w.request("/assets/index-12345678.js", { method: "POST" }), null);
  assert.equal(w.calls.length, 0);
  assert.equal(w.stores.size, 0);
});

test("PWA never caches planner documents, recovery links or query parameters", async () => {
  const w = worker();
  await w.lifecycle("install");
  const before = [...w.stores.values()].reduce((sum, store) => sum + store.size, 0);
  await w.request("/?google=connected", { mode: "navigate" });
  await w.request("/#reset-password=PRIVATE", { mode: "navigate" });
  assert.equal([...w.stores.values()].reduce((sum, store) => sum + store.size, 0), before);
  assert.ok([...w.stores.values()].every(store => [...store.keys()].every(key => !key.includes("PRIVATE") && !key.includes("google="))));
});

test("PWA offline and unavailable navigations show a public fallback; API remains a network request", async () => {
  const w = worker();
  await w.lifecycle("install");
  w.offline = true;
  assert.equal(await (await w.request("/", { mode: "navigate" })).text(), "Public offline screen");
  assert.equal(await w.request("/api/auth/me", { mode: "navigate" }), null);
  w.offline = false;
  w.status = 503;
  assert.equal(await (await w.request("/", { mode: "navigate" })).text(), "Public offline screen");
  w.status = 401;
  assert.equal((await w.request("/", { mode: "navigate" })).status, 401);
});

test("PWA caches hashed public assets but refuses HTML fallbacks and private/no-store responses", async () => {
  const w = worker();
  await w.request("/assets/index-12345678.js");
  w.offline = true;
  assert.equal(await (await w.request("/assets/index-12345678.js")).text(), "Resource");
  w.offline = false;
  w.type = "text/html";
  await w.request("/assets/missing-12345678.js");
  w.type = "application/javascript";
  for (const policy of ["private", "no-store"]) {
    w.cacheControl = policy;
    await w.request(`/assets/${policy}-12345678.js`);
  }
  assert.equal(w.stores.get("planora-assets-test-version").size, 1);
});

test("PWA activation preserves unrelated caches and one prior asset version; updates require an explicit message", async () => {
  const w = worker();
  for (const name of ["other-app", "planora-public-old", "planora-assets-oldest", "planora-assets-previous"]) await w.caches.open(name);
  await w.lifecycle("install");
  await w.lifecycle("activate");
  assert.equal(w.claimed, 1);
  assert.deepEqual([...w.stores.keys()].sort(), ["other-app", "planora-assets-previous", "planora-public-test-version"]);
  await w.lifecycle("message", { type: "UNRELATED" });
  assert.equal(w.skipped, 0);
  await w.lifecycle("message", { type: "APPLY_UPDATE" });
  assert.equal(w.skipped, 1);
});

test("PWA manifest has a stable standalone identity and valid raster icons for installation", () => {
  const manifest = JSON.parse(readFileSync(new URL("public/manifest.webmanifest", root), "utf8"));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  for (const icon of [...manifest.icons, { src: "/icons/apple-touch-icon.png", sizes: "180x180" }]) {
    const png = readFileSync(new URL(`public${icon.src}`, root));
    assert.equal(png.toString("ascii", 1, 4), "PNG");
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

function appLifecycle({ controlled = true, waiting = false, consent = true } = {}) {
  const windowEvents = {}, workerEvents = {}, messages = [], prompts = [];
  let reloads = 0;
  const registration = {
    waiting: waiting ? { postMessage(message) { messages.push(message); } } : null,
    addEventListener() {}, async update() {},
  };
  const navigator = {
    onLine: true,
    serviceWorker: {
      controller: controlled ? {} : null,
      addEventListener(type, callback) { workerEvents[type] = callback; },
      async register(path, options) { assert.equal(path, "/sw.js"); assert.equal(options.updateViaCache, "none"); return registration; },
    },
  };
  const window = {
    isSecureContext: true,
    addEventListener(type, callback) { windowEvents[type] = callback; },
    dispatchEvent(event) { windowEvents[event.type]?.(event); },
    setInterval() {},
    confirm(message) { prompts.push(message); return consent; },
    location: { reload() { reloads++; } },
  };
  const appSource = readFileSync(new URL("src/pwa.js", root), "utf8")
    .replaceAll("export ", "").replaceAll("import.meta.env.PROD", "true");
  const api = runInNewContext(`${appSource}\n({ startPwa, installPwa, pwaSnapshot, applyPwaUpdate })`, { window, navigator, Event });
  return { ...api, windowEvents, workerEvents, registration, navigator, messages, prompts, get reloads() { return reloads; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("PWA updates never reload another tab or discard a declined update", async () => {
  const app = appLifecycle({ waiting: true, consent: false });
  app.startPwa(); await flush();
  assert.equal(app.pwaSnapshot().updateAvailable, true);
  app.applyPwaUpdate();
  assert.equal(app.messages.length, 0);
  assert.equal(app.reloads, 0);
  app.workerEvents.controllerchange();
  assert.equal(app.pwaSnapshot().reloadReady, true);
  assert.equal(app.reloads, 0);
});

test("PWA only activates/reloads an update after confirmation; first install needs no reload", async () => {
  const app = appLifecycle({ waiting: true });
  app.startPwa(); await flush();
  app.applyPwaUpdate();
  assert.equal(app.messages[0].type, "APPLY_UPDATE");
  assert.equal(app.reloads, 0);
  app.workerEvents.controllerchange();
  assert.equal(app.reloads, 1);
  const fresh = appLifecycle({ controlled: false });
  fresh.startPwa(); await flush();
  fresh.navigator.serviceWorker.controller = {};
  fresh.workerEvents.controllerchange();
  assert.equal(fresh.reloads, 0);
  assert.equal(fresh.pwaSnapshot().reloadReady, false);
});

test("PWA installation is only prompted by the user's install action", async () => {
  const app = appLifecycle();
  app.startPwa(); await flush();
  let prompts = 0, prevented = false;
  app.windowEvents.beforeinstallprompt({
    preventDefault() { prevented = true; },
    async prompt() { prompts++; }, userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  assert.equal(prevented, true);
  assert.equal(app.pwaSnapshot().installAvailable, true);
  assert.equal(prompts, 0);
  await app.installPwa();
  assert.equal(prompts, 1);
  assert.equal(app.pwaSnapshot().installAvailable, false);
  await app.installPwa();
  assert.equal(prompts, 1);
});
