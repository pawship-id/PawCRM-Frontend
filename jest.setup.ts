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
});
