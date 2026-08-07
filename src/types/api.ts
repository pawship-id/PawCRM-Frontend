/**
 * The backend response contract, defined in .claude/architecture.md and
 * implemented by PawCRM-Backend/src/utils/apiResponse.js.
 *
 * Kept in sync with the backend by hand. If the envelope changes there,
 * it changes here in the same pull request.
 */

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  details?: ValidationDetail[];
  /**
   * The WHY behind a refusal, when the message alone is only the WHAT.
   *
   * Emitted by ApiError.conflict(message, reason) on the backend — a 409 whose
   * message is "Cannot delete warehouse" carries the actionable half here
   * ("still holds stock for 3 product(s) … deactivate it instead"). Absent on
   * ordinary errors, so a caller shows `message` alone when it is missing.
   */
  reason?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Per-field validation error emitted by the backend validate middleware. */
export interface ValidationDetail {
  field: string;
  message: string;
}

/** Payload of GET /api/health. */
export interface HealthPayload {
  status: "ok" | "degraded";
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  dependencies: {
    database: {
      status: string;
      readyState: number;
    };
  };
}

/**
 * A staff user, as returned by /api/auth/login, /api/auth/me and /api/users.
 * The backend never returns `passwordHash` — see user.model.js. Fields the
 * profile UI does not yet touch (commissionRate, availability) are omitted
 * rather than typed loosely; add them when a screen needs them.
 */
export interface User {
  _id: string;
  tenantId: string;
  email: string;
  fullName: string;
  phone: string | null;
  roleId: string | null;
  allBranches: boolean;
  branchAccess: string[];
  status: "active" | "suspended";
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  /**
   * When set to a future time, the account is locked out of sign-in; the user
   * admin screen offers an Unlock action. The list/read endpoints project this
   * (they exclude only __v and passwordHash), so it is safe to rely on here.
   */
  lockedUntil: string | null;
  /** Soft-delete marker; non-null means deleted (restorable), null means live. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The session context returned alongside the user. */
export interface SessionContext {
  currentBranchId: string | null;
  /** Present on login, omitted by /me. */
  expiresAt?: string;
}

/**
 * The effective RBAC context of the signed-in user, returned alongside the user
 * by /api/auth/login and /api/auth/me. The frontend gates navigation, buttons
 * and pages on this — never as a security boundary (the backend still owns
 * enforcement), only so a user is not shown actions their role cannot perform.
 *
 * `permissions` is the flattened grant set of the user's role (the same
 * `[{ feature, actions }]` shape a role stores). `isSuperAdmin` mirrors the
 * role's bypass flag: when true, every permission check passes regardless of the
 * grants. A user with no role (`roleId: null`) has an empty `permissions` array.
 */
export interface AuthPermissions {
  permissions: PermissionGrant[];
  isSuperAdmin: boolean;
}

/** Payload of POST /api/auth/login. */
export interface LoginPayload extends AuthPermissions {
  user: User;
  session: SessionContext;
}

/** Payload of GET /api/auth/me. */
export interface MePayload extends AuthPermissions {
  user: User;
  session: SessionContext;
}

/** Generic message payloads (forgot-password, reset-password, logout). */
export interface MessagePayload {
  message: string;
}

/** Fields the profile screen may edit via PATCH /api/users/:id. */
export interface UpdateProfileInput {
  fullName?: string;
  email?: string;
  phone?: string | null;
}

/** Shape of a paginated list response, for future list endpoints. */
export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

/**
 * The paginated list envelope the backend actually returns from its list
 * endpoints (GET /api/users, /api/roles, /api/branches): the page metadata is
 * nested under `pagination`, unlike the flat `Paginated<T>` above. Use this for
 * real list calls; `Paginated<T>` predates the endpoints and stays for now.
 */
export interface PageResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** Query parameters accepted by GET /api/users. All optional. */
export interface UserListQuery {
  page?: number;
  limit?: number;
  status?: User["status"];
  roleId?: string;
  branchId?: string;
  /** Free-text over fullName / email / phone. */
  search?: string;
  /** Include soft-deleted users (default false on the backend). */
  includeDeleted?: boolean;
}

/**
 * Body of POST /api/users. The backend requires a branch scope: either
 * `allBranches: true` OR a non-empty `branchAccess`. `tenantId` is derived from
 * the session, never sent from here.
 */
export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
  roleId?: string | null;
  allBranches?: boolean;
  branchAccess?: string[];
  status?: User["status"];
}

