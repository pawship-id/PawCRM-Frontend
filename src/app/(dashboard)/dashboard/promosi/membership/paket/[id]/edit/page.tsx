"use client";

import { use } from "react";

import { Alert, Spinner } from "@/components";
import { MembershipPlanForm, useMembershipPlan } from "@/features/memberships";
import { RequirePermission } from "@/features/permissions";

/**
 * Edit a package.
 *
 * A CLIENT PAGE, because the form has to be handed the CURRENT plan — including
 * every benefit's `key`. Those keys are what keep each benefit's redemption
 * history attached across a save; a form that rebuilt them would silently reset
 * every customer's remaining quota.
 */
export default function EditMembershipPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { plan, loading, error } = useMembershipPlan(id);

  return (
    <RequirePermission feature="membershipPlans" action="update">
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size={24} />
        </div>
      ) : error || !plan ? (
        <Alert variant="error">{error ?? "Paket tidak ditemukan."}</Alert>
      ) : (
        <MembershipPlanForm plan={plan} />
      )}
    </RequirePermission>
  );
}
