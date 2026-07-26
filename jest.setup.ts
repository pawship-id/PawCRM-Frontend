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
