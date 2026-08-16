/**
 * The backend response contract, defined in .claude/architecture.md and
 * implemented by PawCRM-Backend/src/utils/apiResponse.js.
 *
 * Kept in sync with the backend by hand. If the envelope changes there,
 * it changes here in the same pull request.
 */

/**
 * Type-only, and the direction matters: `inventory.ts` imports nothing, so this
 * cannot cycle. A goods receipt's preview returns the stock gateway's OWN
 * movement and HPP rows verbatim, so redeclaring them here would be a second
 * definition of the same payload that drifts the first time the gateway changes.
 */
import type { PreviewHpp, PreviewMovementRow } from "./inventory";

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
 * How a pin got into the database.
 *
 * "manual" means someone read the numbers off Google Maps and typed them in;
 * "google_places" means the Places picker wrote them. Server-owned — it is
 * absent from the input type below because the backend strips a client-supplied
 * value, so typing it as optional would suggest sending it does something.
 */
export type GeoLocationSource = "manual" | "google_places";

/**
 * A geographic pin on a branch or a warehouse.
 *
 * A subdocument rather than two flat fields on the parent, deliberately: the
 * Places picker returns a placeId and a formatted address alongside the pair,
 * and adding them here later is additive — neither Branch nor Warehouse changes
 * shape. See location.schema.js on the backend.
 *
 * `lat` and `lng` are always both set or both null; the backend rejects half a
 * pair with a 400, because a latitude alone points at the Greenwich meridian.
 */
export interface GeoLocation {
  lat: number | null;
  lng: number | null;
  source: GeoLocationSource;
}

/**
 * What a client MAY send as a pin. `null` clears it.
 *
 * `source` is omitted because the server stamps it from whichever code path
 * wrote the coordinates.
 */
export type GeoLocationInput = Pick<GeoLocation, "lat" | "lng">;

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
  /**
   * Where the branch actually is, independent of the `address` text. Present on
   * every document written by the current schema — but read it defensively, as
   * the backend's list reads use `.lean()` and skip schema defaults, so a
   * document predating the field comes back without the key entirely.
   */
  location: GeoLocation;
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
  /** `null` clears the pin; both coordinates must be sent together. */
  location?: GeoLocationInput | null;
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
  /** `null` clears the pin; both coordinates must be sent together. */
  location?: GeoLocationInput | null;
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
  /**
   * Where the warehouse physically sits. Inherited from the branch when a
   * default warehouse is auto-provisioned, and editable afterwards. Read it
   * defensively for the same reason as on Branch.
   */
  location: GeoLocation;
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
  /** `null` clears the pin; both coordinates must be sent together. */
  location?: GeoLocationInput | null;
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
  /** `null` clears the pin; both coordinates must be sent together. */
  location?: GeoLocationInput | null;
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
  /**
   * Whether the label is still offered for new products.
   *
   * ORTHOGONAL TO `deletedAt`: a retired category keeps everything filed under
   * it and can be reinstated, where a deleted one is gone from ordinary reads.
   * Both exist because a category cannot be deleted while a live product is
   * filed under it — retiring the label is what people mean when a shop stops
   * stocking a line.
   */
  isActive: boolean;
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
  /** Retired state. Omit for both — the API applies no default, unlike `includeDeleted`. */
  isActive?: boolean;
  /** Include soft-deleted categories (default false on the backend). */
  includeDeleted?: boolean;
  /**
   * Which ordering to page through. A NAME, not a field plus a direction — the
   * API accepts a closed list. Omitted means `newest`, its own default.
   */
  sort?: CategorySort;
}

/** The orderings `GET /api/categories` accepts — CATEGORY_SORTS in the model. */
export type CategorySort = "newest" | "oldest" | "nameAsc" | "nameDesc";

/** Body of POST /api/categories. `kind` defaults to "product" server-side. */
export interface CreateCategoryInput {
  name: string;
  kind?: CategoryKind;
  /** Defaults to true server-side; a category is made because it is wanted. */
  isActive?: boolean;
}

/**
 * Body of PATCH /api/categories/:id. `name` is the only editable field, and the
 * backend rejects an empty body — so in practice it is required here too.
 */
