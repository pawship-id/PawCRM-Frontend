import type { Metadata } from "next";

import { CommissionDetailScreen } from "@/features/commissions";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Detail komisi · Keuangan · Buloo" };

/**
 * One commission — a booking × groomer. Addressed by the two ids because that
 * pair IS the row: the server keeps a record per turn, and the row is what a
 * groomer is paid for. Same grant as the list (`users:read`).
 */
export default async function CommissionDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string; groomerUserId: string }>;
}) {
  const { bookingId, groomerUserId } = await params;

  return (
    <RequirePermission feature="users" action="read">
      <CommissionDetailScreen bookingId={bookingId} groomerUserId={groomerUserId} />
    </RequirePermission>
  );
}
