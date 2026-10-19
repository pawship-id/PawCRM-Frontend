/**
 * WHERE A CART WRITE GOES (POS offline mode, 19 October 2026).
 *
 * `usePosCart` builds every change as one payload — the whole basket — and
 * hands it to a transport. Online that is the server, exactly as before.
 * Offline it is this file: the payload is applied to a basket kept on the
 * device and priced by `pricing.ts`, and what comes back is shaped like the
 * server's answer, so nothing that draws a cart can tell the two apart.
 *
 * A SERVER BASKET IS ADOPTED, not lost, when the connection drops mid-sale: the
 * next write copies its lines into a local basket that remembers where it came
 * from (`replacesCartId`), and the sync throws the server copy away once the
 * sale is posted.
 *
 * Paying offline numbers the sale, puts it in the queue and returns a sale the
 * receipt can be printed from straight away.
 */
import { posService } from "@/services/pos.service";
import type { PayInput, PosTransaction, UpdateCartInput } from "@/types/api";
import type { OfflineSaleInput } from "@/types/posOffline";

import { cartItemsAsInput } from "../hooks/cartInput";
import { kvGet, kvSet } from "./idb";
import { isLocalId, newClientTxnId, newLocalCartId, newReceiptToken } from "./ids";
import { nextNumber } from "./numbering";
import { offlineRefusal, priceCart, type LocalCart } from "./pricing";
import { enqueue } from "./queue";
import { getOfflineState, serverNow } from "./store";

export interface CartTransport {
  createCart: () => Promise<PosTransaction>;
  updateCart: (target: PosTransaction, patch: UpdateCartInput) => Promise<PosTransaction>;
}

/** The server — what the till has always done. */
export const onlineTransport: CartTransport = {
  createCart: () => posService.createCart({}),
  updateCart: (target, patch) => posService.updateCart(target._id, patch),
};

export interface OfflineTillContext {
  tenantId: string;
  userId: string;
  userName: string | null;
  maySetPrice: boolean;
}

/* ─────────────────────────── local baskets ─────────────────────────── */

const cartsKey = (tenantId: string, userId: string) => `carts:${tenantId}:${userId}`;

async function readCarts(context: OfflineTillContext): Promise<LocalCart[]> {
  return (await kvGet<LocalCart[]>(cartsKey(context.tenantId, context.userId))) ?? [];
}

async function writeCarts(context: OfflineTillContext, carts: LocalCart[]): Promise<void> {
  await kvSet(cartsKey(context.tenantId, context.userId), carts);
}

function pricingOf(context: OfflineTillContext) {
  return { snapshot: getOfflineState().snapshot, maySetPrice: context.maySetPrice };
}

function shiftOrRefuse() {
  const { shift, snapshot } = getOfflineState();
  const warehouseId = shift?.warehouseId ?? snapshot.settings?.shift?.warehouseId;
  if (!shift || !warehouseId) {
    throw offlineRefusal("Shift kasir belum terbaca — buka kasir sekali saat online");
  }
  return { shift, warehouseId };
}

/** A server basket, re-expressed as a local one that remembers it. */
function adopt(target: PosTransaction, context: OfflineTillContext): LocalCart {
  const { shift, warehouseId } = shiftOrRefuse();
  const now = new Date().toISOString();
  return {
    _id: newLocalCartId(),
    branchId: shift.branchId,
    warehouseId,
    shiftId: shift._id,
    customerId: target.customerId ?? null,
    items: cartItemsAsInput(target),
    cartDiscount: target.cartDiscount
      ? { mode: target.cartDiscount.mode, value: target.cartDiscount.value }
      : null,
    otherCharges: target.otherCharges ?? [],
    note: target.note ?? null,
    status: "active",
    heldLabel: target.heldLabel ?? null,
    createdBy: context.userId,
    createdAt: now,
    updatedAt: now,
    replacesCartId: isLocalId(target._id) ? null : target._id,
  };
}

