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
import type { MediaAsset, PreviewHpp, PreviewMovementRow } from "./inventory";

/**
 * Something that happened alongside a SUCCESSFUL request and that the person who
 * made it should know about.
 *
 * The mirror of `ApiFailure.details`, and it exists for a case a failure cannot
 * express: creating a customer whose phone number somebody else already holds
 * SUCCEEDS — two people in one household share a handset, and a shop that could
 * not register the second is one where the second gets written on paper. But the
 * cashier still has to be told, so they can check whether this is the same
 * person walking in twice.
 */
export interface ApiWarning {
  /** Stable identifier a caller can branch on, e.g. "phone-duplicate". */
  code: string;
  /** The input it is about, when there is one. Lets a form bind it to a field. */
  field?: string;
  /** Ready to show. Written in Bahasa Indonesia by the backend. */
  message: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  /**
   * Omitted entirely when there is nothing to warn about, so a response that
   * carries none is byte-for-byte what it was before warnings existed.
   *
   * NOT INSIDE `data`: the warning is about the REQUEST, not about the record,
   * and folding it in would add a field to every domain shape that nothing
   * stores. `apiClient.post` unwraps to `data` and drops this — a caller that
   * needs it uses `apiClient.postEnvelope`.
   */
  warnings?: ApiWarning[];
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
/**
 * One branch's worth of warehouse scope on a user.
 *
 * A branch is a set of books and a warehouse is a shelf, so the two axes are
 * nested rather than flat: `allWarehouses` means every shelf of THIS branch and
 * keeps meaning that as new ones open, which an enumerated list cannot.
 *
 * SHARED WAREHOUSES ARE NEVER LISTED HERE. A warehouse with
 * `defaultBranchId: null` is the central one serving every branch, so it comes
 * with any branch access at all; the backend refuses one sent in `warehouseIds`
 * rather than storing a duplicate of a grant the user already has.
 */
export interface WarehouseScopeEntry {
  branchId: string;
  /** Every warehouse of this branch, including ones opened later. */
  allWarehouses: boolean;
  /** Empty whenever `allWarehouses` is true — one representation of "all". */
  warehouseIds: string[];
}

export interface User {
  _id: string;
  tenantId: string;
  email: string;
  fullName: string;
  phone: string | null;
  roleId: string | null;
  allBranches: boolean;
  branchAccess: string[];
  /**
   * Exactly one entry per id in `branchAccess`, and `[]` whenever `allBranches`
   * is true. Read defensively: users stored before this field existed come back
   * with `[]` alongside a non-empty `branchAccess`, which the backend reads as
   * "never configured" and treats as every warehouse of those branches.
   */
  warehouseAccess: WarehouseScopeEntry[];
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
 *
 * `warehouseAccess` is optional and derived from the branch scope: omitting it
 * grants every warehouse of every granted branch, which is what a branch grant
 * meant before the field existed. Rows for branches not granted are dropped by
 * the backend rather than refused, so a form may send what it has on screen.
 */
export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
  roleId?: string | null;
  allBranches?: boolean;
  branchAccess?: string[];
  warehouseAccess?: WarehouseScopeEntry[];
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
  warehouseAccess?: WarehouseScopeEntry[];
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
 * What a category is FOR — the discriminator on the backend's shared
 * `categories` collection (see category.model.js).
 *
 * TWO KINDS, TWO RESOURCES, AND NO SCREEN EVER CHOOSES BETWEEN THEM. Product
 * categories come from `/api/categories` and supplier categories from
 * `/api/supplier-categories`; each endpoint filters on its own kind server-side
 * and refuses the other one on a write. So the field is something a response
 * CARRIES, never something a form sets — which is why `CreateCategoryInput`
 * takes `kind?: "product"` for backwards compatibility and
 * `CreateSupplierCategoryInput` does not take it at all.
 */
export type CategoryKind = "product" | "supplier";

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
 * Grouping is all a category does: it carries no price, no stock and no rules.
 * The three fields that describe it are therefore all about the LABEL — what it
 * is called, what belongs under it, and what it looks like on a tile.
 */
export interface Category {
  _id: string;
  tenantId: string;
  /**
   * Always `"product"` on this shape: every read that produces a `Category`
   * goes through `/api/categories`, which filters on the kind server-side.
   * Narrowed rather than left as `CategoryKind` so a screen holding one of
   * these cannot be handed a supplier category by a type that says it might.
   */
  kind: "product";
  name: string;
  /**
   * The category this one sits under, or `null` for a top-level category.
   *
   * THE TREE IS EXACTLY TWO DEEP. A category with a `parentId` cannot itself
   * be a parent — the API refuses it — so `parent.parent` is a shape that does
   * not exist and nothing needs to recurse.
   */
  parentId: string | null;
  /**
   * The parent, resolved by the API so a list does not need one request per row.
   *
   * A SIBLING OF `parentId` RATHER THAN A POPULATED VERSION OF IT: the id stays
   * an id, so code that only asks "is this a sub-category" reads one scalar,
   * and code that prints the trail reads `parent.name`. `null` whenever
   * `parentId` is.
   */
  parent: { _id: string; name: string } | null;
  /**
   * A sentence or two saying what belongs under this label — a hint for
   * whoever is filing a product, not marketing copy.
   *
   * PLAIN TEXT, unlike a product's description, which is sanitised HTML. Render
   * it as text; never as `dangerouslySetInnerHTML`.
   */
  description: string | null;
  /**
   * The one picture that represents the label — a category tile, a POS group
   * button, a storefront strip.
   *
   * ONE IMAGE, NOT A GALLERY: a category is a label, not the thing being
   * photographed nine ways. Always an image; the API refuses a video here,
   * because there is no second item to fall back to.
   *
   * `thumbUrl` and `mediumUrl` are null on assets stored before those
   * derivatives existed, so read it as `thumbUrl ?? url`.
   */
  image: MediaAsset | null;
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

/**
 * The two words `?parentId=` accepts alongside an actual category id.
 *
 * Words rather than empty values, because an empty query parameter is `""` on
 * one client and dropped on another, and dropped already means something else
 * here (both levels).
 */
export const TOP_LEVEL_ONLY = "none";
export const SUB_LEVEL_ONLY = "sub";

/** Query parameters accepted by GET /api/categories. All optional. */
export interface CategoryListQuery {
  page?: number;
  limit?: number;
  /**
   * Product only, and the API refuses anything else on this resource. Kept
   * because the field predates the second kind and clients were already sending
   * it; there is nothing to vary here — supplier categories have their own
   * query type below.
   */
  kind?: "product";
  /**
   * One parent's children (an id), only top-level categories
   * (`TOP_LEVEL_ONLY`), only sub-categories (`SUB_LEVEL_ONLY`), or — omitted —
   * both levels, which is what the category screen opens on.
   */
  parentId?: string;
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
  /** Product only — the API 400s on any other kind. See CategoryKind. */
  kind?: "product";
  /**
   * Files this category under another. The parent must itself be top-level —
   * the API refuses a three-level tree with a 400 naming the field.
   */
  parentId?: string | null;
  /** `""` is accepted and stored as null. */
  description?: string | null;
  /**
   * The asset `POST /api/media/upload` returned, HANDED BACK WHOLE — `token`
   * included. The API refuses an asset without it: everything else in the
   * object passed through this browser and is therefore client-controlled by
   * the time it arrives.
   */
  image?: MediaAsset | null;
  /** Defaults to true server-side; a category is made because it is wanted. */
  isActive?: boolean;
}

/**
 * Body of PATCH /api/categories/:id. Every field is independent, and the
 * backend rejects an empty body — so at least one must be present.
 *
 * Send only what MOVED. A patch that resends an unchanged `image` is a round
 * trip away from losing it, because the API deletes the bytes an update drops.
 */
export interface UpdateCategoryInput {
  name?: string;
  /** A new id moves it; `null` promotes it back to the top level. */
  parentId?: string | null;
  /** `""` and `null` both clear it. */
  description?: string | null;
  /** A new asset replaces the picture; `null` removes it. */
  image?: MediaAsset | null;
  isActive?: boolean;
}

/**
 * A supplier category — the label a VENDOR is grouped by, from
 * `/api/supplier-categories`.
 *
 * A NAME AND A SWITCH. It shares the backend's `categories` collection with
 * product categories (told apart by `kind`), and it is deliberately NOT the
 * `Category` shape with fields omitted: this kind has no parent, no
 * description and no picture, and the API neither returns nor accepts them.
 * A separate interface is what stops a screen from reaching for
 * `category.image` and getting `undefined` at runtime from a type that
 * promised `MediaAsset | null`.
 */
export interface SupplierCategory {
  _id: string;
  tenantId: string;
  /** Always `"supplier"` here — the resource filters on it server-side. */
  kind: "supplier";
  name: string;
  /**
   * Whether the label is still offered when grouping a vendor.
   *
   * ORTHOGONAL TO `deletedAt`, the same split product categories make: a
   * retired label keeps everything already grouped under it and can be
   * reinstated, where a deleted one is gone from ordinary reads.
   */
  isActive: boolean;
  /** Soft-delete marker; non-null means deleted (restorable), null means live. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Query parameters accepted by GET /api/supplier-categories. All optional.
 *
 * NO `parentId` AND NO `kind`. There is no tree to filter on, and the kind is
 * what the resource IS — a parameter with one legal value is a control
 * pretending to be a choice.
 */
export interface SupplierCategoryListQuery {
  page?: number;
  limit?: number;
  /** Free-text over the name. */
  search?: string;
  /** Retired state. Omit for both — the API applies no default, unlike `includeDeleted`. */
  isActive?: boolean;
  /** Include soft-deleted categories (default false on the backend). */
  includeDeleted?: boolean;
  /** Which ordering to page through. Omitted means `newest`, the API's default. */
  sort?: CategorySort;
}

/**
 * Body of POST /api/supplier-categories.
 *
 * `name` is the whole form. `kind` is NOT accepted by the API here — unlike the
 * product resource, which still takes it for backwards compatibility — so it is
 * absent from this type rather than optional.
 */
export interface CreateSupplierCategoryInput {
  name: string;
  /** Defaults to true server-side; a category is made because it is wanted. */
  isActive?: boolean;
}

/**
 * Body of PATCH /api/supplier-categories/:id. Both fields are independent, and
 * the backend rejects an empty body — so at least one must be present.
 */
export interface UpdateSupplierCategoryInput {
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

/* ------------------------------------------------------------------- POS */

/** Open, or closed. Two values and no third — see posShift.model.js. */
export type PosShiftStatus = "open" | "closed";

/**
 * A cashier's session at one till.
 *
 * The closing four are null together while the shift is open: a half-closed
 * shift is not a state the model can hold. Every money field is a decimal
 * STRING.
 */
export interface PosShift {
  _id: string;
  tenantId: string;
  branchId: string;
  warehouseId: string;
  shiftNumber: string;
  cashierUserId: string;
  openedAt: string;
  openingCash: string;
  closedAt: string | null;
  countedCash: string | null;
  /** Opening float plus the shift's own cash takings. Computed by the server. */
  expectedCash: string | null;
  /** countedCash − expectedCash. Positive is a surplus. */
  difference: string | null;
  closingNotes: string | null;
  status: PosShiftStatus;
  createdAt: string;
  updatedAt: string;
}

/** One channel's takings during a shift. `net` is amount minus change given. */
export interface PosPaymentBreakdownRow {
  channelId: string;
  channelType: PaymentChannelType;
  channelName: string;
  count: number;
  amount: string;
  change: string;
  net: string;
}

/**
 * The X-Report (FR-9). Read-only and repeatable — running it commits to nothing.
 *
 * `expectedCash` counts ONLY cash: a transfer settles into a bank account, and
 * counting it would make the drawer look flush and the cashier look short.
 */
export interface PosXReport {
  shift: PosShift;
  transactionCount: number;
  breakdown: PosPaymentBreakdownRow[];
  /**
   * This shift's cash refunds, shown on their own line rather than only netted
   * away — a figure with no explanation behind it is one nobody trusts.
   */
  refunds: {
    count: number;
    cashRefunds: string;
  };
  totals: {
    takings: string;
    /** NET of this shift's cash refunds. */
    cashTakings: string;
    expectedCash: string;
  };
}

/** What a cart line is. A service consumes no stock and posts no HPP. */
export type PosItemKind = "product" | "service";

/** How a discount was expressed. Both are stored — see PosDiscount. */
export type PosDiscountMode = "percent" | "amount";

/**
 * A discount at either level.
 *
 * `resolvedAmount` IS THE AUTHORITY — `mode` and `value` record what was typed.
 * FR-4: changing a line's quantity after a nominal discount does not rescale it.
 *
 * `approvedBy` is set only when the discount exceeded the cashier's limit. Null
 * means it was within limit, not that nobody approved it.
 */
export interface PosDiscount {
  mode: PosDiscountMode;
  value: string;
  resolvedAmount: string;
  approvedBy: string | null;
}

/** One line in the basket. `name` and `unitPrice` are snapshots. */
export interface PosItem {
  kind: PosItemKind;
  refId: string;
  name: string;
  sku: string | null;
  qty: string;
  unitPrice: string;
  /**
   * `qty × unitPrice`, GROSS — before this line's own discount.
   *
   * Read, never recomputed. Multiplying qty by price here would round
   * differently from the server's minor-unit arithmetic on a fractional quantity
   * or a 7,5% discount, and the basket would then disagree with the receipt.
   */
  lineTotal: string;
  discount: PosDiscount | null;
  hppAtTime: string | null;
  bookingId: string | null;
  petId: string | null;
  petName: string | null;
  groomerName: string | null;
}

/** An ADDITIVE charge — ongkos kirim, packaging (FR-5). Never negative. */
export interface PosCharge {
  label: string;
  amount: string;
}

/** One settlement. Channel type and name are snapshotted beside the id. */
export interface PosPayment {
  channelId: string;
  channelType: PaymentChannelType;
  channelName: string;
  amount: string;
  change: string | null;
  reference: string | null;
}

/** Every figure, computed once when the basket settles. Null until then. */
export interface PosTotals {
  subtotal: string;
  itemDiscount: string;
  cartDiscount: string;
  otherCharges: string;
  dpp: string;
  tax: string;
  grandTotal: string;
  /**
   * How much of `grandTotal` walked out unpaid, as a receivable (FR-7).
   *
   * "0.0000" on an ordinary sale, which is almost all of them. Frozen with the
   * rest, because the receipt prints it — and it must keep saying what it said
   * on the day even after the debt is settled.
   */
  credit: string;
}

/**
 * The live figures a till shows while a basket is being built (FR-2).
 *
 * A SEPARATE TYPE FROM `PosTotals`, not an optional-fields version of it,
 * because they are different kinds of fact: this is derived and changes with
 * every tap, `PosTotals` is a record frozen at payment.
 */
export interface PosRunningTotals {
  subtotal: string;
  itemDiscount: string;
  cartDiscount: string;
  otherCharges: string;
  net: string;
}

/**
 * Where a basket stands.
 *
 * `active` is the one on the cashier's screen right now — NOT parked, and not in
 * Keranjang Tersimpan. `held` is one somebody deliberately put aside. Every cart
 * used to be born `held`, which made parking the default rather than a decision.
 *
 * `open` is the Hotel module's open bill, carried with no UI. There is no
 * `cancelled`: an unpaid cart is deleted, a paid one is voided.
 */
export type PosTransactionStatus =
  | "active"
  | "held"
  | "open"
  | "paid"
  | "void";

/**
 * A basket at the till.
 *
 * THE SHAPE IS A LIFECYCLE, not a completed sale — which is why almost
 * everything is nullable. `transactionNumber` is null until payment, because the
 * counter is not reversible and parked carts would burn the series.
 */
export interface PosTransaction {
  _id: string;
  tenantId: string;
  branchId: string;
  warehouseId: string;
  shiftId: string;
  transactionNumber: string | null;
  customerId: string | null;
  /**
   * Who the basket belongs to, named.
   *
   * RESOLVED ON READ rather than snapshotted onto the basket: a cart is
   * short-lived, and a customer renamed between parking and paying should show
   * the new name. Unlike `totals`, this is a label rather than a record of what
   * was agreed.
   *
   * Still present when the customer has since been removed from the list — an id
   * on screen is worse than a name that belongs to a retired record.
   */
  customer: {
    _id: string;
    name: string;
    phone: string | null;
  } | null;
  items: PosItem[];
  cartDiscount: PosDiscount | null;
  otherCharges: PosCharge[];
  note: string | null;
  payments: PosPayment[];
  /** The FROZEN record, written at settlement. Null until then. */
  totals: PosTotals | null;
  /**
   * The receivable a credit sale raised (FR-7). Null on every cash sale.
   *
   * Its PRESENCE is the answer to "was this sold on account" — which the void
   * screen needs before it offers a button it will then refuse.
   */
  customerInvoiceId: string | null;
  /**
   * What the basket comes to right now — computed by the server on every read,
   * never stored.
   *
   * NO TAX IN IT: the split is frozen at payment. For the tax-inclusive default
   * `net` is what the customer pays.
   */
  runningTotals: PosRunningTotals;
  status: PosTransactionStatus;
  heldLabel: string | null;
  bookingIds: string[];
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Whether a tile can be sold right now. Absent on services and parents. */
export type PosStockState = "ok" | "low" | "out";

/**
 * One tile in the till grid — a product OR a service, flattened to one shape.
 *
 * `stock: null` is NOT the same as `ok`: a service, a parent and a bundle all
 * carry null, because a badge saying "in stock" on a grooming invites the
 * question of how many are left.
 */
export interface PosCatalogItem {
  kind: PosItemKind;
  _id: string;
  name: string;
  code: string | null;
  /**
   * What a scanner reads. Null on a service and on anything never scanned in.
   *
   * DRAWN ONLY WHEN A SEARCH MATCHED IT — see PosProductCard. A search looks at
   * four fields while a tile shows two, so a scan used to return a result with
   * nothing on it explaining why.
   */
  barcode: string | null;
  /**
   * The one photo a tile draws, at the three sizes it may draw it at.
   *
   * RESOLVED BY THE SERVER through `variant's own → its own gallery → its
   * parent's` — the same chain the catalogue screen uses. A variant showing its
   * parent's photo in Inventory and a blank square at the till would read as a
   * bug in the till.
   *
   * Null on a service (there is no field for one) and on anything never
   * photographed. The tile draws a placeholder rather than a broken image.
   */
  image: {
    url: string;
    mediumUrl: string | null;
    thumbUrl: string | null;
    mediaType: string;
  } | null;
  /** Null on a parent — its variants carry the price. */
  price: string | null;
  categoryId: string | null;
  unit: string | null;
  productType?: string;
  parentId?: string | null;
  isConsignment?: boolean;
  /** Null unless this is a parent. */
  variantCount: number | null;
  stock: { qty: string; state: PosStockState } | null;
}

/** Query parameters accepted by GET /api/pos/catalog. */
export interface PosCatalogQuery {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  /**
   * One parent's variants — what the picker a parent tile opens asks for.
   *
   * ASKED OF THE CATALOGUE rather than the products endpoint, and that is the
   * whole reason the picker can show stock at all: the catalogue knows the
   * shift's warehouse, the products endpoint does not, and a badge drawn from
   * the second would be counting a shelf in another building.
   */
  parentId?: string;
  /** The "Layanan" pill sends ["service"]. Absent means both. */
  kinds?: PosItemKind[];
}

/**
 * One settlement line, on the way out (FR-7).
 *
 * NOTE WHAT IS ABSENT: `channelType` and `channelName`. The server snapshots
 * both from the channel — labelling a QRIS line "Kas" would move it into the
 * drawer's expected total and make the cashier short by exactly that amount.
 */
export interface PosPaymentInput {
  channelId: string;
  /** What the customer handed over. A string — see PosTotals. */
  amount: string;
  /** Cash only. The server refuses it on any other channel type. */
  change?: string;
  reference?: string;
}

/**
 * Selling on account (FR-7).
 *
 * NOTE WHAT IS ABSENT: the amount. Credit closes whatever the payment lines did
 * not — the server derives it, and a client that could name its own figure could
 * raise a receivable smaller than the shortfall and leave the difference
 * belonging to nobody.
 *
 * A DUE DATE OR A TERM, NEVER BOTH — the server refuses the pair, because two
 * ways of saying the same thing eventually disagree.
 */
export interface CreditTerms {
  /** ISO date. Wins over `termDays`; send one or the other. */
  dueDate?: string;
  /** Days from the sale. Defaults to 30 when neither is given. */
  termDays?: number;
}

/**
 * Body of POST /api/pos/transactions/:id/pay.
 *
 * `payments` MAY BE EMPTY when `credit` is present — a sale settled entirely on
 * account moves no money at all. One of the two must be there.
 */
export interface PayInput {
  payments: PosPaymentInput[];
  credit?: CreditTerms;
}

/**
 * How much a customer may still buy on account (FR-7).
 *
 * `creditLimit` AND `remaining` ARE NULL WHEN THERE IS NO CEILING, which is not
 * the same as zero: "no limit" and "nothing left" are opposite facts, and a till
 * that conflated them would draw a full bar for an unlimited customer.
 */
export interface CustomerCreditStatus {
  customerId: string;
  /** What they owe across every live receivable, right now. */
  outstanding: string;
  invoiceCount: number;
  creditLimit: string | null;
  remaining: string | null;
}

/** One printed line on a receipt. */
export interface PosReceiptItem {
  kind: PosItemKind;
  name: string;
  sku: string | null;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  discount: { resolvedAmount: string } | null;
  /** FR-8's sub-line, denormalised at sale time so a reprint survives a rename. */
  petName: string | null;
  groomerName: string | null;
}

/**
 * What GET /pos/transactions/:id/receipt returns (FR-8).
 *
 * TWO HALVES THAT AGE DIFFERENTLY, deliberately. `header` is the shop as it is
 * TODAY — a shop that moved wants its new address on the reprint a customer
 * walks back in with. `totals` is frozen at settlement, because the tenant's tax
 * rate may have changed and recomputing would rewrite what was charged.
 */
export interface PosReceipt {
  header: {
    tenantName: string;
    branchName: string;
    /** Empty string, never null — an unfilled field prints as a blank line. */
    address: string;
    phone: string;
  };
  transactionNumber: string | null;
  paidAt: string | null;
  status: PosTransactionStatus;
  cashierUserId: string | null;
  customerName: string | null;
  items: PosReceiptItem[];
  otherCharges: PosCharge[];
  totals: PosTotals | null;
  payments: PosPayment[];
  /**
   * What is still owed, and when — on a credit sale only (FR-7).
   *
   * NOT FROZEN, unlike `totals`, and the difference is deliberate: this is the
   * CURRENT state of the debt, so a reprint after an instalment shows what is
   * left rather than what was owed on the day. That is what a customer asking
   * for a reprint wants to know.
   */
  credit: {
    invoiceNumber: string;
    dueDate: string;
    total: string;
    paidAmount: string;
    outstandingAmount: string;
    status: "unpaid" | "partial" | "paid" | "void";
  } | null;
  note: string | null;
}

/** Query for GET /api/pos/transactions — the Void list's source. */
export interface PosTransactionListQuery {
  page?: number;
  limit?: number;
  shiftId?: string;
  branchId?: string;
  customerId?: string;
  status?: PosTransactionStatus | PosTransactionStatus[];
  paidFrom?: string;
  paidTo?: string;
}

/**
 * Body of POST /api/pos/transactions/:id/void.
 *
 * A REASON AND NOTHING ELSE. A void is all or nothing: no item list, because
 * voiding part of a sale is a return; no amount, because the amount is whatever
 * the sale was.
 */
export interface VoidSaleInput {
  reason: string;
}

/**
 * One line coming back (FR-11).
 *
 * `posItemIndex` POINTS AT THE SALE'S LINE rather than naming a product: a
 * basket can hold the same product twice — one line discounted, one not — and a
 * return keyed on the product alone could not say which came back.
 *
 * NOTE WHAT IS ABSENT: `refundAmount`. The server computes it from what was
 * actually paid, so the till cannot refund a shelf price on a discounted sale.
 */
export interface PosReturnItemInput {
  posItemIndex: number;
  qty: string;
  /** Per line — one bag holds an unopened sack and a chewed toy. */
  returnToStock: boolean;
}

/**
 * What is still returnable on a sale.
 *
 * READ FROM THE SERVER, never derived here. The alternative is the browser
 * subtracting earlier returns itself — a second implementation of a money rule,
 * and the browser's copy is the one that drifts.
 */
export interface PosReturnable {
  posTransactionId: string;
  transactionNumber: string | null;
  status: PosTransactionStatus;
  items: {
    posItemIndex: number;
    kind: PosItemKind;
    name: string;
    soldQty: string;
    remainingQty: string;
  }[];
}

/** Body of POST /api/pos/returns. */
export interface CreateReturnInput {
  posTransactionId: string;
  items: PosReturnItemInput[];
  refundMethod: "cash" | "store_credit";
  refundChannelId?: string;
  reason: string;
}

/** A processed return, as the API returns it. */
export interface PosReturn {
  _id: string;
  tenantId: string;
  branchId: string;
  shiftId: string;
  warehouseId: string;
  returnNumber: string;
  posTransactionId: string;
  items: {
    posItemIndex: number;
    kind: PosItemKind;
    refId: string;
    name: string;
    qty: string;
    refundAmount: string;
    returnToStock: boolean;
  }[];
  refundMethod: "cash" | "store_credit";
  refundChannelId: string | null;
  refundTotal: string;
  reason: string;
  approvedBy: string | null;
  journalEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body of POST /api/pos/shifts. `cashierUserId` is NOT accepted. */
export interface OpenShiftInput {
  warehouseId: string;
  openingCash: string;
  branchId?: string;
}

/**
 * Body of POST /api/pos/shifts/:id/close.
 *
 * `expectedCash` and `difference` are NOT accepted — the server computes both.
 * A client-supplied expectation is a variance a client can make disappear.
 */
export interface CloseShiftInput {
  countedCash: string;
  closingNotes?: string | null;
}

/**
 * One line as the till sends it.
 *
 * NO `unitPrice`, `name` or `sku` — the server reads all three from the
 * catalogue, because a price a client can set is a discount a client can grant.
 */
export interface PosItemInput {
  kind: PosItemKind;
  refId: string;
  qty?: string;
  discount?: { mode: PosDiscountMode; value: string; approvedBy?: string } | null;
  bookingId?: string | null;
  petId?: string | null;
  petName?: string | null;
  groomerName?: string | null;
}

/**
 * Body of PATCH /api/pos/transactions/:id.
 *
 * THE WHOLE BASKET IS SENT. A cart discount is measured against the
 * post-item-discount subtotal, so changing one line changes what every other
 * figure means.
 */
export interface UpdateCartInput {
  items?: PosItemInput[];
  cartDiscount?: { mode: PosDiscountMode; value: string; approvedBy?: string } | null;
  otherCharges?: PosCharge[];
  customerId?: string | null;
  note?: string | null;
  heldLabel?: string | null;
  /**
   * Parked, or picked back up (FR-6).
   *
   * ONLY THESE TWO. `paid` and `void` have their own endpoints with irreversible
   * work behind them, and `open` belongs to the Hotel module — the server
   * refuses anything else here.
   */
  status?: "active" | "held";
}

/** Where a booking stands. Mirrors BOOKING_STATUSES in booking.model.js. */
export type BookingStatus =
  | "draft"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

/**
 * How the booking came to exist.
 *
 * `pos_adhoc` is a walk-in who bought a service at the till with no appointment —
 * the POS creates one to hang the attribution on. A field rather than an
 * inference from `posTransactionId`, because a booked appointment paid at the
 * till also ends up with one.
 */
export type BookingOrigin = "booking" | "pos_adhoc";

/**
 * One service on a booking.
 *
 * `name` and `price` are a SNAPSHOT taken when the booking was made — a booking
 * is a quote. Reading the price through `serviceId` at payment time would
 * silently reprice every outstanding booking the moment the catalogue changed.
 *
 * `price` is a decimal STRING, never a number.
 */
export interface BookingItem {
  serviceId: string;
  name: string;
  price: string;
  /** null = FR-3's "Belum ditentukan". Assignment is a scheduling question. */
  groomerUserId: string | null;
  /**
   * The groomer's name, RESOLVED ON READ by the server.
   *
   * NEVER NULL, and that is the point: an unassigned groomer comes back as
   * "Belum ditentukan" (FR-3's edge case), decided once on the server rather
   * than three times — in the bridge, the cart line and the receipt — where the
   * three would eventually disagree about what an empty slot is called.
   */
  groomerName: string;
}

/**
 * A booking, as returned by GET /api/bookings. One animal, one day, one or more
 * services.
 *
 * ONE BOOKING IS ONE PET. FR-3 groups POS cart lines by booking and labels each
 * group with the animal's name, so a booking covering two pets would produce a
 * group that cannot be labelled.
 */
export interface Booking {
  _id: string;
  tenantId: string;
  branchId: string;
  bookingNumber: string;
  customerId: string;
  petId: string;
  /**
   * The animal's name, RESOLVED ON READ — never snapshotted onto the booking.
   *
   * A pet renamed between the appointment and the counter appears under its new
   * name, because this is a LABEL rather than a record of what was agreed. (The
   * price on `items[]` is the opposite and IS frozen: a booking is a quote.)
   *
   * Null only when the reference is genuinely broken — a pet deleted outright.
   * Inventing a name for that would hide it.
   */
  petName: string | null;
  /**
   * The owner's name, RESOLVED ON READ — same rule as `petName`.
   *
   * A booking list is read as a day sheet ("whose dog is at ten"), and an id
   * there is a row nobody can act on.
   */
  customerName: string | null;
  items: BookingItem[];
  scheduledAt: string;
  status: BookingStatus;
  origin: BookingOrigin;
  /** Set by the POS when this booking is paid for. */
  posTransactionId: string | null;
  /** When its services were dropped into a POS cart. Cleared on cancel. */
  pulledToCartAt: string | null;
  notes: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Query parameters accepted by GET /api/bookings. All optional. */
export interface BookingListQuery {
  page?: number;
  limit?: number;
  customerId?: string;
  petId?: string;
  branchId?: string;
  /** One status or several — a day sheet usually wants more than one. */
  status?: BookingStatus | BookingStatus[];
  origin?: BookingOrigin;
  /** Calendar dates; the server expands them in the tenant's timezone. */
  scheduledFrom?: string;
  scheduledTo?: string;
  /** Only bookings not already sitting in a POS cart. */
  notPulled?: boolean;
}

/**
 * Body of POST /api/bookings.
 *
 * An item carries NO PRICE: it is read from the catalogue and snapshotted by the
 * server, because a price a client can set is a discount a client can grant.
 *
 * `branchId` is optional — the server falls back to the session's current branch.
 */
export interface CreateBookingInput {
  customerId: string;
  petId: string;
  items: { serviceId: string; groomerUserId?: string | null }[];
  scheduledAt: string;
  branchId?: string;
  status?: BookingStatus;
  origin?: BookingOrigin;
  notes?: string | null;
}

/**
 * Body of PATCH /api/bookings/:id.
 *
 * `status` IS DELIBERATELY ABSENT — it moves through its own route, because a
 * transition has rules a `$set` cannot express.
 */
export interface UpdateBookingInput {
  customerId?: string;
  petId?: string;
  items?: { serviceId: string; groomerUserId?: string | null }[];
  scheduledAt?: string;
  branchId?: string;
  notes?: string | null;
}

/**
 * The four kinds of real money movement a POS sale can settle through. Mirrors
 * CHANNEL_TYPES in paymentChannel.model.js.
 *
 * `piutang` is absent on purpose although the POS shows it as a fifth tab: it is
 * a route to AR rather than a place money arrived, so it has no channel row.
 */
/**
 * `giro` ARRIVED WITH THE PURCHASING SIDE. It had no meaning at a till — nobody
 * hands a shop a post-dated cheque — but it is one of four ways a shop settles a
 * supplier invoice, so it is a channel type that only moves money OUT.
 */
export type PaymentChannelType =
  | "cash"
  | "transfer"
  | "qris"
  | "edc"
  | "giro";

/** Which way money moves through a channel. */
export type ChannelDirection = "in" | "out";

/**
 * A payment channel, as returned by GET /api/payment-channels. One named place
 * money can arrive — "BCA — 8730123456" — and the account it debits.
 *
 * `branchId: null` is the TENANT-WIDE scope, not "unset". A branch's channel
 * list returns its own channels plus every tenant-wide one.
 */
export interface PaymentChannel {
  _id: string;
  tenantId: string;
  type: PaymentChannelType;
  name: string;
  /** The COA account a payment through this channel debits. Always an asset. */
  accountId: string;
  /** Only meaningful for qris/edc; the API refuses a rate on the other two. */
  mdrPercent: number;
  /**
   * Which directions this channel may be used in.
   *
   * A NARROWING, not a grant: it defaults to everything the TYPE structurally
   * allows, so a channel that never mentions it behaves the way its type
   * implies. What it buys is the case the type cannot express — a tenant with
   * two bank accounts who receives into one and pays out of the other.
   */
  usableFor: ChannelDirection[];
  /** null = every branch. */
  branchId: string | null;
  requiresReference: boolean;
  sortOrder: number;
  isActive: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Query parameters accepted by GET /api/payment-channels. All optional. */
export interface PaymentChannelListQuery {
  page?: number;
  limit?: number;
  type?: PaymentChannelType;
  /** Returns this branch's channels AND the tenant-wide ones. */
  branchId?: string;
  isActive?: boolean;
  search?: string;
  includeDeleted?: boolean;
  /**
   * `out` is what the supplier payment picker asks for.
   *
   * Matches a channel that DECLARES the direction, and also one that declares
   * nothing but is a type implying it — every channel written before the field
   * existed is the second kind, and a stricter filter would hide all of them.
   */
  usableFor?: ChannelDirection;
}

/** Body of POST /api/payment-channels. */
export interface CreatePaymentChannelInput {
  type: PaymentChannelType;
  name: string;
  accountId: string;
  branchId?: string | null;
  mdrPercent?: number;
  requiresReference?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * Body of PATCH /api/payment-channels/:id — every field optional, but the
 * backend rejects an empty body.
 *
 * `type` IS editable; it moves the channel to another tab and re-scopes its name
 * uniqueness, which the server checks against the destination type.
 */
export interface UpdatePaymentChannelInput {
  type?: PaymentChannelType;
  name?: string;
  accountId?: string;
  branchId?: string | null;
  mdrPercent?: number;
  requiresReference?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

/**
 * A service, as returned by GET /api/services. Something a tenant sells the
 * DOING of — grooming, penitipan, vaksinasi.
 *
 * NOT a `Product` with a flag. A service owns no stock, posts no HPP line, and
 * credits a different revenue account; the two are separate collections and
 * separate permission features. The POS searches them together, which is a query
 * over both rather than a reason to share a type.
 *
 * `price` is a STRING, never a number — the API returns and accepts the decimal
 * as written, because JSON.parse("199999.99") is already not 199999.99.
 */
export interface Service {
  _id: string;
  tenantId: string;
  name: string;
  /** Optional quick-entry code, uppercased, unique per tenant when present. */
  code: string | null;
  businessLineId: string;
  categoryId: string | null;
  /** Decimal as a string, e.g. "150000.0000". */
  price: string;
  durationMin: number | null;
  description: string | null;
  taxExempt: boolean;
  /** Still offered at the till. Orthogonal to `deletedAt`. */
  isActive: boolean;
  /** Soft-delete marker; non-null means deleted (restorable), null means live. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Query parameters accepted by GET /api/services. All optional. */
export interface ServiceListQuery {
  page?: number;
  limit?: number;
  /** "Every grooming service" — the POS pill and the booking form. */
  businessLineId?: string;
  categoryId?: string;
  isActive?: boolean;
  /** Free-text over name / code. */
  search?: string;
  includeDeleted?: boolean;
}

/**
 * Body of POST /api/services. `name`, `businessLineId` and `price` are required;
 * `tenantId` and `createdBy` come from the session.
 *
 * `price` MUST be sent as a string. A numeric one is a 400 — see the Service
 * type.
 */
export interface CreateServiceInput {
  name: string;
  businessLineId: string;
  price: string;
  code?: string | null;
  categoryId?: string | null;
  durationMin?: number | null;
  description?: string | null;
  taxExempt?: boolean;
  isActive?: boolean;
}

/**
 * Body of PATCH /api/services/:id — every field optional, but the backend
 * rejects an empty body.
 *
 * `businessLineId` IS here, unlike `UpdatePetInput`'s missing `customerId`:
 * moving a service between lines re-tags nothing historical, because journal
 * lines carry the id they were posted with.
 */
export interface UpdateServiceInput {
  name?: string;
  businessLineId?: string;
  price?: string;
  code?: string | null;
  categoryId?: string | null;
  durationMin?: number | null;
  description?: string | null;
  taxExempt?: boolean;
  isActive?: boolean;
}

/**
 * The animal species a pet may be. Mirrors PET_SPECIES in pet.model.js — a
 * closed list, because it decides which services and prices a booking may offer.
 */
export type PetSpecies =
  | "dog"
  | "cat"
  | "bird"
  | "rabbit"
  | "hamster"
  | "reptile"
  | "fish"
  | "other";

/**
 * `unknown` is a REAL value, not a missing one: a rescue arrives unsexed and
 * "nobody has checked yet" is the honest answer. Mirrors PET_SEXES.
 */
export type PetSex = "male" | "female" | "unknown";

/**
 * A pet, as returned by GET /api/pets. An animal one of the tenant's customers
 * brings in.
 *
 * TWO LIFECYCLE AXES, unlike Customer's one. `isActive: false` means the animal
 * is no longer in the tenant's care — it passed away, or was rehomed — while its
 * history stays true. `deletedAt` means the record should never have existed: a
 * duplicate, a typo saved twice. Conflating them would force a shop to delete a
 * dead pet to stop it appearing in a booking dropdown, taking its grooming
 * history with it.
 *
 * `customerId` is set at creation and never changed — see UpdatePetInput.
 */
export interface Pet {
  _id: string;
  tenantId: string;
  customerId: string;
  name: string;
  species: PetSpecies;
  sex: PetSex;
  breed: string | null;
  /** ISO date. The birth date, never an age — an age is wrong the day after it is written. */
  birthDate: string | null;
  weightKg: number | null;
  color: string | null;
  microchipNo: string | null;
  notes: string | null;
  photo: MediaAsset | null;
  /** Still in the tenant's care. See the two-axes note above. */
  isActive: boolean;
  /** Soft-delete marker; non-null means deleted (restorable), null means live. */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Query parameters accepted by GET /api/pets. All optional. */
export interface PetListQuery {
  page?: number;
  limit?: number;
  /** The filter this endpoint exists for — one customer's animals. */
  customerId?: string;
  species?: PetSpecies;
  /** `true` for a booking picker, which wants only pets still in the tenant's care. */
  isActive?: boolean;
  /** Free-text over name / breed. */
  search?: string;
  /** Include soft-deleted pets (default false on the backend). */
  includeDeleted?: boolean;
}

/**
 * Body of POST /api/pets. `customerId`, `name` and `species` are required;
 * `tenantId` and `createdBy` are derived from the session, never sent from here.
 * `sex` defaults to "unknown" on the server when omitted.
 */
export interface CreatePetInput {
  customerId: string;
  name: string;
  species: PetSpecies;
  sex?: PetSex;
  breed?: string | null;
  birthDate?: string | null;
  weightKg?: number | null;
  color?: string | null;
  microchipNo?: string | null;
  notes?: string | null;
  photo?: MediaAsset | null;
  isActive?: boolean;
}

/**
 * Body of PATCH /api/pets/:id — every field optional, but the backend rejects an
 * empty body (send only what changed, at least one field).
 *
 * `customerId` IS DELIBERATELY ABSENT. Reassigning an animal to another owner
 * would silently move its bookings, invoices and grooming history under a
 * different name; the API strips the key. A rehomed pet is registered again under
 * the new owner and the old record retired with `isActive: false`.
 */
export interface UpdatePetInput {
  name?: string;
  species?: PetSpecies;
  sex?: PetSex;
  breed?: string | null;
  birthDate?: string | null;
  weightKg?: number | null;
  color?: string | null;
  microchipNo?: string | null;
  notes?: string | null;
  photo?: MediaAsset | null;
  isActive?: boolean;
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
 * The vendor's LEGAL FORM — "tipe pemasok" on the form, and a different axis
 * from `SupplierType` above, which is easy to conflate because both are read
 * aloud as "tipe supplier":
 *
 *   SupplierType       — the COOPERATION model. What arriving goods do to the
 *                        ledger (beli_putus / konsinyasi / both).
 *   SupplierEntityType — WHO the vendor is. A registered company or a private
 *                        individual.
 *
 * They vary independently, so neither predicts the other. `null` on a supplier
 * means "not recorded", which is what every vendor registered before the field
 * existed genuinely is — the backend does NOT default it to "perusahaan", and
 * neither should a screen.
 */
export type SupplierEntityType = "perusahaan" | "perorangan";

/**
 * A supplier category as it comes back ATTACHED to a supplier — the id stays
 * where it was and this arrives beside it.
 *
 * NOT `SupplierCategory` with fields omitted: the attachment is a label, so the
 * API sends only what a label needs. A screen wanting `isActive` fetches the
 * category itself.
 */
export interface SupplierCategoryRef {
  _id: string;
  name: string;
}

/**
 * A vendor's postal address — "Alamat Pembayaran", where an invoice and a
 * payment advice go.
 *
 * AN OBJECT, not the single free-text line it replaced, because of what the
 * parts are FOR: a shipping integration needs the postcode alone and a tax
 * report groups by province, and neither can be recovered from
 * "Jl. Rungkut Industri 21, Surabaya" without guessing.
 *
 * EVERY PART IS NULLABLE, including `street` — a vendor known only by its city
 * is a real record. `country` has no default; "Indonesia" would be an assertion
 * nobody made.
 */
export interface SupplierAddress {
  street: string | null;
  city: string | null;
  postalCode: string | null;
  province: string | null;
  country: string | null;
}

/**
 * The contact person AT the supplier — "Penanggung jawab".
 *
 * An object rather than four flat keys: `name` and `phone` are read as a pair on
 * every screen that chases a short delivery, and grouping them makes "is a PIC
 * recorded at all" one question instead of four.
 *
 * A PLAIN NAME, NEVER A PawCRM USER — this person works for the vendor.
 * `phone` is stored in E.164 like every other number on a supplier.
 */
export interface SupplierPic {
  name: string | null;
  email: string | null;
  address: string | null;
  phone: string | null;
}

/**
 * One of the vendor's bank accounts — where a payment to them is actually sent.
 *
 * `_id` IS PRESENT AND STABLE, unlike the two objects above: these are
 * addressable ROWS. A form edits and removes individual lines, and identifying
 * one by its position in the array breaks the moment somebody reorders it.
 *
 * NOT NORMALIZED THE WAY A PHONE NUMBER IS. The bank's own formatting IS the
 * form — "123 4567 890" is how it is printed on a statement — and rewriting it
 * is how a transfer goes to the wrong place. Render it exactly as stored.
 */
export interface SupplierBankAccount {
  _id: string;
  accountNumber: string;
  accountHolder: string;
  bankName: string;
}

/**
 * A bank-account row as SENT to the API — no `_id`, because the server owns it.
 *
 * The whole list is replaced on every save (see `UpdateSupplierInput`), so a row
 * the client just added and one it is keeping look identical on the wire.
 */
export interface SupplierBankAccountInput {
  accountNumber: string;
  accountHolder: string;
  bankName: string;
}

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
 *
 * EVERY FIELD ADDED AFTER LAUNCH IS OPTIONAL FOR THE SAME REASON, and it is not
 * defensive typing — it is what the API actually returns. Mongoose applies a
 * path default when a DOCUMENT IS WRITTEN, not when one is read, and these reads
 * are `.lean()`: a supplier stored before `code` and `whatsapp` existed comes
 * back with no such keys at all. Typing them as required would promise a `null`
 * the server never sends, and the first `supplier.code.trim()` on an old vendor
 * would throw.
 *
 * So `?? null` / `?? false` at the point of use, exactly as `isSupplierActive`
 * does. The one field that is genuinely computed per read — `category` — follows
 * the same rule so a caller holding a supplier from an older cached response is
 * not forced to fabricate it.
 */
export interface Supplier {
  _id: string;
  tenantId: string;
  name: string;
  /**
   * The tenant's OWN code for the vendor — "ID Supplier" on the form.
   *
   * CLIENT-SUPPLIED, not generated: it is usually the account number the vendor
   * already appears under in whatever the tenant is migrating off. Unique per
   * tenant when present, uppercased by the server, and `null` for the many
   * suppliers nobody ever coded.
   */
  code?: string | null;
  /**
   * Which supplier category this vendor is filed under, or `null` when
   * ungrouped. Points at a `categories` document with `kind: "supplier"` — the
   * API refuses a product category's id with a 400.
   */
  categoryId?: string | null;
  /**
   * The resolved label for `categoryId`, attached by the API so a list does not
   * make one request per row.
   *
   * `null` FOR AN UNGROUPED SUPPLIER, and also for the rare grouped one whose
   * category was deleted out from under it — read `categoryId` to tell those
   * two apart.
   */
  category?: SupplierCategoryRef | null;
  /** The vendor's legal form. `null` means not recorded — see the type. */
  entityType?: SupplierEntityType | null;
  /**
   * Whether purchases from this vendor go on account (credit) rather than being
   * paid at the counter — "akun hutang" on the form.
   *
   * RECORDED, NOT DERIVED. It cannot be read off `type` (a consignment vendor
   * still has a payable, born at the point of sale) nor off `paymentTermDays`
   * (0 is both a cash vendor and an on-account vendor with COD terms).
   */
  /**
   * WHERE THIS VENDOR'S DEBT LANDS IN THE LEDGER — the two posting overrides.
   *
   * `payableAccountId` is the LIABILITY account their debt is credited to; null
   * means the seeded 2101. `advanceAccountId` is the ASSET account a prepayment
   * to them sits in.
   *
   * THESE ARE POSTED AGAINST, not decorative: a goods receipt credits the first,
   * a purchase return debits it, and an invoice payment debits it. All three
   * read the same field, because a debt created in one account and settled in
   * another never nets to zero.
   */
  payableAccountId?: string | null;
  advanceAccountId?: string | null;
  /**
   * WHICH BRANCHES may choose this vendor — "Dipakai di cabang".
   *
   * `allBranches: true` is not sugar for "every id listed": it keeps meaning
   * every branch as new ones open. When it is true `branchIds` is `[]`, and the
   * API enforces that pairing, so there is exactly one representation of "all".
   *
   * DEFAULTS TO TRUE, unlike the equivalent on a user, because the risk points
   * the other way: a user accidentally granted every branch is an escalation,
   * while a supplier scoped to none has silently vanished from every purchasing
   * screen. Absent means true, for the suppliers stored before the field.
   */
  allBranches?: boolean;
  branchIds?: string[];
  /** Where a payment to this vendor is sent. Empty when none is recorded. */
  bankAccounts?: SupplierBankAccount[];
  /**
   * The contact person AT the vendor. Always present as an OBJECT — the API
   * defaults it to four nulls rather than to null, so `supplier.pic.name` never
   * throws on a vendor nobody has filled in.
   */
  pic: SupplierPic;
  /**
   * The business line — "No telp bisnis". STORED IN E.164 ("+6281234567890")
   * from the day the normalizer shipped; suppliers registered before it still
   * hold whatever was typed ("031-8877-221"), so render it, never parse it.
   * Applies equally to `whatsapp`, `fax` and `picPhone`.
   */
  phone: string | null;
  /**
   * The WhatsApp line — a separate number from `phone` rather than a flag on
   * it, because the landline on the invoice is routinely not the sales rep's
   * handset.
   */
  whatsapp?: string | null;
  fax?: string | null;
  /** Always stored WITH a scheme, so it is safe to use as an href directly. */
  website?: string | null;
  email: string | null;
  /**
   * The billing address. Always present as an object, for the reason `pic` is —
   * `supplier.address.city` must not throw on a vendor with no address.
   */
  address: SupplierAddress;
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
  /**
   * Narrow to one supplier category. An id, not a name — a label is renamed
   * from its own screen and a filter keyed on the old spelling would quietly
   * return nothing. Omit for every category.
   */
  categoryId?: string;
  /** Free-text over name / code / pic / phone / npwp. */
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
  /**
   * REQUIRED, both of them, and this is the one breaking change in the shape.
   *
   * `code` is unique per tenant and the server uppercases it (may 409).
   * `paymentTermDays` is demanded rather than defaulted for the reason `type`
   * is: 0 is a real, deliberate term (cash on delivery) AND what an unanswered
   * field would silently become, so the client has to say which it means.
   */
  code: string;
  paymentTermDays: number;
  /** Must name a `kind: "supplier"` category, or the API answers 400. */
  categoryId?: string | null;
  entityType?: SupplierEntityType | null;
  /**
   * Posting overrides. Each must be a LIVE account of this tenant and of the
   * right type — liability for the payable, asset for the advance — or the API
   * answers 400 naming the field.
   */
  payableAccountId?: string | null;
  advanceAccountId?: string | null;
  /**
   * Send both halves together. `allBranches: true` with a non-empty `branchIds`
   * is accepted but the ids are DROPPED; `allBranches: false` with an empty list
   * is a 400, because a supplier available in no branch has silently vanished
   * from every purchasing screen.
   */
  allBranches?: boolean;
  branchIds?: string[];
  /** The WHOLE list — sending it replaces what is stored. */
  bankAccounts?: SupplierBankAccountInput[];
  /**
   * Every part optional; `null` for the whole object clears it. A partial PIC is
   * a real record — somebody who knows only a name has recorded something
   * useful.
   */
  pic?: Partial<SupplierPic> | null;
  /**
   * Phone-shaped fields are NORMALIZED SERVER-SIDE to E.164, so any of
   * "0812-3456-7890", "+62 812 3456 7890" or "62812 3456 7890" may be sent and
   * all three come back as "+6281234567890". Send what the user typed; do not
   * pre-format. A value the server cannot read is a 400 naming the field.
   */
  phone?: string | null;
  whatsapp?: string | null;
  fax?: string | null;
  /** The scheme is optional — the server prepends `https://` when it is absent. */
  website?: string | null;
  email?: string | null;
  /**
   * Every part optional; `null` for the whole object clears it. A partial patch
   * MERGES, exactly as `pic` does.
   */
  address?: Partial<SupplierAddress> | null;
  npwp?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

/**
 * Body of PATCH /api/suppliers/:id — every field optional, but the backend
 * rejects an empty body (send only what changed). A nullable field set to
 * `null`/"" clears it; `type`, `paymentTermDays`, `isActive` and `allBranches`
 * refuse null, since each always has a meaningful value. `entityType`,
 * `categoryId` and the two account overrides DO take null — each is genuinely
 * unknown or deliberately unset. `code` takes neither: see below.
 */
export interface UpdateSupplierInput {
  name?: string;
  type?: SupplierType;
  /**
   * NOT NULLABLE, unlike every other optional string here. It is required on
   * create, and a field that cannot be omitted on the way in must not be
   * clearable on the way back — otherwise "required" would only hold for
   * suppliers nobody has edited since. OMITTING it is still fine, which is what
   * keeps a supplier stored before `code` existed editable at all.
   */
  code?: string;
  categoryId?: string | null;
  entityType?: SupplierEntityType | null;
  payableAccountId?: string | null;
  advanceAccountId?: string | null;
  allBranches?: boolean;
  branchIds?: string[];
  bankAccounts?: SupplierBankAccountInput[];
  /**
   * A PARTIAL PATCH MERGES INTO THE STORED OBJECT — the server flattens it to
   * dot paths, so `{ pic: { name: "x" } }` changes the name and leaves the
   * email, address and phone alone. `null` for the whole object clears every
   * part.
   */
  pic?: Partial<SupplierPic> | null;
  phone?: string | null;
  whatsapp?: string | null;
  fax?: string | null;
  website?: string | null;
  email?: string | null;
  /**
   * Every part optional; `null` for the whole object clears it. A partial patch
   * MERGES, exactly as `pic` does.
   */
  address?: Partial<SupplierAddress> | null;
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
  /**
   * WHICH BOOKS this delivery was posted against — the warehouse's default
   * branch, or the session's when the warehouse serves every branch.
   *
   * NOT A SYNONYM FOR `warehouseId`. A branch may receive at its own warehouse
   * AND at the shared central one, so "what did this shop buy" spans warehouses
   * rather than naming one. Frozen when the delivery posted, so a warehouse
   * moved between branches since does not restate a closed period — the journal
   * entry and the purchase invoice hold the same value for the same reason.
   *
   * Server-resolved, never sent: a client that could name it could post a
   * delivery into another branch's books.
   */
  branchId: string;
  /**
   * The branch's name, resolved by the server over the page's DISTINCT branch
   * ids — most tenants receive into one or two, so a page of twenty deliveries
   * is a one-id lookup rather than twenty.
   *
   * NULL IS A REAL ANSWER: a delivery written before `branchId` existed carries
   * neither until the backfill has run, and a branch closed since is still named
   * (a delivery posted there did happen). A label may be null; the id it labels
   * may not.
   */
  branchName: string | null;
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
  /**
   * WHICH BOOKS, and not a synonym for `warehouseId`: a branch may receive at
   * its own warehouse AND at the shared central one, so "what did this shop buy
   * in March" spans warehouses rather than naming one. The two narrow along
   * different axes and combine.
   */
  branchId?: string;
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
  /** WHICH BOOKS — see `GoodsReceiptListRow.branchId`. Server-resolved. */
  branchId: string;
  /** The branch's name — see `GoodsReceiptListRow.branchName`. May be null. */
  branchName: string | null;
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
  /**
   * THEIR code — the batch number printed on the carton. Optional, always.
   *
   * There is no `batchCode` here and sending one is a 400: the lot's own code
   * is generated by the server and unique across the tenant, because a code a
   * client could choose is a code two lots could end up sharing — and a scanned
   * label has to name one lot.
   */
  supplierBatchCode?: string;
  /** Required when the product `hasExpiry`, and on every `konsinyasi` line. */
  expiryDate?: string;
  /**
   * The lot ALREADY ON THE SHELF that these goods join — the second van
   * carrying the batch the first one brought.
   *
   * MUTUALLY EXCLUSIVE with `supplierBatchCode` and `expiryDate`, and the API
   * refuses the pair rather than preferring one: those two DESCRIBE a lot,
   * which mints it, where this NAMES one, which adds to it. Sent together, one
   * physical batch would end up as two rows with two expiry dates to keep in
   * step — and retagging an existing lot would rewrite the recall trail of the
   * delivery that opened it.
   *
   * The lot must hold this product at this receipt's warehouse; the server
   * checks and names the offending code if not.
   */
  batchId?: string;
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
  /**
   * THE SUPPLIER'S BILL, when it came with the goods.
   *
   * OPTIONAL, and the two real cases are why: the faktur is in the clerk's hand
   * while they unload — the ordinary one, and the one this turns into a single
   * save — or the van brings only a surat jalan and the bill follows days later.
   * Absent, the delivery posts exactly as it always did and the bill is filed
   * afterwards through POST /purchase-invoices.
   *
   * ABSENT IS NOT "NO DEBT". A `beli_putus` receipt credits `2101 Utang
   * Supplier` when it posts, invoice or no invoice; what this adds is the
   * vendor's paperwork on top of the payable — their number, and a due date.
   *
   * FORBIDDEN on `konsinyasi`, refused rather than ignored — nothing has been
   * bought, so there is no debt for a bill to document.
   *
   * THE AMOUNTS ARE NOT HERE. `subtotal` and `taxAmount` must equal the
   * receipt's to the minor unit, so the server takes them from the delivery
   * itself; what is left is what a person can only read off the vendor's paper.
   */
  invoice?: {
    /** The VENDOR'S own number, from their document. Unique per vendor. */
    invoiceNumber: string;
    /** Defaults to `receiptDate`. What the payment terms are counted from. */
    invoiceDate?: string;
    notes?: string;
  };
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
  /**
   * WHOSE BOOKS this bill posts to — the receiving warehouse's default branch,
   * or the session's when that warehouse serves every branch. Frozen when the
   * invoice was filed, so moving a warehouse between branches later cannot
   * restate a closed period.
   */
  branchId: string;
  /** The branch's name, resolved server-side. Null if it was hard-deleted. */
  branchName: string | null;
  goodsReceiptId: string;
  /**
   * WHERE THE GOODS LANDED — copied from the delivery when the bill was filed,
   * so the list can be FILTERED by it: an index cannot span two collections.
   * The copy cannot drift, because a posted goods receipt is immutable.
   *
   * NOT A SYNONYM FOR `branchId`. A branch may receive at its own warehouse AND
   * at the shared central one, so neither filter can be derived from the other.
   *
   * NULL ON A BILL FILED BEFORE THE FIELD EXISTED and not yet backfilled — such
   * a bill matches no warehouse filter at all. See
   * `src/seeds/backfillInvoiceWarehouses.js` in the backend.
   */
  warehouseId: string | null;
  /** The warehouse's name. Null if it was hard-deleted, or the id is null. */
  warehouseName: string | null;
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
  /**
   * WHERE THE GOODS LANDED. Combines with `branchId` rather than being implied
   * by it — the shared central warehouse serves every branch, so neither can be
   * derived from the other.
   */
  warehouseId?: string;
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
  /**
   * What KIND of payment this is — what a reconciler filters by.
   *
   * Distinct from `channelId`, which says which ACCOUNT it left. The server
   * checks the two agree: recording a cash payment under `transfer` would make
   * that filter lie.
   */
  method: PaymentMethod;
  /**
   * The account the money leaves from — a `paymentChannels` row.
   *
   * REQUIRED. The account used to be derived from `method` alone, so a tenant
   * with three bank accounts paid every supplier from one "1102 Bank" line and
   * the ledger could not say which — while the selling side, which has named
   * channels, answered exactly that.
   */
  channelId: string;
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
  /** OURS — what the label on the carton in the storeroom reads. */
  batchCode: string | null;
  /** THEIRS — what the supplier's own paperwork calls these goods. */
  supplierBatchCode: string | null;
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
