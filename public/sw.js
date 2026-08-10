const CACHE_NAME = "trading-assistant-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API calls or auth routes — trading data must stay fresh.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/").then((res) =>
          // Only serve the cached shell if it's a real, direct 200 response --
          // e.g. never a cached redirect (this route can 307 to /login when
          // signed out), which the browser can't render for a top-level
          // navigation and fails with an opaque "page couldn't load" error
          // that's worse than just letting the network error surface normally.
          res && res.ok && res.type === "basic" ? res : Response.error(),
        ),
      ),
    );
    return;
  }

  // Static assets (Next build output, icons): cache-first. The network
  // fetch has no fallback below it, so a real network failure (e.g. the
  // connection dropping as the tab is backgrounded on mobile, or briefly
  // when switching apps) used to reject this whole respondWith promise
  // uncaught -- the browser then reports that resource load as a hard
  // "network error" instead of quietly falling through. Catch it and fall
  // back to a cached shell asset if we have one, otherwise let the error
  // surface as a normal failed response rather than an unhandled rejection.
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
