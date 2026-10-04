"use client";

import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";

import { usePermissions } from "./usePermissions";
import type { Action, Feature } from "./types";

/**
 * Page-level guard: renders `children` only when the user holds the required
 * permission (defaults to the feature's `read`), otherwise an access-denied
 * panel. The nav already hides links a user cannot use; this covers direct URL
 * entry to a route they lack access to.
 *
 * A UX guard, not security — the backend still authorizes every request. It only
 * spares the user an empty, non-functional screen.
 */
export function RequirePermission({
  feature,
  action = "read",
  anyOf,
  children,
}: {
  feature?: Feature;
  action?: Action;
  /**
   * Any ONE of these opens the page — for a screen assembled from two modules,
   * where each half is gated again inside.
   *
   * Kas & Bank is the case it exists for: the channel table needs
   * `paymentChannels:read` and the transaction list needs
   * `cashTransactions:read`, and a role holding either has something real to
   * see. Gating the route on one of them would lock the other half's reader out
   * of a page that would have rendered their half perfectly.
   *
   * ALL of them is not offered, because `RequirePermission` nests: two guards is
   * how you say "and", and it reads better than a second prop would.
   */
  anyOf?: Array<{ feature: Feature; action?: Action }>;
  children: ReactNode;
}) {
  const { can } = usePermissions();

  const allowed = anyOf
    ? anyOf.some((grant) => can(grant.feature, grant.action ?? "read"))
    : feature
      ? can(feature, action)
      : false;

  if (!allowed) return <AccessDenied />;

  return <>{children}</>;
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <ShieldAlert className="size-6" />
      </span>
      <h2 className="text-lg font-bold text-foreground">Access denied</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        You don&apos;t have permission to view this page. If you think this is a
        mistake, contact your administrator.
      </p>
    </div>
  );
}