function applyPatch(cart: LocalCart, patch: UpdateCartInput): LocalCart {
  if (patch.syncOnline === true) {
    throw offlineRefusal("Sync Online butuh koneksi internet — tunggu sampai kasir online lagi.");
  }
  return {
    ...cart,
    ...(patch.items !== undefined ? { items: patch.items } : {}),
    ...(patch.cartDiscount !== undefined
      ? {
          cartDiscount: patch.cartDiscount
            ? { mode: patch.cartDiscount.mode, value: patch.cartDiscount.value }
            : null,
        }
      : {}),
    ...(patch.otherCharges !== undefined ? { otherCharges: patch.otherCharges } : {}),
    ...(patch.note !== undefined ? { note: patch.note } : {}),
    ...(patch.customerId !== undefined ? { customerId: patch.customerId } : {}),
    ...(patch.heldLabel !== undefined ? { heldLabel: patch.heldLabel } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export function offlineTransport(context: OfflineTillContext): CartTransport & {
  listHeld: () => Promise<PosTransaction[]>;
  findActive: () => Promise<PosTransaction | null>;
  discard: (id: string) => Promise<void>;
  pay: (
    cart: PosTransaction,
    input: PayInput,
    preassigned?: { transactionNumber: string; clientTxnId: string } | null,
  ) => Promise<PosTransaction>;
  canAdopt: (cart: PosTransaction) => boolean;
} {
  return {
    async createCart() {
      const { shift, warehouseId } = shiftOrRefuse();
      const now = new Date().toISOString();
      const cart: LocalCart = {
        _id: newLocalCartId(),
        branchId: shift.branchId,
        warehouseId,
        shiftId: shift._id,
        customerId: null,
        items: [],
        cartDiscount: null,
        otherCharges: [],
        note: null,
        status: "active",
        heldLabel: null,
        createdBy: context.userId,
        createdAt: now,
        updatedAt: now,
        replacesCartId: null,
      };
      // Not stored until it holds something: an empty basket is not worth a row.
      return priceCart(cart, pricingOf(context));
    },

    async updateCart(target, patch) {
      const carts = await readCarts(context);
      const stored = carts.find((cart) => cart._id === target._id);
      const base =
        stored ??
        (isLocalId(target._id)
          ? { ...adopt(target, context), _id: target._id, replacesCartId: null }
          : adopt(target, context));

      const next = applyPatch(base, patch);
      // Priced BEFORE it is stored: a refused write changes nothing.
      const priced = priceCart(next, pricingOf(context));

      const rest = carts.filter((cart) => cart._id !== next._id);
      await writeCarts(context, next.items.length > 0 || next.status === "held" ? [...rest, next] : rest);
      return priced;
    },

    async listHeld() {
      const carts = await readCarts(context);
      return carts
        .filter((cart) => cart.status === "held")
        .flatMap((cart) => {
          try {
            return [priceCart(cart, pricingOf(context))];
          } catch {
            return [];
          }
        });
    },

    async findActive() {
      const carts = await readCarts(context);
      const active = carts
        .filter((cart) => cart.status === "active" && cart.items.length > 0)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (!active) return null;
      try {
        return priceCart(active, pricingOf(context));
      } catch {
        return null;
      }
    },

    async discard(id) {
      const carts = await readCarts(context);
      await writeCarts(context, carts.filter((cart) => cart._id !== id));
    },

    canAdopt(target) {
      try {
        priceCart(adopt(target, context), pricingOf(context));
        return true;
      } catch {
        return false;
      }
    },

    async pay(target, input, preassigned = null) {
      const state = getOfflineState();
      const { device, snapshot } = state;
      if (!device || !snapshot.settings) {
        throw offlineRefusal("Perangkat ini belum siap untuk transaksi offline");
      }
      if (input.credit) throw offlineRefusal("Piutang butuh koneksi internet");

      const carts = await readCarts(context);
      const local =
        carts.find((cart) => cart._id === target._id) ??
        (isLocalId(target._id)
          ? { ...adopt(target, context), _id: target._id, replacesCartId: null }
          : adopt(target, context));
      const priced = priceCart(local, pricingOf(context));

      const payable = priced.runningTotals.payable ?? priced.runningTotals.net;
      const paidAt = serverNow();
      const numbering = snapshot.settings.numbering;
      /*
        A NUMBER ALREADY RESERVED for this basket — an online payment whose
        answer never came — is kept, with its sale id: if the server did take
        that payment, the sync finds it by the id and posts nothing twice.
      */
      const number =
        preassigned?.transactionNumber ??
        (
          await nextNumber(
            { series: numbering.series, branchCode: numbering.branchCode, deviceCode: numbering.deviceCode },
            paidAt,
          )
        ).number;

      const clientTxnId = preassigned?.clientTxnId ?? newClientTxnId();
      const receiptToken = newReceiptToken();
      const channels = new Map(snapshot.settings.channels.map((channel) => [channel._id, channel]));

      const sale: OfflineSaleInput = {
        clientTxnId,
        transactionNumber: number,
        receiptToken,
        shiftId: local.shiftId,
        cashierUserId: context.userId,
        cashierName: context.userName,
        paidAt: paidAt.toISOString(),
        customerId: local.customerId,
        note: local.note,
        items: local.items,
        cartDiscount: local.cartDiscount,
        otherCharges: local.otherCharges,
        payments: input.payments,
        totals: { grandTotal: payable },
        replacesCartId: local.replacesCartId,
      };

      const paymentNames = input.payments.map((payment) => {
        const channel = channels.get(payment.channelId);
        return { channelType: channel?.type ?? "cash", channelName: channel?.name ?? "Pembayaran" };
      });

      const paid: PosTransaction = {
        ...priced,
        _id: clientTxnId,
        transactionNumber: number,
        status: "paid",
        paidAt: paidAt.toISOString(),
        payments: input.payments.map((payment, index) => ({
          channelId: payment.channelId,
          channelType: paymentNames[index].channelType as PosTransaction["payments"][number]["channelType"],
          channelName: paymentNames[index].channelName,
          amount: payment.amount,
          change: payment.change ?? null,
          reference: payment.reference ?? null,
        })),
      };

      await enqueue({
        clientTxnId,
        tenantId: context.tenantId,
        deviceId: device.deviceId,
        sale,
        priced: paid,
        paymentNames,
        status: "pending",
        attempts: 0,
        createdAt: new Date().toISOString(),
        lastAttemptAt: null,
        syncedAt: null,
        posTransactionId: null,
        reasons: [],
        flags: [],
        message: null,
      });

      await writeCarts(context, carts.filter((cart) => cart._id !== local._id));
      return paid;
    },
  };
}
