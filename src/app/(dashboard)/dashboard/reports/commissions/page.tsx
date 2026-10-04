import { redirect } from "next/navigation";

/**
 * The recap's OLD address, kept as a redirect.
 *
 * Rekap Komisi is a tab of Keuangan now — the mockup files commissions there —
 * so the screen lives at /dashboard/keuangan/komisi. This route stays because it
 * was a real, linkable address: bookmarks, the reports hub as it was, and
 * anything a shop pasted into a chat. A 404 would be a worse answer than one
 * more hop.
 *
 * NO PERMISSION CHECK HERE, deliberately: the destination carries the same
 * `users:read` gate it always did, so a refused reader is refused there rather
 * than being told by a redirect whether the report exists.
 */
export default function CommissionRecapRedirect() {
  redirect("/dashboard/keuangan/komisi");
}
