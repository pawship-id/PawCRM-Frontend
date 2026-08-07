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
  warehouses: ["create", "read", "update", "delete", "restore"],
  businessLines: ["create", "read", "update", "delete", "restore"],
  categories: ["create", "read", "update", "delete", "restore"],
  products: ["create", "read", "update", "delete", "restore"],
  // The stock ledger is append-only, so it has no `update`, `delete` or
  // `restore` — those endpoints do not exist. A wrong movement is corrected by
  // posting a reversing adjustment, which `create` already covers.
  stockMovements: ["create", "read"],
  // Batches are born from movements and never written directly, so `read` is
  // the only action this feature will ever grant.
  productBatches: ["read"],
  // Physical stock counts. `submit` is its own action rather than part of
  // `update`: editing a draft is data entry a shop assistant does all afternoon,
  // while submitting turns a counted shortage into an accepted loss and cannot
  // be undone. The seeded Staff role gets create/read/update and NOT submit —
  // someone other than the counter accepts the variance. No `restore`: a deleted
  // opname is a draft somebody discarded, and un-discarding a count sheet is not
  // a workflow (the shelves have moved on; the honest answer is to count again).
  stockOpnames: ["create", "read", "update", "delete", "submit"],
  suppliers: ["create", "read", "update", "delete", "restore"],
  // A goods receipt raises stock and creates a payable, so there is no `update`
  // and no `delete`: correcting one means returning the goods, which is its own
  // document with its own reversal of the weighted average.
  goodsReceipts: ["create", "read"],
  /**
   * The supplier's BILL, and the payments that discharge it.
   *
   * `create` FILES THE VENDOR'S DOCUMENT — it does not create the debt. The
   * payable already exists: a `beli_putus` goods receipt credits 2101 the moment
   * it posts. What `create` adds is the invoice number, the issue date, and the
   * due date derived from the supplier's terms. This entry previously read
   * `["read", "update", "pay"]`, which was wrong in both directions — there is no
   * PATCH route for `update` to gate, and the missing `create` meant the file-a-
   * bill button was hidden from precisely the roles that hold the grant.
   *
   * `pay` is its own action rather than part of `create`: filing a bill is data
   * entry a purchasing clerk does all morning, while paying one moves cash out of
   * the bank on an entry that cannot be undone. The seeded Staff role holds
   * create+read and NOT pay — ordinary separation of duties, the same split
   * `submit` makes on `stockOpnames`.
   *
   * No `update` and no `delete`: every payment posts an immutable journal entry,
   * so a wrong one is corrected by REVERSING that entry, never by editing it.
   */
  purchaseInvoices: ["create", "read", "pay"],
  purchaseReturns: ["create", "read"],
  chartOfAccounts: ["create", "read", "update", "delete", "restore"],
  // A posted journal entry is immutable: no delete, no restore. `reverse` is
  // its own action because correcting the ledger is a different privilege from
  // relabelling an entry.
  journalEntries: ["create", "read", "update", "reverse"],
  customers: ["create", "read", "update", "delete", "restore"],
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
  // The audit trail is read-only (mirrors the backend catalog): records are
  // system-appended and never edited or deleted, so `read` is the only action.
  auditLogs: ["read"],
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
