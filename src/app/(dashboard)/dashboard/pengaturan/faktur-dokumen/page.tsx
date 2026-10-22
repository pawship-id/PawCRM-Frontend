import { redirect } from "next/navigation";

/**
 * MOVED TO THE BRANCH — 22 Oktober 2026, BO: the faktur's closing note is per
 * cabang now, in that branch's "Template faktur". This page held nothing else.
 *
 * A REDIRECT RATHER THAN A DELETED ROUTE, as `keuangan/chart-of-accounts`
 * does: whatever bookmarked it lands on the branch list instead of a 404.
 */
export default function MovedDocumentSettingsPage() {
  redirect("/dashboard/pengaturan/cabang");
}
