/**
 * THINGS THAT MUST NOT BE LEFT BEHIND BY SIGNING OUT (POS offline mode).
 *
 * A till holding sales it has not sent yet must not be signed out: the sales
 * belong to this cashier and only this cashier's session may send them. Any
 * module can register a check; the sign-out button asks them all first. Each
 * answers with the sentence to show, or null when there is nothing to lose.
 */
type Guard = () => Promise<string | null>;

const guards = new Set<Guard>();

export function registerSignOutGuard(guard: Guard): () => void {
  guards.add(guard);
  return () => guards.delete(guard);
}

export async function signOutBlockedReason(): Promise<string | null> {
  for (const guard of guards) {
    try {
      const reason = await guard();
      if (reason) return reason;
    } catch {
      // A guard that cannot answer does not block.
    }
  }
  return null;
}