/**
 * Body of PATCH /api/users/:id — every field optional (send only what changed).
 * Password and status have their own dedicated endpoints and are not accepted
 * here.
 */
export interface UpdateUserInput {
  fullName?: string;
  email?: string;
  phone?: string | null;
  roleId?: string | null;
  allBranches?: boolean;
  branchAccess?: string[];
}

/**
 * A single stored permission grant: one feature and the actions granted on it.
 * Mirrors the backend's `{ feature, actions }` subdocument (role.model.js) and
 * the entries GET /api/roles/catalog returns. The vocabulary of valid features
 * and actions is the catalog — see PermissionCatalog.
 */
export interface PermissionGrant {
  feature: string;
  actions: string[];
}

/**
 * The RBAC permission catalog, as returned by GET /api/roles/catalog. The
 * catalog lives in backend code (config/permissionCatalog.js), so the client
 * fetches it rather than hard-coding a copy that could drift. `features` is an
 * array of `{ feature, actions }` — every feature and the actions it supports.
 */
export interface PermissionCatalog {
  features: PermissionGrant[];
}

/**
 * A role, as returned by GET /api/roles and GET /api/roles/:id.
 *
 * `permissions` is the array of grants the role confers. `isSystem` (a seeded
 * baseline role — cannot be deleted) and `isSuperAdmin` (bypasses every
 * permission check) are SERVER-OWNED: read them, never send them — the backend
 * strips both from any create/update payload. The user-screen role picker only
 * reads `_id`/`name`, so those fields stay effectively required while the rest
 * describe the role master-data screens.
 */
