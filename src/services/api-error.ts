import type { ValidationDetail } from "@/types/api";

/**
 * Every failure from the API layer surfaces as this one type — HTTP errors,
 * network failures, and unparseable responses alike.
 *
 * Callers therefore need a single catch branch instead of separately
 * handling a thrown TypeError from fetch, a non-2xx status, and a malformed
 * body.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly details?: ValidationDetail[];
  /**
   * The backend's explanation of a refusal, when it sent one — see
   * ApiFailure.reason. Kept separate from `message` rather than concatenated at
   * construction, so a caller can style the two differently; `fullMessage`
   * joins them for the common case.
   */
  readonly reason?: string;
  /** True when the request never reached the server (offline, DNS, CORS). */
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    status: number,
    options: {
      details?: ValidationDetail[];
      reason?: string;
      isNetworkError?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = options.details;
    this.reason = options.reason;
    this.isNetworkError = options.isNetworkError ?? false;
  }

  /** The request never reached the server. */
  static network(message = "Unable to reach the server"): ApiError {
    return new ApiError(message, 0, { isNetworkError: true });
  }

  /** Credentials are missing or expired — callers should redirect to login. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Input was rejected — callers can map details onto form fields. */
  get isValidationError(): boolean {
    return this.status === 400 && Array.isArray(this.details);
  }

  /**
   * The message plus the backend's reason, for the single-string slots (an
   * Alert, a dialog's error line). Falls back to the message when no reason was
   * sent, so every call site can use this and never has to test for one.
   */
  get fullMessage(): string {
    return this.reason ? `${this.message} — ${this.reason}` : this.message;
  }

  /**
   * Field name -> message, for binding validation errors to form inputs.
   * The backend prefixes paths with the request part ("body.email"), which
   * is stripped here so it matches the form field name.
   */
  get fieldErrors(): Record<string, string> {
    if (!this.details) return {};

    return this.details.reduce<Record<string, string>>((acc, detail) => {
      const field = detail.field.replace(/^(body|params|query)\./, "");
      acc[field] = detail.message;
      return acc;
    }, {});
  }
}
