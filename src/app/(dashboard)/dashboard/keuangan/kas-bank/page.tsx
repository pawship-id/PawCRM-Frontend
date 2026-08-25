import type { Metadata } from "next";
import { PaymentChannelsScreen } from "@/features/payment-channels";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Kas & Bank · Keuangan · Buloo",
};

export default function KasBankPage() {
  return (
    <RequirePermission feature="paymentChannels">
      <PaymentChannelsScreen />
    </RequirePermission>
  );
}
