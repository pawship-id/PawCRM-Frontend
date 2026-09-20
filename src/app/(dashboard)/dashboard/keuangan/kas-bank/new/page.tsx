import { redirect } from "next/navigation";

/**
 * MOVED TO PENGATURAN — 20 September 2026, on request. Channels are configured
 * once and then referred to; Kas & Bank answers where the money is, per ledger
 * account.
 *
 * A REDIRECT RATHER THAN A DELETED ROUTE, for the same reason the chart of
 * accounts kept one when it moved: this address has been linked and bookmarked
 * since the screen shipped, and a 404 would punish everybody for a move they did
 * not make. Permanent, so browsers and the router stop asking.
 *
 * Delete this once nothing links here any more — it costs one file, not a
 * decision.
 */
export default function MovedNewPaymentChannelPage() {
  redirect("/dashboard/pengaturan/channel-pembayaran/new");
}
