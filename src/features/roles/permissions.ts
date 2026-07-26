import type { PermissionGrant } from "@/types/api";

/**
 * Conversions between a role's stored grant array (`[{ feature, actions }]`) and
 * the flat `feature -> actions[]` map the permissions matrix edits.
 *
 * The API stores and returns grants as an array; a checkbox grid is far easier
 * to drive from a keyed map. These two functions are the single boundary where
 * the two shapes meet, so no component reaches into the array form directly.
 */
export type PermissionSelection = Record<string, string[]>;

/** Grant array -> `{ feature: actions[] }`. Grants with no actions are dropped. */
export function grantsToSelection(
  grants: PermissionGrant[] = [],
): PermissionSelection {
  const selection: PermissionSelection = {};
  for (const grant of grants) {
    if (grant.actions.length > 0) selection[grant.feature] = [...grant.actions];
  }
  return selection;
}

/**
 * `{ feature: actions[] }` -> grant array, dropping features with no actions
 * selected. Mirrors the backend's own normalization (empty grants are noise), so
 * the payload sent is exactly what the server would store.
 */
export function selectionToGrants(
  selection: PermissionSelection,
): PermissionGrant[] {
  return Object.entries(selection)
    .filter(([, actions]) => actions.length > 0)
    .map(([feature, actions]) => ({ feature, actions: [...actions] }));
}

/** Total number of granted actions across all features (for a summary label). */
export function countGrantedActions(grants: PermissionGrant[] = []): number {
  return grants.reduce((sum, grant) => sum + grant.actions.length, 0);
}
