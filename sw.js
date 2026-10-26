const CACHE_NAME = "zhi-pwa-shell-v22";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./mia-chat.html", "./mia-chat.webmanifest", "./mark-jason-chat.html", "./mark-jason-chat.webmanifest", "./mark-chat.html", "./mark-chat.webmanifest", "./jason-chat.html", "./jason-chat.webmanifest", "./agent-talk.html", "./agent-talk.webmanifest", "./zhi-icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("zhi-pwa-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API/database responses or live agent state.
  if (url.pathname.includes("/rest/") || url.pathname.includes("/functions/") || url.pathname.includes("/auth/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      // Keep standalone chat PWAs on their own page when offline.
      if (url.pathname.endsWith("/mia-chat.html")) {
        return (await caches.match("./mia-chat.html")) || Response.error();
      }
      if (url.pathname.endsWith("/mark-chat.html")) {\n        return (await caches.match("./mark-chat.html")) || Response.error();\n      }\n      if (url.pathname.endsWith("/jason-chat.html")) {\n        return (await caches.match("./jason-chat.html")) || Response.error();\n      }\n      if (url.pathname.endsWith("/agent-talk.html")) {
        return (await caches.match("./agent-talk.html")) || Response.error();
      }
      return (await caches.match("./index.html")) || Response.error();
    }));
    return;
  }
  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith(fetch(request).then(response => {
      if (response && response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || Response.error()));
  }
});