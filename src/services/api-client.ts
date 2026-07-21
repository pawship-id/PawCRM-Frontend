import { env } from "@/utils/env";
import { ApiError } from "./api-error";
import type { ApiResponse } from "@/types/api";

/**
 * The single HTTP entry point to the PawCRM backend.
 *
 * Responsibilities:
 *  - prefix every path with the configured base URL
 *  - unwrap the { success, data } envelope so callers receive T directly
 *  - convert every failure mode into an ApiError
 *
 * Feature modules must call this rather than fetch(), so retry, auth and
 * error handling stay in one place.
 */

export interface RequestOptions extends Omit<RequestInit, "body" | "method"> {
  /** Serialized as JSON unless it is already a FormData/string body. */
  body?: unknown;
  /** Query string parameters; undefined and null entries are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Abort the request after this many milliseconds. Default 15000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${env.apiBaseUrl}${normalizedPath}`;

  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }

  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

/**
 * Reads the response body as the API envelope.
 * A body that is absent or not JSON (a proxy's HTML error page, a 502 from
 * the load balancer) is reported using the HTTP status rather than throwing
 * an opaque parse error.
 */
async function parseBody<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();

  if (!text) {
    throw new ApiError(
      response.ok ? "Empty response from server" : response.statusText,
      response.status,
    );
  }

  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    throw new ApiError(
      `Unexpected non-JSON response from server (HTTP ${response.status})`,
      response.status,
    );
  }
}

async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, query, timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options;

  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  const headers = new Headers(init.headers);
  if (!isFormData && body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  // Bound every request so a hung connection cannot block the UI forever.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...init,
      method,
      headers,
      signal: init.signal ?? controller.signal,
      // Send the auth cookie once authentication lands.
      credentials: init.credentials ?? "include",
      body: isFormData
        ? (body as FormData)
        : body !== undefined
          ? JSON.stringify(body)
          : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(`Request timed out after ${timeoutMs}ms`, 0, {
        isNetworkError: true,
      });
    }
    throw ApiError.network();
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseBody<T>(response);

  if (!response.ok || payload.success === false) {
    const message =
      payload.success === false ? payload.message : response.statusText;
    const details = payload.success === false ? payload.details : undefined;
    throw new ApiError(message || "Request failed", response.status, {
      details,
    });
  }

  return payload.data;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>("GET", path, options),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, { ...options, body }),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PUT", path, { ...options, body }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, { ...options, body }),

  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, options),
};

export { ApiError };
