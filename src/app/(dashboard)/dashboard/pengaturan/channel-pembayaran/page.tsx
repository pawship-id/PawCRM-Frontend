import type { Metadata } from "next";

import { PaymentChannelsScreen } from "@/features/payment-channels";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Channel Pembayaran · Pengaturan · Buloo",
};

/**
 * MOVED HERE FROM KEUANGAN › KAS & BANK — 20 September 2026, on request.
 *
 * A channel is configured once and then referred to, which is what every other
 * row in this nav group is; Kas & Bank kept the question it is named for and
 * answers it per ledger account now. The old addresses redirect here.
 */
export default function PaymentChannelsPage() {
  return (
    <RequirePermission feature="paymentChannels">
      <PaymentChannelsScreen />
    </RequirePermission>
  );
}
