import { redirect } from "next/navigation";

import { PROMOSI_SUMMARY_HREF } from "@/features/memberships/labels";

/**
 * The rail row lands here and is sent on to Ringkasan, the module's front page.
 * Ringkasan itself forwards a role that may not see it to the first Promosi tab
 * it may (RequirePermission's `redirectTo`).
 */
export default function PromosiPage() {
  redirect(PROMOSI_SUMMARY_HREF);
}
