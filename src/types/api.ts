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
  createdAt: string;
  updatedAt: string;
}

/** The session context returned alongside the user. */
export interface SessionContext {
  currentBranchId: string | null;
  /** Present on login, omitted by /me. */
  expiresAt?: string;
}

/** Payload of POST /api/auth/login. */
export interface LoginPayload {
  user: User;
  session: SessionContext;
}

/** Payload of GET /api/auth/me. */
export interface MePayload {
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

/** Narrows an ApiResponse to its success branch. */
export function isApiSuccess<T>(
  response: ApiResponse<T>,
): response is ApiSuccess<T> {
  return response.success === true;
}
