import "@testing-library/jest-dom";

/**
 * Pin the API base URL so tests assert against a stable host regardless of
 * the developer's .env.local.
 */
process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:5000/api";

/**
 * jsdom does not implement the browser APIs the Radix UI primitives (behind our
 * shadcn/ui components) touch at render/interaction time. Polyfill the minimum
 * so Select / RadioGroup / Checkbox / Dialog render and can be driven in tests.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
}

/**
 * A clean device between tests.
 *
 * `localStorage` survives every test in a file, so a suite that clicks "58 mm"
 * in one test would hand the next one a till already set to 58 — a failure that
 * depends on the order tests happen to run in, which is the worst kind to chase.
 * The POS remembers its paper size there (FR-8), and anything else added later
 * gets the same guarantee for free.
 */
beforeEach(() => {
  try {
    window.localStorage.clear();
  } catch {
    // A test environment without storage is fine; there is nothing to reset.
  }
  // The product pickers' cache is module state — same reasoning as storage.
  // Required here, not imported at the top: an import would load the real
  // product service before a test file's `jest.mock` of it had registered.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@/features/inventory/hooks/useProductCandidates").clearProductCandidatesCache();
});

/**
 * A clean connection and a clean offline till between tests (POS offline mode,
 * 19 October 2026). Both live in module-level stores that outlive a test, so a
 * suite whose mocks reject with network errors would otherwise leave every test
 * after it believing the till is offline.
 */
beforeEach(async () => {
  const connectivity = await import("@/lib/connectivity");
  connectivity.__resetConnectivity("online");
  const store = await import("@/features/pos/offline/store");
  store.__resetOfflineStore();
  const idb = await import("@/features/pos/offline/idb");
  idb.__resetMemoryStore();
});
