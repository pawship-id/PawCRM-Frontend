import type { Metadata } from "next";
import { PaymentChannelForm } from "@/features/payment-channels";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Channel baru · Kas & Bank · Buloo",
};

export default function NewPaymentChannelPage() {
  return (
    <RequirePermission feature="paymentChannels" action="create">
      <PaymentChannelForm />
    </RequirePermission>
  );
}
