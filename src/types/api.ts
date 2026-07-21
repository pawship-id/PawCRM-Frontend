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
