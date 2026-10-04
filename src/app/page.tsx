import type { Metadata } from "next";

import { LandingScreen } from "@/features/landing";

/**
 * The marketing landing page.
 *
 * `/` USED TO REDIRECT TO `/login`, on the grounds that there was nothing else
 * to show. There is now. A signed-in user who lands here still reaches the app
 * in one click — Masuk in the top bar goes to `/login`, which `proxy.ts` bounces
 * straight to the dashboard when the auth hint cookie is present.
 *
 * PUBLIC. `proxy.ts` does not match `/`, and `/` is listed in the auth
 * provider's PUBLIC_ROUTE_PREFIXES so that a visitor with no account does not
 * cost a `GET /auth/me` that can only ever 401.
 */
export const metadata: Metadata = {
  title: "Buloo Jualan — Jualannya rapi, tokonya tumbuh",
  description:
    "Analitik pelanggan, halaman toko sendiri, dan keuangan per cabang untuk petshop. Kasir, booking, dan stok jalan di satu alur.",
};

export default function Home() {
  return <LandingScreen />;
}