export interface UpdateCategoryInput {
  name?: string;
  isActive?: boolean;
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

/**
 * The orderings `GET /api/suppliers` accepts — SUPPLIER_SORTS in the model.
 *
 * No "termin" or "sisa utang": the first is a negotiated property rather than a
 * ranking, and the second is aggregated by a different endpoint, so the database
 * cannot order by it.
 */
export type SupplierSort = "newest" | "oldest" | "nameAsc" | "nameDesc";

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
  /**
   * Which ordering to page through. A NAME, not a field plus a direction — the
   * API accepts a closed list, so a client cannot ask for an ordering with no
   * index behind it. Omitted means `newest`, which is what the API defaults to
   * anyway.
   */
  sort?: SupplierSort;
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
  /**
   * The LATE subset of the two figures above, summed in the same pass and as of
   * the same instant.
   *
   * A supplier who owes something but is late on none of it is present with
   * zeros here — presence in `items` means "has a debt", and these two columns
   * describe that debt. That is not in tension with a supplier owing nothing
   * being absent entirely: the row exists because there is a debt at all.
   */
  overdueInvoiceCount: number;
  overdueOutstanding: string;
  /**
   * The NOT-YET-LATE subset falling due within the summary's `horizonDays`,
   * summed in the same pass and as of the same instant.
   *
   * Disjoint from the overdue columns above: the server cuts both buckets at one
   * `now`, so an invoice is in one or the other and never in both. The two can
   * therefore be added together without counting a bill twice.
   */
  dueSoonInvoiceCount: number;
  dueSoonOutstanding: string;
}

