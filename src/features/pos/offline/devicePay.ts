/**
 * PAYING ONLINE FROM A REGISTERED TILL (POS offline mode, 19 October 2026).
 *
 * The device numbers the sale itself — "POS-BRT-K1-261019-0007" — and sends
 * the number with the payment, beside its own id for the sale. The pair is
 * RESERVED PER BASKET until the server answers: a payment that timed out is
 * sent again with the same pair, so a repeat finds the sale it already made,
 * and finishing it offline instead keeps the same pair too.
 *
 * A device that is not registered (or not yet holding a snapshot) pays the old
 * way and the server numbers the sale from the branch's counter.
 */
import { ApiError } from "@/services/api-error";
import { deviceHeaders } from "@/services/posOffline.service";
import { posService } from "@/services/pos.service";
import type { PayInput, PosTransaction } from "@/types/api";

import { newClientTxnId } from "./ids";
import { nextNumber } from "./numbering";
import { getOfflineState, serverNow } from "./store";

export interface Reservation {
  transactionNumber: string;
  clientTxnId: string;
}

const reserved = new Map<string, Reservation>();

/** The pair this basket will be paid under, or null when the device cannot number. */
export async function reserveFor(cartId: string): Promise<Reservation | null> {
  const { device, deviceRejected, snapshot } = getOfflineState();
  if (!device || deviceRejected || !snapshot.settings) return null;

  const held = reserved.get(cartId);
  if (held) return held;

  const numbering = snapshot.settings.numbering;
  const { number } = await nextNumber(
    { series: numbering.series, branchCode: numbering.branchCode, deviceCode: numbering.deviceCode },
    serverNow(),
  );
  const reservation = { transactionNumber: number, clientTxnId: newClientTxnId() };
  reserved.set(cartId, reservation);
  return reservation;
}

export function reservationOf(cartId: string): Reservation | null {
  return reserved.get(cartId) ?? null;
}

export function releaseReservation(cartId: string): void {
  reserved.delete(cartId);
}

function numberTaken(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    /transactionNumber/i.test(`${error.message} ${error.reason ?? ""}`)
  );
}

export async function payOnline(cart: PosTransaction, input: PayInput): Promise<PosTransaction> {
  const { device } = getOfflineState();
  let reservation = await reserveFor(cart._id);

  if (!reservation || !device) return posService.pay(cart._id, input);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const sale = await posService.pay(
        cart._id,
        { ...input, ...reservation },
        { headers: deviceHeaders(device) },
      );
      releaseReservation(cart._id);
      return sale;
    } catch (error) {
      /*
        THE NUMBER IS ALREADY ON ANOTHER SALE — a counter this device lost
        (cleared storage) restarting below what the server holds. Draw the next
        one once and try again; anything else is the caller's to show.
      */
      if (attempt === 0 && numberTaken(error)) {
        releaseReservation(cart._id);
        reservation = (await reserveFor(cart._id)) as Reservation;
        continue;
      }
      throw error;
    }
  }
  throw new ApiError("Pembayaran gagal", 500);
}
