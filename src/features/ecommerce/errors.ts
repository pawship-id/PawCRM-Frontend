import { ApiError } from "@/services/api-error";

/**
 * What a failed act on these screens says, as a toast (ui-rules §9). The same
 * shape as `membershipFailure`: one field problem is quoted whole, several are
 * counted, and the server's reason rides after its headline. The server's
 * strings for this module are Indonesian where they are born.
 */
export function ecommerceFailure(
  error: unknown,
  fallback: string,
): { toast: string; fieldErrors: Record<string, string> } {
  if (!(error instanceof ApiError)) return { toast: fallback, fieldErrors: {} };

  if (error.isNetworkError) {
    return {
      toast: "Tidak bisa menghubungi server. Cek koneksinya, lalu coba lagi.",
      fieldErrors: {},
    };
  }

  const fieldErrors = error.fieldErrors;
  const messages = Object.values(fieldErrors);

  if (messages.length > 1) {
    return {
      toast: `Ada ${messages.length} isian yang belum benar — lihat tanda merah di formulir.`,
      fieldErrors,
    };
  }

  const headline = error.message === "Validation failed" ? messages[0] ?? fallback : error.message;
  const detail = error.reason ?? (messages.length === 1 && messages[0] !== headline ? messages[0] : null);

  return { toast: detail ? `${headline} — ${detail}` : headline, fieldErrors };
}
