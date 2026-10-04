import { redirect } from "next/navigation";

/**
 * Moved to Pengaturan — see ../../page.tsx.
 *
 * The id rides along: a link to one account's edit page is the most likely thing
 * anybody actually bookmarked here, and dropping them on the list would make
 * them find the row again.
 */
export default async function MovedEditChartOfAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  redirect(`/dashboard/pengaturan/daftar-akun/${id}/edit`);
}
