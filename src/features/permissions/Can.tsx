"use client";

import type { ReactNode } from "react";

import { usePermissions } from "./usePermissions";
import type { Action, Feature } from "./types";

/**
 * Declaratively renders its children only when the signed-in user may perform
 * the given action(s) on `feature`; otherwise renders `fallback` (nothing by
 * default). The gate for a button, menu entry or any inline UI affordance.
 *
 * `action` may be a single action or an array — with an array the children show
 * when the user has ANY of them (e.g. an actions column that appears if the user
 * can edit OR delete). For finer control, call usePermissions() directly.
 *
 *   <Can feature="users" action="create">
 *     <NewUserButton />
 *   </Can>
 */
export function Can({
  feature,
  action,
  fallback = null,
  children,
}: {
  feature: Feature;
  action: Action | Action[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can, canAny } = usePermissions();
  const allowed = Array.isArray(action)
    ? canAny(feature, action)
    : can(feature, action);

  return <>{allowed ? children : fallback}</>;
}
