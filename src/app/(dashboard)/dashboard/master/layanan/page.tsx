import { redirect } from "next/navigation";

/**
 * Moved to Pengaturan on 22 September 2026, when the settings rail became one
 * row with four tabs (mockup `buloo-navigation-v3`). Kept so old links land.
 */
export default async function MovedServiceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { bagian } = await searchParams;
  const section = Array.isArray(bagian) ? bagian[0] : bagian;

  redirect(
    section
      ? `/dashboard/pengaturan/layanan?bagian=${encodeURIComponent(section)}`
      : "/dashboard/pengaturan/layanan",
  );
}
