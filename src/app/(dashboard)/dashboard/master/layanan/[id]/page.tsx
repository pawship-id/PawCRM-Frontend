import type { Metadata } from "next";
import { ServiceForm } from "@/features/services";
import { RequirePermission } from "@/features/permissions";
import { serviceListPathFor } from "@/features/antar-jemput/serviceFormOrigin";

export const metadata: Metadata = {
  title: "Ubah layanan · Master Data · Buloo",
};

/**
 * `params` is a Promise in this version of Next — awaited here so the form stays
 * a client component that only receives the id.
 */
export default async function EditServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  /* `?dari=` — which line's page the Ubah was pressed on. */
  const { dari } = await searchParams;

  return (
    <RequirePermission feature="services" action="update">
      <ServiceForm serviceId={id} listPath={serviceListPathFor(dari)} />
    </RequirePermission>
  );
}
