import type { Metadata } from "next";

import { PublicInvoiceScreen } from "@/features/sales";

/**
 * A customer's own faktur, opened from the WhatsApp message the shop sent.
 *
 * OUTSIDE `(dashboard)` ON PURPOSE, like `/struk/[token]` beside it. There is no
 * sidebar, no branch and no login — the person here is the customer, not the
 * shop, and every one of those would redirect them away or ask for something
 * they do not have. `proxy.ts` matches only `/dashboard` and the auth routes, so
 * nothing stands in front of this one.
 *
 * "faktur" rather than "invoice" in the URL: a customer reads this path, and
 * ui-rules §12's Bahasa rule is at its most literal here.
 */
export const metadata: Metadata = {
  title: "Faktur · Buloo",
  /*
    A bill is somebody's purchase and what they owe. Even behind an unguessable
    URL it has no business in a search index — and the link travels through a
    chat app that follows it to build a preview.
  */
  robots: { index: false, follow: false },
};

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <PublicInvoiceScreen token={token} />;
}
