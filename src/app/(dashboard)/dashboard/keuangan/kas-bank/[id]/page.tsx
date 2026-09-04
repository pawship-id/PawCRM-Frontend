import type { Metadata } from "next";
import { PaymentChannelForm } from "@/features/payment-channels";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Ubah channel · Kas & Bank · Buloo",
};

/**
 * `params` is a Promise in this version of Next — awaited here so the form stays
 * a client component that only receives the id.
 */
export default async function EditPaymentChannelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="paymentChannels" action="update">
      <PaymentChannelForm channelId={id} />
    </RequirePermission>
  );
}
