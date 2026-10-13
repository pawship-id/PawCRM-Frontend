/**
 * A token that lets a retried save be recognised as the same intent.
 *
 * WHY A STOCK FORM NEEDS ONE. A manual adjustment has no upstream document, so
 * the API cannot tell a request that timed out and was retried from a user
 * adjusting twice on purpose — and stock is the one number where guessing wrong
 * needs a physical count to undo. Sending the same key twice makes the second
 * request return the first one's rows instead of writing again.
 *
 * THE LIFETIME IS THE INTENT, not the request. A form mints one when it opens,
 * keeps it across a failed attempt — that is the whole point — and mints a fresh
 * one only after a save succeeds.
 *
 * `crypto.randomUUID` needs a secure context, which localhost and https both
 * are. The fallback is not a security control: nothing here is a secret, the key
 * only has to be unlikely to collide with the same tenant's other in-flight
 * intents, and a jsdom or an old browser losing the retry guard is better than
 * losing the form.
 */
import { ApiError } from "@/services/api-error";

/**
 * What a form that sends a key says when its save did not answer.
 *
 * A TIMEOUT IS NOT A FAILURE: the server may still be posting. For a form that
 * sends a key it is also harmless to press the button again — the server
 * returns the document that key already filed, even when the first save is
 * still running (a unique index on the key) — so that is what the message
 * says. Every other refusal is the server's own sentence, shown verbatim.
 */
export function keyedSaveFailureMessage(
  error: unknown,
  submitLabel: string,
): string {
  if (error instanceof ApiError && error.isTimeout) {
    return `Server belum menjawab. Tekan ${submitLabel} lagi — yang sama tidak akan tercatat dua kali.`;
  }

  return error instanceof ApiError
    ? error.fullMessage
    : "Terjadi kesalahan. Coba lagi.";
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  // 8 characters minimum on the API; this yields ~26.
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
