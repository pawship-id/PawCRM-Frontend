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
  /*
    PELANGGAN LEFT MASTER (25 October 2026): its tabs live at /dashboard/customers
    and /dashboard/pets now. The old addresses forward, query string and all, so
    bookmarks and shared links still land. Ringkasan and Riwayat were renamed
    summary and history on the way, so those two are mapped first — the first
    matching rule wins.
  */
  async redirects() {
    return [
      {
        source: "/dashboard/master/customers/ringkasan",
        destination: "/dashboard/customers/summary",
        permanent: false,
      },
      {
        source: "/dashboard/master/customers/riwayat",
        destination: "/dashboard/customers/history",
        permanent: false,
      },
      {
        source: "/dashboard/master/customers/:path*",
        destination: "/dashboard/customers/:path*",
        permanent: false,
      },
      {
        source: "/dashboard/master/pets/:path*",
        destination: "/dashboard/pets/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