export interface Role {
  _id: string;
  tenantId?: string;
  name: string;
  description?: string | null;
  permissions: PermissionGrant[];
  isSystem?: boolean;
  isSuperAdmin?: boolean;
  /** Soft-delete marker; non-null means deleted (restorable), null means live. */
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Query parameters accepted by GET /api/roles. All optional. */
export interface RoleListQuery {
  page?: number;
  limit?: number;
  isSystem?: boolean;
  isSuperAdmin?: boolean;
  /** Free-text over name / description. */
  search?: string;
  /** Include soft-deleted roles (default false on the backend). */
  includeDeleted?: boolean;
}

/**
 * Body of POST /api/roles. Only `name` is required; a role with no grants yet is
 * legitimate. `tenantId`, `isSystem` and `isSuperAdmin` are derived/owned by the
 * server and never sent from here.
 */
export interface CreateRoleInput {
  name: string;
  description?: string | null;
  permissions?: PermissionGrant[];
}

/**
 * Body of PATCH /api/roles/:id — every field optional, but the backend rejects
 * an empty body (send at least one). `permissions` REPLACES the grant set
 * wholesale, so send the complete array, not a delta.
 */
export interface UpdateRoleInput {
  name?: string;
  description?: string | null;
  permissions?: PermissionGrant[];
}

/**
 * A tenant's subscription state, embedded on the tenant document.
 *
 * `plan` is a string enum rather than a reference — there is no plans collection
 * on the backend yet. `trialEndsAt` is null for a tenant that never started a
 * trial (migrated, or paid up front), so a countdown must handle its absence.
 */
export interface TenantSubscription {
  status: "trialing" | "active" | "past_due" | "suspended" | "cancelled";
  plan: "free" | "basic" | "pro" | "enterprise";
  trialEndsAt: string | null;
}

/** Per-tenant behaviour switches. */
export interface TenantSettings {
  /**
   * Whether boarding capacity is addressed by numbered cages or named zones.
   * It changes how the hotel module reads and writes, hence a tenant-level
   * switch rather than a per-request option.
   */
  hotelMode: "numbered" | "zone";
}

/**
 * The signed-in user's business, as returned by GET /api/tenants/me — the root
 * document every other record hangs off. Deliberately has no `tenantId` of its
 * own: a tenant IS the tenant, so there is nothing above it to scope by.
 *
 * `slug` is a public URL identifier, not a display nicety, which is why the
 * backend never re-derives it when the business is renamed.
 */
export interface Tenant {
  _id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  /** IANA zone (e.g. "Asia/Jakarta") — the zone the tenant's day is measured in. */
  timezone: string;
  /** ISO 4217. Only "IDR" exists today; typed as a string for the next one. */
  currency: string;
  subscription: TenantSubscription;
  settings: TenantSettings;
  /** Schema version, stamped on write so a migration can find older shapes. */
  sv: number;
  /** Soft-delete marker; a live session on a deleted tenant reads a 404 instead. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A branch, as returned by GET /api/branches. A tenant's physical location.
 *
 * `isActive` (temporarily closed vs. open) and `deletedAt` (removed, restorable)
 * are ORTHOGONAL axes — see branch.model.js. The branch master-data screens read
 * every field below; the user branch-scope picker only needs `_id`/`name`.
 */
export interface Branch {
  _id: string;
  tenantId: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  /** Soft-delete marker; non-null means deleted (restorable), null means live. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Query parameters accepted by GET /api/branches. All optional. */
export interface BranchListQuery {
  page?: number;
  limit?: number;
  isActive?: boolean;
  /** Free-text over name / address. */
  search?: string;
  /** Include soft-deleted branches (default false on the backend). */
  includeDeleted?: boolean;
}

/**
 * Body of POST /api/branches. Only `name` is required; `tenantId` is derived
 * from the session, never sent from here.
 */
export interface CreateBranchInput {
  name: string;
  address?: string | null;
  phone?: string | null;
  isActive?: boolean;
}

/**
 * Body of PATCH /api/branches/:id — every field optional, but the backend
 * rejects an empty body (send only what changed, at least one field).
 */
export interface UpdateBranchInput {
  name?: string;
  address?: string | null;
  phone?: string | null;
  isActive?: boolean;
}

/**
 * A warehouse — a tenant's PHYSICAL stock location, as returned by
 * /api/warehouses.
 *
 * Deliberately NOT a branch, and the two are not 1:1 (see warehouse.model.js): a
 * branch is a unit of bookkeeping, a warehouse a unit of stock. A tenant can run
 * one central warehouse serving three branches, or two warehouses inside one.
 * Quantities and movements reference `warehouseId`, never `branchId`.
 *
 * `defaultBranchId` is the soft link between the two — the branch a movement
 * here posts against by default. It is returned as a bare id, NOT populated, so
 * a screen wanting the branch NAME resolves it against the branch list
 * (useWarehouseBranches).
 *
 * `isActive` and `deletedAt` are orthogonal, exactly as on a branch: inactive
 * means "still owns its stock, not accepting movement"; deleted means "removed,
 * restorable". `isDefault` is server-owned — set only when a branch is created
 * and its stock location auto-provisioned — and is what makes DELETE refuse, so
 * the UI reads it but can never write it.
 */
export interface Warehouse {
  _id: string;
  tenantId: string;
  name: string;
  /** The branch this warehouse posts against by default; null = central. */
  defaultBranchId: string | null;
  address: string | null;
  /** Who is accountable for stock here — a plain name, not a user reference. */
  picName: string | null;
  picPhone: string | null;
  isActive: boolean;
  /** True for the warehouse auto-created with a branch. Read-only: DELETE refuses. */
  isDefault: boolean;
  /** Soft-delete marker; non-null means deleted (restorable), null means live. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Query parameters accepted by GET /api/warehouses. All optional. */
export interface WarehouseListQuery {
  page?: number;
  limit?: number;
  isActive?: boolean;
  /** The stock locations of one branch — the POS switcher's filter. */
  defaultBranchId?: string;
  /** Free-text over name / address / picName. */
  search?: string;
  /** Include soft-deleted warehouses (default false on the backend). */
  includeDeleted?: boolean;
}

/**
 * Body of POST /api/warehouses. Only `name` is required — a tenant may register
 * its locations before it has the address or PIC details to hand. `isDefault` is
 * absent by design: the backend strips it, so it cannot be forged from here.
 */
export interface CreateWarehouseInput {
  name: string;
  defaultBranchId?: string | null;
  address?: string | null;
  picName?: string | null;
  picPhone?: string | null;
  isActive?: boolean;
}

/**
 * Body of PATCH /api/warehouses/:id — every field optional, but the backend
 * rejects an empty body (send only what changed, at least one field).
 */
export interface UpdateWarehouseInput {
  name?: string;
  defaultBranchId?: string | null;
  address?: string | null;
  picName?: string | null;
  picPhone?: string | null;
  isActive?: boolean;
}

/**
 * What a category is FOR. One value today, and the field exists anyway because
 * finance categories used to share this collection and the backend kept the
 * discriminator when they moved to the chart of accounts — see
 * category.model.js. Nothing in the UI offers a choice; every category the
 * frontend creates is a product category.
 */
export type CategoryKind = "product";

/**
 * One account of a tenant's chart of accounts.
 *
 * Only the fields a NON-accounting screen needs to name an account it is about
 * to post against; the finance module's own type will be wider. Resolved by
 * `code` rather than by id — ids differ per tenant, codes do not, which is why
 * `/chart-of-accounts/by-code/:code` exists at all.
 */
export interface ChartAccount {
  _id: string;
  code: string;
  name: string;
  accountType: "asset" | "liability" | "equity" | "income" | "expense";
  isActive: boolean;
}

/**
 * A product category — the label a product is filed under.
 *
 * Nothing but a name, which is the point: grouping is all a category does. It
 * carries no price, no stock and no rules, so the only thing that can be wrong
 * with one is what it is called.
 */
export interface Category {
  _id: string;
  tenantId: string;
  kind: CategoryKind;
  name: string;
  /** Soft-delete marker; non-null means deleted (restorable), null means live. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Query parameters accepted by GET /api/categories. All optional. */
export interface CategoryListQuery {
  page?: number;
  limit?: number;
  kind?: CategoryKind;
  /** Free-text over the name. */
  search?: string;
  /** Include soft-deleted categories (default false on the backend). */
  includeDeleted?: boolean;
}

/** Body of POST /api/categories. `kind` defaults to "product" server-side. */
export interface CreateCategoryInput {
  name: string;
  kind?: CategoryKind;
}

/**
 * Body of PATCH /api/categories/:id. `name` is the only editable field, and the
 * backend rejects an empty body — so in practice it is required here too.
 */
export interface UpdateCategoryInput {
  name?: string;
}

/**
 * A customer's VIP tier — a closed enum mirroring VIP_TIERS in
 * customer.model.js. Most customers have none, so the field is nullable and the
 * screens treat `null` as "no tier".
 */
export type VipTier = "bronze" | "silver" | "gold" | "platinum";

/**
 * A customer, as returned by GET /api/customers. A person a tenant does business
 * with (pet owner, buyer, client).
 *
 * `email` is unique PER TENANT (never globally) and optional — a walk-in may be
 * recorded with just a name. `deletedAt` is the soft-delete axis (removed,
 * restorable). `createdBy` and `sv` are server-owned audit/versioning fields the
 * UI does not edit; they are omitted here rather than typed loosely — add them
 * when a screen needs them. Mirrors the Branch shape, minus the `isActive` axis
 * (a customer has no open/closed state).
 */
export interface Customer {
  _id: string;
  tenantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  vipTier: VipTier | null;
  /** Soft-delete marker; non-null means deleted (restorable), null means live. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Query parameters accepted by GET /api/customers. All optional. */
export interface CustomerListQuery {
  page?: number;
  limit?: number;
  vipTier?: VipTier;
  /** Free-text over name / email / phone. */
  search?: string;
  /** Include soft-deleted customers (default false on the backend). */
  includeDeleted?: boolean;
}

/**
 * Body of POST /api/customers. Only `name` is required; `tenantId` and
 * `createdBy` are derived from the session, never sent from here. The nullable
 * fields accept `null` to leave them unset.
 */
export interface CreateCustomerInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  vipTier?: VipTier | null;
}

/**
 * Body of PATCH /api/customers/:id — every field optional, but the backend
 * rejects an empty body (send only what changed, at least one field). A field
 * set to `null`/"" clears it.
 */
export interface UpdateCustomerInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  vipTier?: VipTier | null;
}

/**
 * How a tenant works with a supplier — the COOPERATION MODEL, which decides
 * whether goods arriving create a debt.
 *
 *   beli_putus  — bought outright. The goods are the tenant's on arrival, so the
 *                 receipt creates a payable and posts to the ledger.
 *   konsinyasi  — consigned. The goods sit in the warehouse but belong to the
 *                 supplier until they sell, so there is NO payable on receipt.
 *   both        — the vendor does either, decided per receipt.
 *
 * Snake_case because these are Indonesian business terms and the backend enum
 * stores them verbatim (see supplier.model.js).
 */
export type SupplierType = "beli_putus" | "konsinyasi" | "both";

/**
 * A vendor the tenant buys from, as returned by /api/suppliers.
 *
 * FIELD NAMES FOLLOW THE BACKEND, not the older prototype types in
 * types/purchasing.ts: `type` (not `supplierType`) and `pic` (not `picName`).
 * The prototype shapes were written before the API existed; this is the one the
 * server actually speaks.
 *
 * TWO INDEPENDENT LIFECYCLE AXES, and conflating them is the mistake to avoid:
 *   isActive: false  — still buying from them? No. The record and its history
 *                      stand, it just drops out of the purchasing pickers.
 *   deletedAt        — the record was removed (soft). Restorable.
 * A supplier can be either, both, or neither.
 *
 * `isActive` is optional because suppliers created before the field existed do
 * not carry it, and a missing flag means active — the backend applies the same
 * rule when it filters and when it refuses a receipt. Read it through
 * `isSupplierActive()` rather than testing it directly.
 */
export interface Supplier {
  _id: string;
  tenantId: string;
  name: string;
  /** The contact person AT the vendor — a plain name, never a PawCRM user. */
  pic: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** Indonesian taxpayer number, needed on a faktur pajak. */
  npwp: string | null;
  notes: string | null;
  type: SupplierType;
  /** Days from invoice date to due date. 0 means payable on receipt. */
  paymentTermDays: number;
  /** Absent on records written before the field existed — absent means active. */
  isActive?: boolean;
  createdBy: string | null;
  /** Soft-delete marker; non-null means deleted (restorable), null means live. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Whether a vendor is still bought from.
 *
 * `!== false`, NOT `=== true`: a supplier stored before `isActive` shipped has no
 * such field, and treating the absence as "deactivated" would grey out and hide
 * every vendor a tenant already had. Absent and true are the same answer, which
 * is exactly what the backend's `$ne: false` filter says.
 */
export function isSupplierActive(supplier: Pick<Supplier, "isActive">): boolean {
  return supplier.isActive !== false;
}

/** Query parameters accepted by GET /api/suppliers. All optional. */
export interface SupplierListQuery {
  page?: number;
  limit?: number;
  type?: SupplierType;
  /** Free-text over name / pic / phone / npwp. */
  search?: string;
  /** Narrow by activity. Omit for both — the management list wants both. */
  isActive?: boolean;
  /** Include soft-deleted suppliers (default false on the backend). */
  includeDeleted?: boolean;
}

/**
 * Body of POST /api/suppliers. `name` and `type` are both required — the backend
 * refuses to infer the cooperation model, because it decides whether an arrival
 * creates a debt. `tenantId` and `createdBy` come from the session, never here.
 */
export interface CreateSupplierInput {
  name: string;
  type: SupplierType;
  pic?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  npwp?: string | null;
  notes?: string | null;
  paymentTermDays?: number;
  isActive?: boolean;
}

/**
 * Body of PATCH /api/suppliers/:id — every field optional, but the backend
 * rejects an empty body (send only what changed). A nullable field set to
 * `null`/"" clears it; `type`, `paymentTermDays` and `isActive` refuse null,
 * since each always has a meaningful value.
 */
export interface UpdateSupplierInput {
  name?: string;
  type?: SupplierType;
  pic?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  npwp?: string | null;
  notes?: string | null;
  paymentTermDays?: number;
  isActive?: boolean;
}

/**
 * One supplier's row in GET /api/purchase-invoices/outstanding — what is still
 * owed to them.
 *
 * Money is a decimal STRING, like everywhere else in this API: a rupiah total
 * that has been through a float is a total that disagrees with its own rows.
 * A supplier owed nothing is ABSENT rather than present with zeros, so consumers
 * key by `supplierId` and read a miss as zero.
 */
export interface SupplierOutstandingRow {
  supplierId: string;
  /** Null when the vendor was soft-deleted since — the debt still stands. */
  supplierName: string | null;
  invoiceCount: number;
  outstanding: string;
}

export interface SupplierOutstandingSummary {
  items: SupplierOutstandingRow[];
  totalOutstanding: string;
  totalInvoices: number;
}

/**
 * One supplier's row in GET /api/goods-receipts/summary — what has been bought
 * from them.
 *
 * `purchased` is EX-TAX: it is what was debited to inventory, so it ties out
 * against the stock side. What the vendor was billed is that plus `taxTotal`.
 */
export interface SupplierPurchaseRow {
  supplierId: string;
  supplierName: string | null;
  receiptCount: number;
  purchased: string;
  taxTotal: string;
  lastReceiptDate: string | null;
}

export interface SupplierPurchaseSummary {
  items: SupplierPurchaseRow[];
  totalPurchased: string;
  totalReceipts: number;
}

/**
 * One supplier's row in GET /api/product-batches/consignment-summary — their
 * goods still sitting in the tenant's warehouses.
 *
 * NOT A DEBT, unlike `SupplierOutstandingRow`: consigned stock belongs to the
 * supplier until it sells, so nothing here is owed yet. The two read side by
 * side are a consignment vendor's whole position — what has been billed, and
 * what is still on the shelf waiting to be.
 */
export interface SupplierConsignmentRow {
  supplierId: string;
  supplierName: string | null;
  /** Distinct lots still holding stock. */
  lotCount: number;
  /** Distinct products across those lots. */
  productCount: number;
  qtyRemaining: string;
  /** `qtyRemaining × costPerUnit` — what the supplier will invoice as it sells. */
  value: string;
}

export interface SupplierConsignmentSummary {
  items: SupplierConsignmentRow[];
  totalValue: string;
  totalLots: number;
}

/** What kind of arrival a delivery was — the per-receipt half of `SupplierType`. */
export type PurchaseType = "beli_putus" | "konsinyasi";

/**
 * One row of GET /api/goods-receipts — a delivery, without its lines.
 *
 * MONEY IS A DECIMAL STRING, never a number: `JSON.parse` would have lost
 * precision before any client code ran, and these are the figures a tenant
 * reconciles a supplier's invoice against.
 *
 * `total` is EX-TAX (what was debited to inventory); `grandTotal` is what the
 * supplier is owed, derived server-side rather than stored so a third total
 * cannot disagree with the two it came from. The list projects the lines away,
 * so `itemCount` stands in for them.
 */
export interface GoodsReceiptListRow {
  _id: string;
  receiptNumber: string;
  supplierId: string;
  supplierName: string | null;
  warehouseId: string;
  warehouseName: string | null;
  receiptDate: string;
  purchaseType: PurchaseType;
  total: string;
  taxAmount: string;
  grandTotal: string;
  itemCount: number;
  invoiceId: string | null;
  notes: string | null;
  createdAt: string;
}

/** Query parameters accepted by GET /api/goods-receipts. All optional. */
export interface GoodsReceiptListQuery {
  page?: number;
  limit?: number;
  /** Free-text over receipt number / notes. */
  search?: string;
  supplierId?: string;
  warehouseId?: string;
  purchaseType?: PurchaseType;
  /** ISO dates bounding `receiptDate` (inclusive), never `createdAt`. */
  dateFrom?: string;
  dateTo?: string;
}

/**
 * The actor (and branch) references the audit-log list endpoint populates.
 *
 * The backend returns `userId`/`branchId` as populated subdocuments — a small
 * display projection, never the whole user/branch — so the screen can show WHO
 * acted and WHERE without a second lookup. `fullName` is the user model's name
 * field (there is no separate `name`). Either can be null: a user deleted since
 * the event, or an action with no branch context (see auditLog.model.js).
 */
export interface AuditLogActor {
  _id: string;
  fullName: string;
  email: string;
}

export interface AuditLogBranchRef {
  _id: string;
  name: string;
}

/**
 * One immutable audit-trail record, as returned by GET /api/audit-logs.
 *
 * The trail answers "who did what, from where, and when" for security-sensitive
 * events (login, failed_login, account_locked, logout_all today; sensitive
 * business events later). It is READ-ONLY — records are appended by the backend
 * and never edited or deleted, so there is no `deletedAt` and no mutation input
 * type. `action` and `entityType` are an open vocabulary of lowercase slugs, not
 * a fixed enum. `metadata` is free-form context whose shape varies by action
 * (`{ reason }`, `{ lockedUntil }`, `{ revokedCount }`, …).
 */
export interface AuditLog {
  _id: string;
  tenantId: string;
  /** The actor; populated to a display projection, or null if the user is gone. */
  userId: AuditLogActor | null;
  /** The branch context, populated; null for tenant-level actions. */
  branchId: AuditLogBranchRef | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Query parameters accepted by GET /api/audit-logs. All optional. */
export interface AuditLogListQuery {
  page?: number;
  limit?: number;
  /** Narrow to one kind of event, e.g. "failed_login". */
  action?: string;
  /** Narrow to one kind of target, e.g. "user" / "session". */
  entityType?: string;
  /** Narrow to one actor. */
  userId?: string;
  /** Free-text over action / ipAddress. */
  search?: string;
}

/** Narrows an ApiResponse to its success branch. */
export function isApiSuccess<T>(
  response: ApiResponse<T>,
): response is ApiSuccess<T> {
  return response.success === true;
}
