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
  /**
   * The labels a tenant groups its VENDORS by — Purchasing → Kategori Supplier.
   *
   * ITS OWN FEATURE, not part of `categories` and not part of `suppliers`.
   * `categories` gates the PRODUCT taxonomy, and the two only look alike because
   * they share a collection on the backend; folding them together would hand
   * every catalogue editor write access to purchasing's vendor groups. And a
   * supplier record carries a tax number and negotiated credit terms, so a clerk
   * who may add a group name has no business editing those.
   */
  supplierCategories: ["create", "read", "update", "delete", "restore"],
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
  /**
   * Goods going BACK to a supplier — the correction a goods receipt cannot make
   * to itself.
   *
   * This entry previously read `["create", "read"]`, which was wrong the same way
   * `purchaseInvoices` was: the backend catalogue has always carried five actions,
   * and the three missing ones could not be granted from the Role screen at all.
   * A tenant literally could not authorise anybody to submit a return.
   *
   * `submit` IS ITS OWN ACTION. Listing what is going back is clerical work a
   * storekeeper does while holding the damaged carton; submitting takes the stock
   * out, reverses the weighted-average cost every later sale is costed at, and
   * reduces what the supplier is owed — none of it undoable. The seeded Staff role
   * gets create/read/update and NOT submit: the person who identifies a problem
   * with a delivery should not also decide the vendor owes less for it. Same split
   * as `submit` on `stockOpnames` and `pay` on `purchaseInvoices`.
   *
   * `delete` discards a DRAFT only — the API refuses a submitted return, which is
   * the supporting document for movements and a journal entry that are both
   * immutable. No `restore`, for the same reason a discarded opname has none.
   */
  purchaseReturns: ["create", "read", "update", "delete", "submit"],
  /**
   * What CUSTOMERS owe — the mirror of `purchaseInvoices`, pointed the other way.
   *
   * `create` IS IN THE CATALOGUE BUT GATES NOTHING YET. The backend carries it
   * and there is no `POST /api/customer-invoices` to protect: raising a
   * receivable by hand cuts stock, posts two journal entries and allocates a
   * number, which is PCR-030. Listed here anyway so the Role screen can grant it
   * before the screen exists, rather than shipping a role that has to be edited
   * the day it does — and because the catalogue is the backend's, not this
   * file's, to shorten.
   *
   * `pay` IS ITS OWN ACTION. Looking at what a customer owes is something counter
   * staff do; recording that the money arrived credits `1103 Piutang Usaha` on an
   * entry nobody can take back. Same separation of duties as `pay` on
   * `purchaseInvoices`.
   *
   * No `delete`: a receivable is voided with the sale that created it, never
   * removed. A debt that can be deleted is a debt that can be forgiven quietly.
   */
  customerInvoices: ["create", "read", "update", "pay"],
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

  /**
   * The animals a tenant's customers bring in. The uniform five, because the
   * lifecycle is uniform: registered, edited, retired, soft-deleted, restored.
   *
   * Retiring a pet (`isActive: false`) is gated by `update`, not by an action of
   * its own — unlike an opname's `submit`. It is a correction to a record, not a
   * decision with financial consequences, and the person at the counter who
   * hears that a pet died is the same person who edits the row.
   */
  pets: ["create", "read", "update", "delete", "restore"],

  /**
   * The catalogue of what a tenant sells the DOING of — grooming, penitipan.
   *
   * ITS OWN FEATURE, not part of `products`, and the split is about who edits
   * rather than about where the rows are stored: the groomer who sets a bathing
   * price has no business repricing sacks of feed, and one grant covering both
   * would give them that. The same reasoning `supplierCategories` uses against
   * `categories`.
   */
  services: ["create", "read", "update", "delete", "restore"],

  /**
   * The named places money arrives, each mapped to a COA account — Keuangan →
   * Kas & Bank.
   *
   * NOT part of `chartOfAccounts`, and the split is about consequence: editing
   * the chart reshapes the books, while adding a bank account to the till is an
   * operational act a manager does when the shop opens a second account.
   *
   * `restore` is not the afterthought it looks like — it is what brings back a
   * channel deleted by mistake without freeing its name to something else first.
   */
  paymentChannels: ["create", "read", "update", "delete", "restore"],

  /**
   * Appointments. NOT the uniform five, and the two departures are the point.
   *
   * No `delete`/`restore`: a booking that did not happen is CANCELLED, which is
   * a fact worth keeping — a customer who cancels three times in a month is
   * information a soft delete would erase.
   *
   * `cancel` is separated from `update` because they are different levels of
   * trust: a receptionist may reschedule all day, while calling an appointment
   * off is often somebody else's call. The API gates the status route on
   * whichever the payload implies.
   */
  bookings: ["create", "read", "update", "cancel"],

  /**
   * Cashier shifts. NOT the uniform five: a shift is opened, looked at, and
   * closed, and it is never edited or deleted at all — the Z-Report is the point
   * at which the day's cash becomes a fact, and a shift that could be amended
   * afterwards would make it an opinion.
   *
   * `close` is separated from `open` because they are different levels of trust:
   * any cashier starts their own shift, while counting the drawer and declaring
   * the variance is often the supervisor's. The till hides the Tutup Kasir
   * button from a role without it rather than showing one that will refuse.
   */
  posShifts: ["open", "read", "close"],

  /**
   * POS sales. NOT the uniform five, for the reason `journalEntries` is not
   * either: a completed sale is a financial record, so there is no `update` and
   * no `delete`. A wrong sale is VOIDED or RETURNED, and both leave the original
   * visible.
   *
   * `create` covers building a basket AND discarding a parked one — throwing away
   * a cart you just built is part of ringing one up, not a separate power.
   *
   * `discountOverride` gates approving a discount above the cashier's 10% limit
   * (FR-4). An ACTION rather than a feature of its own, because it is a thing
   * done TO a sale, and because the role that may approve one is usually the
   * role that may void — which a grant on this feature can express.
   */
  posTransactions: ["create", "read", "void", "refund", "discountOverride"],
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
