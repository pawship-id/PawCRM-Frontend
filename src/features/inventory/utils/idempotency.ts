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
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  // 8 characters minimum on the API; this yields ~26.
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
