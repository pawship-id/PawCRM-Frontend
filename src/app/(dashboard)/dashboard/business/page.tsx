import { redirect } from "next/navigation";

/**
 * The read-only "Business information" page became Pengaturan › Umum on 22
 * September 2026 — the tenant's profile, as the mockup draws it. Kept so the
 * account menu's old link and any bookmark still land.
 */
export default function BusinessPage() {
  redirect("/dashboard/pengaturan/umum");
}
