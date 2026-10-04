import { redirect } from "next/navigation";

import { serviceSettingsPath } from "@/features/settings";

/**
 * Data hewan became two sections of Pengaturan › Layanan on 17 September 2026 —
 * Opsi Varian and Ras. Kept as a redirect so old links still land.
 */
export default function PetOptionsPage() {
  redirect(serviceSettingsPath("opsi"));
}
