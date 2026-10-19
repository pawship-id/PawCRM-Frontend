/*
 * Buloo — the till's service worker (POS offline mode, 19 October 2026).
 *
 * ONE JOB: let the Kasir page open, and keep working, with no connection. It
 * does NOT cache API calls — the till keeps its own data in IndexedDB and
 * decides itself when to read the server (src/features/pos/offline/).
 *
 *   /_next/static/*        cache-first. The names are content hashes, so a
 *                          cached copy is never stale; a new build simply
 *                          asks for new names.
 *   the Kasir page         network-first, 4 s, then the cached copy — a slow
 *   (HTML and RSC)         connection gets the cached page instead of a blank
 *                          screen while it waits.
 *   images and fonts       stale-while-revalidate, capped — product photos on
 *                          the grid without a round trip each.
 *   everything else        straight to the network, untouched.
 *
 * Bump VERSION to throw every cache away on the next activation.
 */
const VERSION = "v1";
const STATIC_CACHE = `buloo-static-${VERSION}`;
const PAGE_CACHE = `buloo-pages-${VERSION}`;
const MEDIA_CACHE = `buloo-media-${VERSION}`;
const KEEP = [STATIC_CACHE, PAGE_CACHE, MEDIA_CACHE];
const MEDIA_LIMIT = 400;
const PAGE_TIMEOUT_MS = 4000;
const TILL_PATH = "/dashboard/pos";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      // Best effort: signed out, this answers with the login redirect, which
      // is not worth keeping — the first visit online caches the real page.
      .then((cache) =>
        fetch(TILL_PATH, { credentials: "same-origin" })
          .then((response) => (response.ok && !response.redirected ? cache.put(TILL_PATH, response) : null))
          .catch(() => null),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("buloo-") && !KEEP.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isTillPage(url) {
  return url.pathname === TILL_PATH || url.pathname.startsWith(`${TILL_PATH}/`);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/* The cache key for the page: one entry per path, and one per path for RSC. */
function pageKey(request, url) {
  const rsc = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  return `${url.pathname}${rsc ? "?__rsc" : ""}`;
}

async function networkFirstPage(request, url) {
  const cache = await caches.open(PAGE_CACHE);
  const key = pageKey(request, url);
  try {
    const response = await withTimeout(fetch(request), PAGE_TIMEOUT_MS);
    if (response.ok && !response.redirected) {
      cache.put(key, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i += 1) await cache.delete(keys[i]);
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request)
    .then((response) => {
      if (response.ok || response.type === "opaque") {
        cache.put(event.request, response.clone()).then(() => trim(MEDIA_CACHE, MEDIA_LIMIT));
      }
      return response;
    })
    .catch(() => cached);
  if (cached) {
    event.waitUntil(refresh.then(() => undefined));
    return cached;
  }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // API calls are the app's business, never this worker's.
  if (sameOrigin && url.pathname.startsWith("/api/")) return;

  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (sameOrigin && isTillPage(url) && (request.mode === "navigate" || request.headers.get("RSC") === "1")) {
    event.respondWith(networkFirstPage(request, url));
    return;
  }

  if (request.destination === "image" || request.destination === "font") {
    event.respondWith(staleWhileRevalidate(event));
  }
});
