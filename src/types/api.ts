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
