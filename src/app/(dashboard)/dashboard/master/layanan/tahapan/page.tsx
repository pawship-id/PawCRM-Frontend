import { redirect } from "next/navigation";

import { serviceSettingsPath } from "@/features/settings";

/**
 * Tahapan became a section of Pengaturan › Layanan on 17 September 2026. Kept
 * as a redirect so old links still land.
 */
export default function ServiceStepsPage() {
  redirect(serviceSettingsPath("tahapan"));
}
