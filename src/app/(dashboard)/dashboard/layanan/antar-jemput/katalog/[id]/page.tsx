import type { Metadata } from "next";

import { AntarJemputServiceDetailScreen } from "@/features/antar-jemput";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Detail layanan · Antar-Jemput · Buloo",
};

/** `params` is a Promise in this version of Next. */
export default async function AntarJemputServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="services">
      <AntarJemputServiceDetailScreen serviceId={id} />
    </RequirePermission>
  );
}
