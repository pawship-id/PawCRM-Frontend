import type { Metadata } from "next";
import { ServiceForm } from "@/features/services";
import { RequirePermission } from "@/features/permissions";
import type { ServiceType } from "@/types/api";
import { serviceListPathFor } from "@/features/antar-jemput/serviceFormOrigin";

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
  const { jenis, dari, lini } = await searchParams;

  /*
    `?dari=` and `?lini=` — a line's own Layanan & Harga opened this form
    (Antar-Jemput, 21 September 2026): come back to that list, and start on that
    line. Anything unrecognised is Grooming's list, as before.
  */
  return (
    <RequirePermission feature="services" action="create">
      <ServiceForm
        fixedServiceType={fixedTypeOf(jenis)}
        listPath={serviceListPathFor(dari)}
        defaultBusinessLineId={typeof lini === "string" ? lini : undefined}
      />
    </RequirePermission>
  );
}
