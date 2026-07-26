/**
 * The RBAC vocabulary the permission-gating UI checks against.
 *
 * This mirrors the backend permission catalog (PawCRM-Backend/src/config/
 * permissionCatalog.js) — the single source of truth for WHICH features exist
 * and WHICH actions each supports. It is hand-synced, exactly like the response
 * types in types/api.ts: the catalog is code on the server, so a copy here is
 * unavoidable, and both change together when a feature or action is added.
 *
 * It exists only to give `can(feature, action)` autocomplete and to catch typos
 * at compile time. A stale grant naming a feature no longer listed here still
 * evaluates correctly at runtime (string comparison); the union is a DX aid, not
 * a runtime filter.
 */
export const PERMISSION_CATALOG = {
  tenants: ["create", "read", "update", "delete", "restore"],
  branches: ["create", "read", "update", "delete", "restore"],
  users: [
    "create",
    "read",
    "update",
    "delete",
    "restore",
    "changePassword",
    "changeStatus",
    "unlock",
  ],
  roles: ["create", "read", "update", "delete", "restore"],
} as const;

/** A permission feature — a module the RBAC catalog gates. */
export type Feature = keyof typeof PERMISSION_CATALOG;

/** Any action any feature supports. Not narrowed to the feature it pairs with. */
export type Action = (typeof PERMISSION_CATALOG)[Feature][number];

/** A single feature + action requirement, e.g. for a nav item or a page guard. */
export interface PermissionRequirement {
  feature: Feature;
  action: Action;
}

/** Builds the flat `"feature:action"` key used to look a grant up in a Set. */
export function permissionKey(feature: Feature, action: Action): string {
  return `${feature}:${action}`;
}
