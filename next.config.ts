import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
    THE TILL'S SERVICE WORKER (POS offline mode, 19 October 2026) — public/sw.js.
    Never cached by the browser, so a new build's worker is picked up on the
    next load, and served as JavaScript whatever the host guesses.
  */
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
