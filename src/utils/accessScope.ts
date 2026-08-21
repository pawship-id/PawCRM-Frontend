import type { User } from "@/types/api";

/**
 * The client-side mirror of the server's stock isolation
 * (`PawCRM-Backend/src/utils/warehouseScope.js`).
 *
 * A COURTESY, NOT THE ENFORCEMENT — the same standing as `utils/validation.ts`.
 * The server narrows every list and refuses every out-of-scope filter on its
 * own; these functions exist so a picker does not offer a branch whose only
 * possible outcome is a 403, and so a reader is not left wondering why the
 * table under a chosen warehouse is empty. Never rely on them for isolation:
 * the endpoint is reachable without the screen.
 *
 * Keep the rules in step with the backend util. They are, in the order decided:
 *
 *   1. `allBranches` — every branch, therefore every warehouse.
 *   2. A SHARED warehouse (`defaultBranchId: null`) is the central one serving
 *      every branch, so any user holding any branch may use it.
 *   3. Otherwise the warehouse's own branch must be granted, AND that branch's
 *      row must either be `allWarehouses` or list this warehouse.
 *
 * The migration window is mirrored too: a user with branches but an empty
 * `warehouseAccess` was stored before the field existed and reaches every
 * warehouse of those branches.
 */

/** What the scope needs from a warehouse, structurally — full or lean alike. */
interface ScopedWarehouse {
  _id: string;
  defaultBranchId: string | null;
}

/** True when `user` may act at `warehouse`. A null user reaches nothing. */
export function canAccessWarehouse(
  user: User | null,
  warehouse: ScopedWarehouse,
): boolean {
  if (!user) return false;
  if (user.allBranches) return true;

  const branchAccess = user.branchAccess ?? [];
  if (branchAccess.length === 0) return false;

  // `?? null` matches the backend's own normalisation. The API always sends the
  // field, so `undefined` only reaches here from a partial object — and the two
  // copies of this rule disagreeing about which spelling means "shared" is
  // exactly the drift this mirror is most likely to develop.
  const owner = warehouse.defaultBranchId ?? null;
  if (owner === null) return true;
  if (!branchAccess.includes(owner)) return false;

  const rows = user.warehouseAccess ?? [];
  // Stored before the field existed — see the header.
  if (rows.length === 0) return true;

  const row = rows.find((entry) => entry.branchId === owner);
  // The service never writes a granted branch with no row, so this can only be
  // a document written by an older build; "nobody decided" reads as no.
  if (!row) return false;

  return row.allWarehouses || row.warehouseIds.includes(warehouse._id);
}

/**
 * The branches this user may operate on.
 *
 * Returns the whole list for an `allBranches` user rather than enumerating it,
 * so a branch opened after they signed in still appears.
 */
export function accessibleBranches<T extends { _id: string }>(
  user: User | null,
  branches: T[],
): T[] {
  if (!user) return [];
  if (user.allBranches) return branches;

  const granted = user.branchAccess ?? [];
  return branches.filter((branch) => granted.includes(branch._id));
}

/** The warehouses this user may act at. */
export function accessibleWarehouses<T extends ScopedWarehouse>(
  user: User | null,
  warehouses: T[],
): T[] {
  return warehouses.filter((warehouse) => canAccessWarehouse(user, warehouse));
}
