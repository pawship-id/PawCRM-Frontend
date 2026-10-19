/**
 * Registers the till's service worker (POS offline mode, 19 October 2026) —
 * see public/sw.js. PRODUCTION BUILDS ONLY: in development the bundler's
 * chunk names are not content hashes, and a worker serving them cache-first
 * would keep yesterday's code on screen. `NEXT_PUBLIC_POS_SW=1` opts a
 * development server in for testing the worker itself.
 *
 * Also asks the browser to keep this site's storage: without it, a device low
 * on space may clear IndexedDB — and with it any sale not sent yet.
 */
let registered = false;

export function registerTillServiceWorker(): void {
  if (registered || typeof window === "undefined") return;
  registered = true;

  const enabled =
    process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_POS_SW === "1";

  if (enabled && "serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // A till without a worker still sells offline once loaded; it just
        // cannot be reloaded without a connection.
      });
  }

  void navigator.storage?.persist?.().catch(() => false);
}
