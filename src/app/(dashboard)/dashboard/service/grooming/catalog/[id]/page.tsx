import type { Metadata } from "next";

import { GroomingServiceDetailScreen } from "@/features/grooming";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Detail layanan · Grooming · Buloo",
};

/**
 * One service, read — a row of Layanan & Harga opens this. Changing it is the
 * service form, one Ubah away.
 *
 * `params` is a Promise in this version of Next — awaited here so the screen
 * stays a client component that only receives the id.
 */
export default async function GroomingServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="services">
      <GroomingServiceDetailScreen serviceId={id} />
    </RequirePermission>
  );
}
