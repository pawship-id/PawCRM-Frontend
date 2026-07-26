"use client";

import { useMemo } from "react";

import { useAuth } from "@/features/auth";
import { permissionKey, type Action, type Feature } from "./types";

export interface PermissionChecker {
  /** The user's role bypasses every check — every `can` returns true. */
  isSuperAdmin: boolean;
  /** True when the user's role grants `action` on `feature`. */
  can: (feature: Feature, action: Action) => boolean;
  /** True when the user has AT LEAST ONE of the given actions on `feature`. */
  canAny: (feature: Feature, actions: Action[]) => boolean;
  /** True when the user has EVERY one of the given actions on `feature`. */
  canAll: (feature: Feature, actions: Action[]) => boolean;
}

/**
 * The permission-gating primitive: reads the signed-in user's grants from the
 * auth context and answers `can(feature, action)` in O(1).
 *
 * Grants arrive with the /me (and login) payload, so there is no separate fetch
 * or loading state — once the dashboard renders (status "authenticated"), the
 * answers are ready. A super-admin short-circuits to true; a user with no role
 * has an empty grant set and is denied everything.
 *
 * This is a UX aid only — it decides what to SHOW, never what is ALLOWED. The
 * backend remains the authority on every mutation.
 */
export function usePermissions(): PermissionChecker {
  const { permissions, isSuperAdmin } = useAuth();

  const granted = useMemo(() => {
    const set = new Set<string>();
    for (const grant of permissions) {
      for (const action of grant.actions) set.add(`${grant.feature}:${action}`);
    }
    return set;
  }, [permissions]);

  return useMemo<PermissionChecker>(() => {
    const can = (feature: Feature, action: Action) =>
      isSuperAdmin || granted.has(permissionKey(feature, action));
    return {
      isSuperAdmin,
      can,
      canAny: (feature, actions) => actions.some((a) => can(feature, a)),
      canAll: (feature, actions) => actions.every((a) => can(feature, a)),
    };
  }, [granted, isSuperAdmin]);
}
