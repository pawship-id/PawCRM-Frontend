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
   * The message plus whatever the backend said about WHY, for the single-string
   * slots (an Alert, a dialog's error line). Falls back to the message alone
   * when it sent neither, so every call site can use this and never has to test
   * for one.
   *
   * A VALIDATION FAILURE SAYS NOTHING ON ITS OWN. The backend answers a rejected
   * schema with the bare string "Validation failed" and puts what to fix in
   * `details` — so an Alert showing `message` renders a red box that reports a
   * refusal and withholds the reason, which is worse than useless: it tells
   * somebody to go looking without saying where. That happened on the stock
   * adjustment form, where a date rule refused today's date for seven hours a
   * day and the screen said only "Validation failed".
   *
   * The field names are the API's, not the form's, and they are English. That is
   * a real cost and it is still the better trade: the reader can act on
   * "entryDate cannot be in the future" and cannot act on "Validation failed".
   * A form that wants better wording for a specific field has `fieldErrors`.
   */
  get fullMessage(): string {
    if (this.reason) return `${this.message} — ${this.reason}`;

    const detail = Object.entries(this.fieldErrors)
      .map(([field, message]) => `${field} ${message}`)
      .join("; ");

    return detail === "" ? this.message : `${this.message} — ${detail}`;
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
