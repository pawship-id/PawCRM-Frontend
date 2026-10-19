import type { MetadataRoute } from "next";

/**
 * The web app manifest (POS offline mode, 19 October 2026) — what lets a shop
 * install the Kasir on a tablet's home screen and open it full-screen, like an
 * app. It opens on the till, because that is what an installed Buloo is for.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Buloo Kasir",
    short_name: "Buloo Kasir",
    description: "Kasir Buloo — tetap bisa berjualan saat internet putus.",
    start_url: "/dashboard/pos",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#14284b",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
