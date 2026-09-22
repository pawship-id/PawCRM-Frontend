import type { Metadata } from "next";
import { ServiceForm } from "@/features/services";
import { RequirePermission } from "@/features/permissions";
import type { ServiceType } from "@/types/api";

export const metadata: Metadata = {
  title: "Layanan baru · Master Data · Buloo",
};

/**
 * `?jenis=` decides the service's type before the form opens, and Jenis
 * layanan is then not drawn:
 *   - `addon` — "Tambah add-on" on Pengaturan › Layanan › Add-on;
 *   - `utama` — "Layanan baru" on Grooming › Layanan & Harga.
 * Anything else is the ordinary form with the field, as before.
 */
function fixedTypeOf(jenis: string | string[] | undefined): ServiceType | undefined {
  if (jenis === "addon") return "addon";
  if (jenis === "utama") return "main";
  return undefined;
}

export default async function NewServicePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { jenis } = await searchParams;

  /*
    THE SAME ADDRESS FROM EVERY MODULE (22 September 2026). Which module opened
    it — the Kelompok layanan to start on, the list to return to — is left in the
    tab by `ServiceFormLink`, not in the query.
  */
  return (
    <RequirePermission feature="services" action="create">
      <ServiceForm fixedServiceType={fixedTypeOf(jenis)} />
    </RequirePermission>
  );
}
