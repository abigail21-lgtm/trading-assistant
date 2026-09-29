// v2: bumping the name clears everything v1 cached (activate below deletes
// other caches), including page data v1 kept serving from cache.
const CACHE_NAME = "trading-assistant-shell-v2";
const SHELL_ASSETS = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

// How long a page load may take before showing the "couldn't reach" screen
// instead of leaving the installed app on its splash screen indefinitely.
const NAVIGATION_TIMEOUT_MS = 15000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>MarketDesk</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;font:16px system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
button{margin-top:16px;padding:10px 20px;border:0;border-radius:8px;background:#059669;color:#fff;font:inherit;font-weight:600}p{color:#94a3b8;max-width:28em}</style></head>
<body><div><h1 style="font-size:20px">Couldn&rsquo;t reach MarketDesk</h1>
<p>The server didn&rsquo;t answer in time, or you&rsquo;re offline. Check your connection and try again.</p>
<button onclick="location.reload()">Retry</button></div></body></html>`;

function offlinePage() {
  return new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// Only files whose URL changes whenever their content does (Next's hashed
// build output) or that never change (icons, manifest) are safe to serve
// from cache. Pages and their data (including Next's "?_rsc=" requests)
// always come from the network, so prices are never stale and a new deploy
// is never mixed with pieces of an old one.
function isCacheable(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.json";
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS).catch(() => offlinePage()));
    return;
  }

  if (!isCacheable(url)) return;

  // Cache-first for static files. A failed network fetch falls back to the
  // cache, then to a normal failed response rather than an unhandled
  // rejection (see git history for the mobile backgrounding issue).
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request)
          .then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return res;
          })
          .catch(() => caches.match(request).then((res) => res ?? Response.error())),
    ),
  );
});

// True push: sent by netlify/functions/check-alerts even when this app
// isn't open. Payload shape is set there: { title, body, tag, url }.
self.addEventListener("push", (event) => {
  let payload = { title: "MarketDesk alert", body: "" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
