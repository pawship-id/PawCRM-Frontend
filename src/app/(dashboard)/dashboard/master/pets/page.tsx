import type { Metadata } from "next";
import { PetsScreen } from "@/features/pets";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Hewan · Pelanggan · Buloo",
};

/**
 * Rendered per request, not at build time (3 October 2026, fixing a bug
 * report) — matching its sibling, `master/customers/page.tsx`. Without this,
 * Next treats the route as static-eligible and the CLIENT cache serves a
 * previously-rendered copy of this page for up to 5 minutes on an ordinary
 * return visit (not only browser Back) — `PetForm`'s `router.push(LIST_PATH)`
 * after creating a pet could land straight back on that stale copy, "Jumlah
 * hewan" and all, with no fresh mount and no fresh fetch. A `force-dynamic`
 * route's client-cache `staleTime` is 0 — every return visit refetches.
 */
export const dynamic = "force-dynamic";

export default function MasterPetsPage() {
  return (
    <RequirePermission feature="pets">
      <PetsScreen />
    </RequirePermission>
  );
}