export interface SupplierOutstandingSummary {
  items: SupplierOutstandingRow[];
  totalOutstanding: string;
  totalInvoices: number;
  /**
   * What is already late, across the whole book.
   *
   * THE REASON TO PREFER THIS ENDPOINT over counting `?overdue=true`: that filter
   * answers with a count through `pagination.total` and nothing else, so the
   * rupiah figure could only be had by paging every overdue invoice and adding
   * them up — which is a fan-out, and still wrong past the first page. Always
   * ≤ `totalOutstanding`; both come from one aggregation over one filtered set.
   */
  totalOverdueOutstanding: string;
  totalOverdueInvoices: number;
  /**
   * What falls due within `horizonDays` and is NOT yet late — "how much cash does
   * this week need", across the whole book.
   *
   * THE SAME REASON TO PREFER THIS ENDPOINT applies here and more so: `?dueSoon=`
   * answers with rows and a count, so a client summing a page would be showing a
   * lower bound as if it were a total. Overdue + due-soon is always
   * ≤ `totalOutstanding`; all three come from one aggregation over one filtered
   * set at one instant.
   */
  totalDueSoonOutstanding: string;
  totalDueSoonInvoices: number;
  /**
   * The window the due-soon figures were computed with, in days.
   *
   * Read it rather than hardcoding 7 in a caption: the default lives on the
   * server, and a screen repeating a constant of its own would keep saying "7
   * hari" the day that default changes.
   */
  horizonDays: number;
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

/**
 * The orderings `GET /api/goods-receipts` accepts — GOODS_RECEIPT_SORTS in the
 * model.
 *
 * `newest` / `oldest` key on `receiptDate`, the day the goods arrived, never the
 * day the row was typed. The number orderings are how you walk a sequence rather
 * than a calendar — see the model. There is no ordering by value: `total` is
 * unindexed, so it would be a blocking in-memory sort of every matched receipt.
 */
export type GoodsReceiptSort =
  | "newest"
  | "oldest"
  | "numberDesc"
  | "numberAsc";

/**
 * Query parameters accepted by GET /api/goods-receipts. All optional.
 *
 * NO `includeDeleted`, though the endpoint validates one. There is no `DELETE
 * /goods-receipts/:id` — a posted receipt is immutable — so the flag can never
 * change what comes back, and a filter that cannot alter a result is worse than
 * an absent one: somebody eventually builds a toggle for it.
 */
export interface GoodsReceiptListQuery {
  page?: number;
  limit?: number;
  /** Free-text over receipt number / notes. */
  search?: string;
  supplierId?: string;
  warehouseId?: string;
  purchaseType?: PurchaseType;
  /**
   * Has the supplier's bill been filed against this delivery yet?
   *
   * A TRI-STATE: omit for either, which is what the ordinary list wants.
   * `false` is what the file-an-invoice picker asks for, and it must be asked of
   * the SERVER — filtering a page on `invoiceId === null` drops rows the server
   * already counted, so page 2 of "belum difakturkan" can come back empty while
   * unbilled deliveries sit on page 3.
   */
  invoiced?: boolean;
  /** ISO dates bounding `receiptDate` (inclusive), never `createdAt`. */
  dateFrom?: string;
  dateTo?: string;
  /**
   * Which ordering to page through. A NAME, not a field plus a direction — the
   * API accepts a closed list, so a client cannot ask for an ordering with no
   * index behind it. Omitted means `newest`, which is what the API defaults to
   * anyway.
   */
  sort?: GoodsReceiptSort;
}

/**
 * One line of GET /api/goods-receipts/:id — what physically arrived.
 *
 * `name` IS THE SNAPSHOT taken the day the goods landed; `productName` is what
 * the product is called today. They differ exactly when somebody renamed it
 * since, which is the case a reader most needs to see both halves of — so both
 * are kept rather than one being resolved into the other.
 *
 * `batchId` names the lot this line created, `null` when the goods carry none.
 * The lot's OWN code and expiry are not on this payload; the detail screen
 * resolves them through `productBatchService.getById` — see ReceiptDetail.
 */
export interface GoodsReceiptDetailItem {
  itemId: string;
  productId: string;
  /** The product name as it was when the delivery arrived. */
  name: string;
  productSku: string | null;
  /** Today's name. Null when the product has been deleted since. */
  productName: string | null;
  /** The unit received IN — a line reading "8" without "kg" gets miscounted. */
  productUnit: string | null;
  batchId: string | null;
  qty: string;
  costPerUnit: string;
  subtotal: string;
  /**
   * Σ of every SUBMITTED purchase return against this line. Drafts do not count:
   * one has moved no stock, and counting it would show a line as spent while the
   * goods are still on the shelf.
   */
  returnedQty: string;
  /**
   * `qty − returnedQty` — what may still be sent back.
   *
   * ADVISORY, and the distinction matters. The server re-reads this inside the
   * submit and refuses an over-claim regardless of what a form was shown, so a
   * screen may use it to cap an input but must never use it to decide the request
   * will succeed. Two drafts can each claim the same remainder; the second to
   * submit is refused.
   */
  remainingQty: string;
}

/**
 * GET /api/goods-receipts/:id — one delivery, with its lines and their labels.
 *
 * NAMED `…Detail` RATHER THAN `GoodsReceipt` because `types/purchasing.ts`
 * already owns that name for the prototype store, which the payables and returns
 * screens still run on. Two different shapes under one name would be resolved by
 * import order, which is not a thing anybody should have to reason about.
 *
 * `invoiceId` IS NULL UNTIL THE SUPPLIER'S BILL IS FILED through
 * POST /api/purchase-invoices, and permanently null for consignment. It is NOT
 * the debt: a `beli_putus` receipt credits `2101 Utang Supplier` the moment it
 * posts. What the invoice adds is the vendor's own document number and a due
 * date. A screen that reads a null here as "nothing is owed" is wrong.
 */
export interface GoodsReceiptDetail {
  _id: string;
  receiptNumber: string;
  supplierId: string;
  supplierName: string | null;
  warehouseId: string;
  warehouseName: string | null;
  /** Who keyed it in. Null when that user has been deleted since. */
  createdByName: string | null;
  receiptDate: string;
  purchaseType: PurchaseType;
  items: GoodsReceiptDetailItem[];
  /** EX-TAX — what was debited to inventory. */
  total: string;
  taxAmount: string;
  /** `total + taxAmount`. Derived server-side so a third total cannot disagree. */
  grandTotal: string;
  invoiceId: string | null;
  /** Null on a consignment receipt: nothing was bought, so nothing was posted. */
  journalEntryId: string | null;
  notes: string | null;
  createdAt: string;
}

/** One delivered line, as a client sends it. Money and qty are decimal strings. */
export interface CreateGoodsReceiptItemInput {
  productId: string;
  /** Strictly positive — a receipt records goods ARRIVING. */
  qty: string;
  /**
   * REQUIRED on every line, both purchase types. On `beli_putus` it is the price
   * on the invoice; on `konsinyasi` there was no purchase, so an admin types the
   * agreed value in. Zero is legitimate (a free sample is a real delivery).
   */
  costPerUnit: string;
  /** Required when the product `hasExpiry`, and on every `konsinyasi` line. */
  batchCode?: string;
  /** Required when the product `hasExpiry`. */
  expiryDate?: string;
}

/**
 * POST /api/goods-receipts (and /preview — the same body, deliberately).
 *
 * THE WRITE SURFACE IS NARROW ON PURPOSE. A client sends what a person reading a
 * surat jalan can see. `receiptNumber`, per-line `name`, `subtotal`, `total`,
 * `invoiceId` and `journalEntryId` are all computed by the server and appear
 * nowhere here — a `total` accepted from a client would be a receipt whose lines
 * need not sum to it, and the difference posts into the ledger unexplained.
 */
export interface CreateGoodsReceiptInput {
  supplierId: string;
  warehouseId: string;
  /** Defaults to now. When the goods ARRIVED, not when the row was written. */
  receiptDate?: string;
  purchaseType: PurchaseType;
  /** FORBIDDEN on `konsinyasi` — nothing was bought, so there is no input VAT. */
  taxAmount?: string;
  notes?: string;
  items: CreateGoodsReceiptItemInput[];
}

/**
 * One line of a posting a purchasing preview would write.
 *
 * `accountCode` and `accountName` arrive resolved, matching the stock-movement
 * preview. They used to be absent, and `ReceiptPreviewJournal` guessed each
 * line's account from its position and its nulls — which was wrong, because
 * BOTH `debit` AND `credit` ARE ALWAYS PRESENT on these two endpoints, one of
 * them `"0"`. (The stock-movement preview nulls the unused side; these do not.
 * Read the amount, never the null.) The guess labelled every row of a purchase
 * as the payable. Server-side labels removed the guess and the shim with it.
 */
export interface ReceiptJournalLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

/** One line as the preview echoes it back — priced, but not yet a document. */
export interface GoodsReceiptPreviewItem {
  productId: string;
  name: string;
  qty: string;
  costPerUnit: string;
  subtotal: string;
}

/**
 * POST /api/goods-receipts/preview — what receiving WOULD do, writing nothing.
 *
 * Worth an endpoint of its own more than anywhere else in the system, because a
 * posted receipt cannot be edited: it sets the cost basis every later sale of
 * these goods is costed at, and the only correction is a purchase return.
 *
 * `receiptNumber` IS ADVISORY — peeked, not allocated. Two clerks previewing at
 * the same moment see the same value and a concurrent post makes it stale. Safe
 * as a "this will be GR-260806-004" hint, never as a number to store or to show
 * as though it were already assigned.
 */
export interface GoodsReceiptPreview {
  receiptNumber: string;
  supplierName: string;
  warehouseName: string;
  purchaseType: PurchaseType;
  items: GoodsReceiptPreviewItem[];
  total: string;
  taxAmount: string;
  grandTotal: string;
  /** The ledger rows that would be written, including lots that would be created. */
  movements: PreviewMovementRow[];
  /** The new weighted average per product, WITH the working. */
  hppAvg: PreviewHpp[];
  /** The exact lines that would be posted. `[]` for a consignment delivery. */
  journal: ReceiptJournalLine[];
}

/* ------------------------------------------------- purchase invoices (utang) */

/**
 * Where a payable stands. AUTO-COMPUTED server-side from `paidAmount` against
 * `total` and never accepted from a client — "outstanding AP" is defined as
 * `status !== "paid"`, so a status somebody could type would be a wrong number
 * on the one report this collection exists to produce.
 */
export type InvoiceStatus = "unpaid" | "partial" | "paid";

/**
 * How a supplier was paid. The value decides which account is CREDITED, which is
 * the only reason it is an enum: `cash` hits 1101 Kas, everything else hits
 * 1102 Bank.
 *
 * `giro` is the one approximation — a post-dated cheque clears later and
 * strictly belongs in a clearing liability, but no such account exists in the
 * seeded chart. The method is recorded so those entries can be reclassified when
 * one does.
 */
export type PaymentMethod = "cash" | "transfer" | "qris" | "giro";

/**
 * One row of GET /api/purchase-invoices — a supplier bill, without its payments.
 *
 * NOT THE DEBT ITSELF. A `beli_putus` goods receipt credits `2101 Utang
 * Supplier` the moment it posts, so the payable exists before any invoice is
 * filed. This document adds the vendor's own number, the date they issued it,
 * and the due date derived from their payment terms.
 *
 * `outstandingAmount` AND `isOverdue` ARE DERIVED SERVER-SIDE and must not be
 * recomputed here. `outstandingAmount` is `total - paidAmount` in exact minor
 * units; `isOverdue` is `status !== "paid" && dueDate < now`, evaluated against
 * ONE instant for the whole page so two invoices due at the same moment cannot
 * land on opposite sides of it. A client redoing either arithmetic is how the
 * banner above a table ends up disagreeing with the rows beneath it.
 *
 * The list projects `payments` away; `paymentCount` stands in for them.
 */
export interface PurchaseInvoiceListRow {
  _id: string;
  /** The SUPPLIER'S number, typed in from their document — not one we allocate. */
  invoiceNumber: string;
  supplierId: string;
  /** Null when the vendor was soft-deleted since; the bill still stands. */
  supplierName: string | null;
  branchId: string;
  goodsReceiptId: string;
  /** When the supplier ISSUED the bill — what `dueDate` is counted from. */
  invoiceDate: string;
  /** `invoiceDate + supplier.paymentTermDays`, frozen when the bill was filed. */
  dueDate: string;
  /** Goods value, ex-tax. Reconciles exactly with the goods receipt's total. */
  subtotal: string;
  taxAmount: string;
  /** `subtotal + taxAmount` — what the supplier is owed in full. */
  total: string;
  paidAmount: string;
  /** `total - paidAmount`. Derived, never stored. */
  outstandingAmount: string;
  /** `status !== "paid"` AND past due, as of the server's clock. */
  isOverdue: boolean;
  status: InvoiceStatus;
  paymentCount: number;
  notes: string | null;
  createdAt: string;
}

/**
 * One payment against one invoice.
 *
 * `journalEntryId` IS NEVER NULL, unlike every other journal reference in this
 * API: a payment moves cash, and cash that moved without a double entry behind
 * it is money the books cannot account for. It is also the only route to
 * correcting a mistake — a payment cannot be edited or deleted, so a wrong one
 * is fixed by reversing the entry it posted.
 */
export interface PurchaseInvoicePayment {
  /** The payment's own id — NOT `_id`; it is a domain identifier. */
  paymentId: string;
  /** When the money actually MOVED, which is what the ledger entry is dated by. */
  at: string;
  amount: string;
  method: PaymentMethod;
  /** Bank reference, giro number or QRIS transaction id. */
  ref: string | null;
  byUserId: string | null;
  /** Null when that user has been deleted since. */
  byUserName: string | null;
  journalEntryId: string;
}

/**
 * GET /api/purchase-invoices/:id — one bill, with its payments and their labels.
 *
 * `journalEntryId` on the INVOICE (as opposed to on a payment) is null on
 * everything the API writes today, and that is the design rather than a gap: the
 * payable was posted by the goods receipt, so an entry here would double it. A
 * screen must not read the null as "nothing was posted".
 */
export interface PurchaseInvoiceDetail
  extends Omit<PurchaseInvoiceListRow, "paymentCount"> {
  branchName: string | null;
  goodsReceiptNumber: string | null;
  /** Who filed the bill. Null when that user has been deleted since. */
  createdByName: string | null;
  payments: PurchaseInvoicePayment[];
  journalEntryId: string | null;
}

/**
 * Query parameters accepted by GET /api/purchase-invoices. All optional.
 *
 * `outstanding` and `overdue` ARE THE AP REPORT and are expressed server-side so
 * every consumer asks the question identically: outstanding is `status != paid`,
 * overdue is that plus a due date already past. An explicit `status` wins over
 * both. Recomputing either from a page of rows would make the screen's filter
 * and the server's count disagree.
 *
 * NO `includeDeleted`, though the endpoint validates one: nothing writes
 * `deletedAt` and no route removes an invoice, so the flag cannot change a
 * result — and a filter that cannot alter anything is worse than an absent one.
 */
export interface PurchaseInvoiceListQuery {
  page?: number;
  limit?: number;
  /** Free-text over invoice number / notes. */
  search?: string;
  supplierId?: string;
  branchId?: string;
  goodsReceiptId?: string;
  status?: InvoiceStatus;
  outstanding?: boolean;
  overdue?: boolean;
  /**
   * Outstanding, NOT yet late, and due within the server's horizon.
   *
   * Not expressible with `dueBefore`, which bounds only the far end of the window
   * and so always carries the overdue invoices along with it. This is the exact
   * complement of `overdue`, cut at the server's own clock — which is why the
   * window is not a parameter here: the count and the rupiah total beside these
   * rows come from the outstanding summary, and two places to state a window are
   * two chances to state it differently.
   */
  dueSoon?: boolean;
  /**
   * ISO dates bounding `invoiceDate` — the day the SUPPLIER issued the bill,
   * never `createdAt`. `dateTo` covers the whole day it names.
   */
  dateFrom?: string;
  dateTo?: string;
  /**
   * Upper bound on `dueDate` — "what falls due before X", the planning horizon.
   * Unlike `dateTo` this is NOT pushed to end of day: callers pass an instant
   * they computed, not a date a human typed.
   */
  dueBefore?: string;
  /**
   * Which ordering to page through. A NAME, not a field plus a direction — the
   * API accepts a closed list, so a client cannot ask for an ordering with no
   * index behind it. Omitted means `newest`, which is what the API defaults to
   * anyway.
   */
  sort?: PurchaseInvoiceSort;
}

/**
 * The orderings `GET /api/purchase-invoices` accepts — PURCHASE_INVOICE_SORTS in
 * the model.
 *
 * TWO DATE AXES, which is why this is not the usual newest/oldest pair.
 * `newest` / `oldest` key on `invoiceDate` — the day the supplier issued the
 * bill. `dueSoonest` / `dueLatest` key on `dueDate` — the day we have to pay,
 * which is the question a payables screen exists for.
 *
 * Named after the axis rather than a direction, matching the batch list's
 * `expirySoonest`: on a date that means a deadline, "ascending" is not what
 * anybody calls it.
 */
export type PurchaseInvoiceSort =
  | "newest"
  | "oldest"
  | "dueSoonest"
  | "dueLatest";

/**
 * POST /api/purchase-invoices — file the supplier's bill against a delivery.
 *
 * THE WRITE SURFACE IS DELIBERATELY NARROW: a client sends only what a person
 * holding the vendor's paperwork can read off it. `dueDate`, `total`,
 * `paidAmount`, `status`, `payments` and `branchId` are all derived or stamped
 * by the server and appear nowhere here — a `dueDate` from a client would let a
 * clerk grant themselves terms the supplier never agreed to.
 *
 * `subtotal` AND `taxAmount` MUST MATCH THE RECEIPT to the minor unit. The
 * payable was already posted at the receipt's numbers, so a difference would be
 * a price variance nothing booked — the server refuses it with a message quoting
 * both figures. Prefill from the receipt rather than asking a human to retype.
 */
export interface CreatePurchaseInvoiceInput {
  supplierId: string;
  /** The delivery being billed. One invoice per receipt, enforced by a unique index. */
  goodsReceiptId: string;
  invoiceNumber: string;
  /** Defaults to now. The date the supplier ISSUED the bill. */
  invoiceDate?: string;
  subtotal: string;
  taxAmount?: string;
  notes?: string;
}

/**
 * POST /api/purchase-invoices/:id/payments — pay a supplier.
 *
 * NOT IDEMPOTENT: a double-submitted form records the money leaving twice, on
 * two irreversible journal entries. Callers lock their submit control for the
 * whole flight.
 *
 * Overpayment is REFUSED rather than absorbed, and there is no `notes` field —
 * the model carries only `ref`, the string this row will be reconciled against
 * on a bank statement.
 */
export interface RecordPaymentInput {
  /** Strictly positive, and never more than `outstandingAmount`. */
  amount: string;
  method: PaymentMethod;
  /** Defaults to now. The day the money MOVED, which dates the ledger entry. */
  at?: string;
  ref?: string;
}

/**
 * A return's lifecycle. `draft` is still being keyed and has moved nothing;
 * `submitted` has reversed the stock and the ledger.
 */
export type PurchaseReturnStatus = "draft" | "submitted";

/**
 * One row of GET /api/purchase-returns — a delivery sent back, without its lines.
 *
 * `items` IS PROJECTED AWAY by the server and replaced with `itemCount`, as on
 * the receipt list. Read one return to get its lines.
 *
 * THERE IS NO `notes`. This type used to declare one; the collection has never
 * had the field, so it was always `undefined` at runtime. A return explains
 * itself per line, in `items[].reason` — one return commonly carries two damaged
 * cartons and one wrong SKU, and a single note at the top would have to be a lie
 * about one of them.
 */
export interface PurchaseReturnListRow {
  _id: string;
  returnNumber: string;
  returnDate: string;
  status: PurchaseReturnStatus;
  supplierId: string;
  supplierName: string | null;
  warehouseId: string;
  warehouseName: string | null;
  /** The delivery this reverses. */
  originalReceiptId: string;
  originalReceiptNumber: string | null;
  totalAmount: string;
  itemCount: number;
  createdAt: string;
}

/**
 * One line of a return, as GET /api/purchase-returns/:id returns it.
 *
 * EVERYTHING BUT `qty` AND `reason` IS THE SERVER'S, copied from the receipt line
 * `originalReceiptItemId` names. That is the point of tracing at all: `costPerUnit`
 * is what the delivery ACTUALLY charged, which is the figure the weighted average
 * has to be reversed at, and a client able to type it could restate the cost basis
 * every future sale is costed at.
 */
export interface PurchaseReturnItem {
  /** The `goodsreceipts.items[].itemId` this line reverses. Also its identity. */
  originalReceiptItemId: string;
  productId: string;
  productSku: string | null;
  /** Null when the product has been deleted since. */
  productName: string | null;
  productUnit: string | null;
  /** The lot the goods leave from. Null is the ordinary case. */
  batchId: string | null;
  batchCode: string | null;
  batchExpiryDate: string | null;
  /** Stored POSITIVE — the stock ledger owns the sign. */
  qty: string;
  /** What that delivery charged for one unit. Never today's average. */
  costPerUnit: string;
  subtotal: string;
  /** Free text, ≤ 255 chars. Read by the SUPPLIER, so not an enum. */
  reason: string;
}

/**
 * GET /api/purchase-returns/:id — one return, with its lines and their labels.
 *
 * `journalEntryId` IS NULL FOR THREE DIFFERENT REASONS and a screen must not
 * collapse them: the return is still a draft and nothing has posted; the goods
 * came in on `konsinyasi`, so there was never a debt to discharge; or the
 * returned value came to zero, which the ledger correctly declines to post.
 */
export interface PurchaseReturnDetail
  extends Omit<PurchaseReturnListRow, "itemCount"> {
  items: PurchaseReturnItem[];
  journalEntryId: string | null;
  /** Who opened the return. Null when that user has been deleted since. */
  createdByName: string | null;
  updatedAt: string;
}

/** Query parameters accepted by GET /api/purchase-returns. All optional. */
export interface PurchaseReturnListQuery {
  page?: number;
  limit?: number;
  /** Matches the return number — what a human recognises a return by. */
  search?: string;
  supplierId?: string;
  warehouseId?: string;
  /** The delivery being reversed — how a receipt finds its own returns. */
  originalReceiptId?: string;
  status?: PurchaseReturnStatus;
  /** ISO dates bounding `returnDate` — the day the goods went back. */
  dateFrom?: string;
  dateTo?: string;
  /**
   * Which ordering to page through. A NAME, not a field plus a direction — the
   * API accepts a closed list, so a client cannot ask for an ordering with no
   * index behind it. Omitted means `newest`, which is what the API defaults to
   * anyway.
   */
  sort?: PurchaseReturnSort;
}

/**
 * The orderings `GET /api/purchase-returns` accepts — PURCHASE_RETURN_SORTS in
 * the model.
 *
 * `newest` / `oldest` key on `returnDate`, the day the goods physically went
 * back, never the day the row was typed. The number orderings walk a sequence —
 * the return number is ours, sequential, and what the supplier quotes on their
 * credit note. There is no ordering by value or by status; see the model.
 */
export type PurchaseReturnSort =
  | "newest"
  | "oldest"
  | "numberDesc"
  | "numberAsc";

/** One line going back, as a client sends it. Three fields, and that is the design. */
export interface PurchaseReturnItemInput {
  originalReceiptItemId: string;
  /** Strictly positive, and never more than the line's `remainingQty`. */
  qty: string;
  /** Required on every line. Free text — the supplier reads it. */
  reason: string;
}

/**
 * POST /api/purchase-returns — open a DRAFT against a delivery. 201.
 *
 * MOVES NOTHING. The draft exists so a storekeeper can list what is going back
 * while holding the damaged carton, and somebody with the authority to reduce a
 * supplier's payable closes it afterwards. The return NUMBER is allocated here
 * regardless, because a clerk on the phone to a vendor needs one to quote.
 *
 * `supplierId` and `warehouseId` are NOT sent: goods go back to whoever delivered
 * them, out of wherever they landed, and both are read off the receipt.
 *
 * AT LEAST ONE ITEM, unlike a stock opname — a return is never opened empty,
 * because it is raised in response to something already in the room.
 */
export interface CreatePurchaseReturnInput {
  originalReceiptId: string;
  /** Defaults to now. When the goods PHYSICALLY went back. */
  returnDate?: string;
  items: PurchaseReturnItemInput[];
}

/**
 * PATCH /api/purchase-returns/:id — edit a draft.
 *
 * `items` REPLACES the stored array wholesale, so removing a line is sending the
 * list without it and emptying the return is a delete rather than an edit.
 *
 * `returnDate` is optional; omitting it leaves the stored date alone rather than
 * clearing it. `originalReceiptId` is not accepted at all — repointing a return
 * would silently revalue every line at costs from a different arrival.
 */
export interface UpdatePurchaseReturnInput {
  returnDate?: string;
  items: PurchaseReturnItemInput[];
}

/** One line of the return, echoed back by the preview — priced, but not yet posted. */
export interface PurchaseReturnPreviewItem {
  originalReceiptItemId: string;
  productId: string;
  batchId: string | null;
  qty: string;
  costPerUnit: string;
  subtotal: string;
  reason: string;
}

/**
 * POST /api/purchase-returns/:id/preview — what submitting WOULD do, writing
 * nothing.
 *
 * WORTH AN ENDPOINT MORE THAN ALMOST ANYWHERE ELSE, because the submit cannot be
 * undone and moves two things at once: the stock leaves, and the weighted-average
 * cost every future sale of the SURVIVING stock is costed at moves with it.
 * `hppAvg` shows the before, the after and the working.
 *
 * GATED ON `purchaseReturns:submit`, NOT `read` — it answers "what does this do
 * to my margins and my payable", and a role that may not close a return has no
 * business asking. A screen must hide the panel for such a role rather than
 * showing them a 403.
 *
 * Every refusal the submit would make, this makes too.
 */
export interface PurchaseReturnPreview {
  returnId: string;
  returnNumber: string;
  originalReceiptId: string;
  originalReceiptNumber: string | null;
  /** `konsinyasi` posts no journal at all — the goods were never bought. */
  purchaseType: PurchaseType;
  items: PurchaseReturnPreviewItem[];
  totalAmount: string;
  /** The rows that would be written, and the lots they would draw from. */
  movements: PreviewMovementRow[];
  /** The new weighted average per product, WITH the working. Empty when the goods had no cost. */
  hppAvg: PreviewHpp[];
  /** `Dr 2101 / Cr 1201`. `[]` for a consignment return, and for one worth nothing. */
  journal: ReceiptJournalLine[];
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

/**
 * One product a supplier still has sitting in the warehouse.
 *
 * The row behind `SupplierConsignmentRow.productCount` — the summary says how
 * many, this says which. Both come from the same lots; only the grouping
 * differs.
 */
export interface ConsignmentProductRow {
  supplierId: string;
  /** Null when the vendor was soft-deleted since. The goods are still there. */
  supplierName: string | null;
  productId: string;
  sku: string | null;
  name: string;
  unit: string;
  /** Distinct lots of this product still holding stock. */
  lotCount: number;
  qtyRemaining: string;
  /** `qtyRemaining × costPerUnit` — what the supplier invoices as it sells. */
  value: string;
  /**
   * The soonest expiry across this product's lots.
   *
   * NULL IS THE ORDINARY CASE for dry goods and is not "expires today" — it
   * changes what the conversation with the vendor is about, so the absence is
   * rendered rather than substituted with a date.
   */
  nearestExpiry: string | null;
}

export interface ConsignmentProductsResult {
  items: ConsignmentProductRow[];
  totalValue: string;
  totalLots: number;
}
