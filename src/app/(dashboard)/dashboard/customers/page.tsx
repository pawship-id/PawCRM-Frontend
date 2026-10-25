import type { Metadata } from "next";
import { CustomersScreen, customersQueryFromParams } from "@/features/customers";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Pelanggan · Buloo",
};

/**
 * Rendered per request, not at build time — the Ringkasan tab's "Lihat
 * semua" carries `?createdSince=` as an absolute timestamp, and prerendering
 * would freeze a parse of it at build time. Same reason as the Ringkasan tab
 * and Kas & Bank; see their pages.
 */
export const dynamic = "force-dynamic";

/**
 * `?createdSince=` is read HERE, as Kas & Bank reads `?documentId=`: the
 * server already has it, so the screen needs no `useSearchParams` and no
 * Suspense boundary. `searchParams` is a Promise in this version of Next —
 * see AGENTS.md.
 *
 * KEYED ON THE QUERY, so following a second "Lihat semua" link while already
 * on this route starts from the new cutoff instead of keeping the old one.
 */
export default async function MasterCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ createdSince?: string | string[] }>;
}) {
  const initialQuery = customersQueryFromParams(await searchParams);

  return (
    <RequirePermission feature="customers">
      <CustomersScreen
        key={JSON.stringify(initialQuery)}
        initialQuery={initialQuery}
      />
    </RequirePermission>
  );
}
