import type { Metadata } from "next";

import { TenantDetail } from "@/features/tenant";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Business information · PawShip" };

/**
 * The signed-in user's own business.
 *
 * Sits beside /dashboard/profile rather than under /dashboard/master, and is
 * reached from the account dropdown rather than the sidebar, because it answers
 * the other half of the question that menu is for: profile is "who am I", this
 * is "what business am I in". Master Data is where records are MAINTAINED, and
 * nothing on this screen is editable.
 *
 * A Server Component shell around the client TenantDetail, the same split the
 * profile route uses: there is nothing to await here (the tenant comes from the
 * session on the client's first call), so the page contributes the heading and
 * the guard and nothing else.
 *
 * Gated on `tenants:read` to match GET /api/tenants/me. The dropdown already
 * hides the entry for a role without it; this covers direct URL entry, so the
 * user sees access-denied rather than a screen that only ever loads a 403.
 */
export default function BusinessPage() {
  return (
    <RequirePermission feature="tenants" action="read">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Business information
          </h1>
          <p className="mt-1 text-sm text-muted">
            Detailed information about the business this account belongs to.
          </p>
        </div>

        <TenantDetail />
      </div>
    </RequirePermission>
  );
}
