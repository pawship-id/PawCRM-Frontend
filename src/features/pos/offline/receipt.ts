/**
 * THE SLIP FOR A SALE RUNG UP OFFLINE (POS offline mode, 19 October 2026),
 * built on the device in the server's `PosReceipt` shape so `ReceiptPreview`
 * prints it exactly like any other. The QR carries the token the device minted,
 * so the link works as soon as the sale has synced.
 */
import type { PosItem, PosReceipt, PosReceiptItem, PosTotals } from "@/types/api";
import { toDecimalString, toMinor } from "@/utils/decimal";

import type { QueuedSale } from "./queue";
import { getOfflineState } from "./store";

function line(item: PosItem): PosReceiptItem {
  return {
    kind: item.kind,
    name: item.name,
    sku: item.sku,
    qty: item.qty,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    discount: item.discount ? { resolvedAmount: item.discount.resolvedAmount } : null,
    membershipDiscount: null,
    petName: item.petName,
    groomerName: item.groomerName,
    variantChoices: (item.variantChoices ?? []).map(({ name, label }) => ({ name, label })),
    zone: null,
    addons: [],
  };
}

/** posReceipt.service `#nestAddons`: an add-on prints under its main line. */
function nest(items: PosItem[]): PosReceiptItem[] {
  const printed = items.map(line);
  const byPetService = new Map(
    items.map((item, index) => [`${item.petId ?? ""}|${item.refId}`, printed[index]]),
  );
  return printed.filter((row, index) => {
    const item = items[index];
    if (!item.parentServiceId) return true;
    const parent = byPetService.get(`${item.petId ?? ""}|${item.parentServiceId}`);
    if (!parent || parent === row) return true;
    parent.addons.push(row);
    return false;
  });
}

export function receiptOf(record: QueuedSale): PosReceipt {
  const { priced, sale } = record;
  const header = getOfflineState().snapshot.settings?.receiptHeader ?? {
    tenantName: "",
    branchName: "",
    address: "",
    phone: "",
    receiptFooter: "Terima kasih",
  };

  const running = priced.runningTotals;
  const payable = toMinor(running.payable ?? running.net) ?? 0n;
  const tax = toMinor(running.tax ?? "0") ?? 0n;
  const totals: PosTotals = {
    subtotal: running.subtotal,
    itemDiscount: running.itemDiscount,
    cartDiscount: running.cartDiscount,
    otherCharges: running.otherCharges,
    dpp: toDecimalString(payable - tax),
    tax: toDecimalString(tax),
    grandTotal: toDecimalString(payable),
    credit: "0.0000",
  };

  return {
    header,
    transactionNumber: sale.transactionNumber,
    receiptToken: sale.receiptToken,
    paidAt: sale.paidAt,
    status: "paid",
    cashierUserId: sale.cashierUserId,
    cashierName: sale.cashierName ?? null,
    customerName: priced.customer?.name ?? null,
    items: nest(priced.items),
    otherCharges: priced.otherCharges,
    totals,
    payments: priced.payments,
    credit: null,
    note: priced.note,
  };
}
