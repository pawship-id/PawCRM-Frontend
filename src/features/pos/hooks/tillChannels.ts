import { paymentChannelService } from "@/services/paymentChannel.service";
import type { PaymentChannel } from "@/types/api";

/** The API's page cap — asking for more is a 400. */
const FETCH_LIMIT = 100;

/**
 * The channels a till can TAKE money through, per branch — fetched once when
 * the till opens instead of every time the payment dialog does (18 Oct 2026).
 *
 * WHY: "Memuat metode bayar…" sat on screen for every sale. The list barely
 * ever changes, yet each dialog paid a full round trip to the API before the
 * cashier could tap anything. Now the dialog draws from here at once and
 * refreshes quietly behind it, so a channel added mid-shift still appears on
 * the next sale.
 *
 * MODULE-LEVEL, not React state, so the prefetch made by the till screen and
 * the read made by the dialog share one result without threading it through
 * props.
 */
const cache = new Map<string, PaymentChannel[]>();
const inFlight = new Map<string, Promise<PaymentChannel[]>>();

/** Fetches (or joins the fetch already running) and stores the result. */
export function loadTillChannels(branchId: string): Promise<PaymentChannel[]> {
  const running = inFlight.get(branchId);
  if (running) return running;

  const request = paymentChannelService
    /*
      `usableFor: "in"` — the till only offers channels money can ARRIVE
      through. Without it, a bank account a tenant marked pay-out-only would
      still appear here, and the narrowing would work in one direction only.

      A channel that declares nothing still matches, by its type: every channel
      written before the field existed is that kind.
    */
    .list({ isActive: true, usableFor: "in", branchId, limit: FETCH_LIMIT })
    .then((result) => {
      cache.set(branchId, result.items);
      return result.items;
    })
    .finally(() => inFlight.delete(branchId));

  inFlight.set(branchId, request);
  return request;
}

/** What the last fetch returned for this branch, or null if none has finished. */
export function cachedTillChannels(branchId: string): PaymentChannel[] | null {
  return cache.get(branchId) ?? null;
}

/** Warms the cache without anyone waiting on it; a failure is retried by the dialog. */
export function prefetchTillChannels(branchId: string | null | undefined): void {
  if (!branchId || cache.has(branchId)) return;
  loadTillChannels(branchId).catch(() => {});
}
