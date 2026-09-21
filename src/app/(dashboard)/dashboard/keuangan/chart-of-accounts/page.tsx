import { redirect } from "next/navigation";

/**
 * MOVED TO PENGATURAN — 20 September 2026, on request and per the BO mockup,
 * which files the chart of accounts under Pengaturan rather than Keuangan.
 *
 * A REDIRECT RATHER THAN A DELETED ROUTE. This address has been linked from the
 * Keuangan tab row, from the inventory import panel and from whatever anybody
 * bookmarked since the screen shipped; a 404 would punish all of them for a
 * move they did not make. Permanent, so browsers and the router stop asking.
 *
 * Delete this once nothing links here any more and enough time has passed that
 * bookmarks have been retrained — it costs one file, not a decision.
 */
export default function MovedChartOfAccountsPage() {
  redirect("/dashboard/pengaturan/daftar-akun");
}
