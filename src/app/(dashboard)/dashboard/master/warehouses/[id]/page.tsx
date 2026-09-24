import { redirect } from "next/navigation";

/**
 * Moved to Pengaturan on 22 September 2026, when the settings rail became one
 * row with four tabs (mockup `buloo-navigation-v3`). Kept so old links land.
 */
export default async function MovedWarehousePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  redirect(`/dashboard/pengaturan/gudang/${id}`);
}
