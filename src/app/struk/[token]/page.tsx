import type { Metadata } from "next";

import { PublicReceiptScreen } from "@/features/pos";

/**
 * A customer's own receipt, opened from a WhatsApp message (FR-8).
 *
 * OUTSIDE `(dashboard)` ON PURPOSE. There is no sidebar, no shift, no branch
 * gate and no login — the person here is the customer, not the shop, and every
 * one of those would either redirect them away or ask them for something they
 * do not have.
 *
 * "struk" rather than "receipt" in the URL, because a customer reads this one:
 * it is the one route in this app whose path is seen by somebody outside the
 * business, and ui-rules §12's Bahasa rule is at its most literal here.
 */
export const metadata: Metadata = {
  title: "Struk · Buloo",
  /*
    A receipt is somebody's purchase. Even with an unguessable URL, it has no
    business in a search index — and the link travels through chat apps that
    follow it to build a preview.
  */
  robots: { index: false, follow: false },
};

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <PublicReceiptScreen token={token} />;
}
