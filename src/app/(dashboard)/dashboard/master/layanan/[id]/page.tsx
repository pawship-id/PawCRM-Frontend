import type { Metadata } from "next";
import { ServiceForm } from "@/features/services";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Ubah layanan · Master Data · Buloo",
};

/**
 * `params` is a Promise in this version of Next — awaited here so the form stays
 * a client component that only receives the id.
 */
export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="services" action="update">
      <ServiceForm serviceId={id} />
    </RequirePermission>
  );
}
