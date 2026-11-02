/* Built by pwa-build.js. Never cache private responses or document navigations. */
const VERSION = "__PLANORA_BUILD__";
const PUBLIC_CACHE = `planora-public-${VERSION}`;
const ASSET_CACHE = `planora-assets-${VERSION}`;
const OFFLINE_FILES = ["/offline.html", "/offline.css", "/offline.js"];
// Public offline workspace HTML and bundled code only, never account responses.
const SHELL_FILES = "__PLANORA_SHELL_FILES__";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(PUBLIC_CACHE);
    for (const path of [...OFFLINE_FILES, ...(Array.isArray(SHELL_FILES) ? SHELL_FILES : [])]) {
      const response = await fetch(new Request(path, { cache: "reload", credentials: "omit" }));
      if (!response.ok || response.redirected) throw new Error("Offline page unavailable");
      await cache.put(path, response);
    }
  })());
  // Existing pages keep their worker until the user accepts an update or closes them.
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // Retain one prior static-asset generation for other open tabs. Never touch
    // caches owned by another application on the origin.
    const assetNames = names.filter(name => name.startsWith("planora-assets-"));
    const previous = assetNames.filter(name => name !== ASSET_CACHE).at(-1);
    await Promise.all(names.filter(name =>
      (name.startsWith("planora-public-") && name !== PUBLIC_CACHE) ||
      (name.startsWith("planora-assets-") && name !== ASSET_CACHE && name !== previous),
    ).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "APPLY_UPDATE") event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  // API includes downloads and OAuth callbacks. Leave these entirely to the
  // network, including when offline. Do not turn an API error into HTML.
  if (request.method !== "GET" || url.origin !== self.location.origin ||
      url.pathname === "/api" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.status < 500) return response;
      } catch {}
      if (!url.search && ["/", "/offline-planner.html"].includes(url.pathname)) {
        const shell = await (await caches.open(PUBLIC_CACHE)).match("/offline-planner.html");
        if (shell) return shell;
      }
      return (await (await caches.open(PUBLIC_CACHE)).match("/offline.html")) ||
        new Response("Planora needs an internet connection. Reconnect and reload.", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
    })());
    return;
  }

  if (!url.search && OFFLINE_FILES.includes(url.pathname)) {
    event.respondWith((async () =>
      (await (await caches.open(PUBLIC_CACHE)).match(url.pathname)) || fetch(request)
    )());
    return;
  }

  // Only content-hashed Vite resources, without query strings, are eligible.
  if (!url.search && /^\/assets\/[\w-]+-[\w-]{8,}\.(?:js|css|woff2?|png|svg|webp)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const precached = await (await caches.open(PUBLIC_CACHE)).match(request);
      if (precached) return precached;
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic" && !response.redirected) {
        // A stale asset path must not cache Vercel's index.html fallback.
        const type = response.headers.get("Content-Type") || "";
        if (!type.includes("text/html") && !/\b(?:private|no-store)\b/i.test(response.headers.get("Cache-Control") || "")) {
          try { await cache.put(request, response.clone()); } catch {}
        }
      }
      return response;
    })());
  }
});
