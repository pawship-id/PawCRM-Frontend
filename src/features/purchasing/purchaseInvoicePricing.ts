import {
  divideRound,
  multiplyDecimals,
  subtractDecimals,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";
import type {
  GoodsReceiptDetail,
  InvoiceDiscountMode,
  PurchaseChargeAllocation,
} from "@/types/api";

/**
 * What a manual purchase invoice comes to while it is being typed — the same
 * order the server prices it in (16 October 2026, BO): each line's own
 * discount against `qty × price`, the bill's discount against what the lines
 * come to after theirs, then the "biaya lain" on top.
 *
 * ONLY `goods` CHARGES ARE IN THE SUBTOTAL (16 October 2026, BO). An `expense`
 * charge goes to a beban account instead of HPP, so it is added AFTER PPN:
 * `total = subtotal + PPN + expenseCharges`, as the server sums it.
 *
 * FOR DISPLAY ONLY. The server is the authority: it also folds the bill's
 * discount and the charges into each line's unit cost (HPP), rounding per
 * unit, so its saved subtotal can differ from this one by a fraction of a
 * rupiah. Nothing is sent from here.
 */

/** 100 at the decimal scale — a percentage's denominator. */
const HUNDRED_MINOR = toMinor("100") as bigint;

export interface PricingDiscount {
  mode: InvoiceDiscountMode;
  value: string;
}

/** A discount against `basis`, as the server resolves it: capped, never negative. */
function resolve(basis: bigint, discount: PricingDiscount): bigint {
  const value = toMinor(discount.value.trim() || "0") ?? 0n;
  if (value <= 0n || basis <= 0n) return 0n;
  const resolved =
    discount.mode === "percent"
      ? divideRound(basis * value, HUNDRED_MINOR)
      : value;
  return resolved > basis ? basis : resolved;
}

export interface PricingLine {
  qty: string;
  price: string;
  discount: PricingDiscount;
}

export interface PricingCharge {
  amount: string;
  allocation: PurchaseChargeAllocation;
}

export interface PurchaseInvoicePricing {
  /** Per line: `qty × price`, its discount, and what is left. */
  lines: { gross: string; discount: string; net: string }[];
  grossSubtotal: string;
  itemDiscount: string;
  invoiceDiscount: string;
  /** Σ `goods` charges — split over the lines, in the subtotal. */
  charges: string;
  /** Σ `expense` charges — after PPN, never in the subtotal. */
  expenseCharges: string;
  /** What the bill comes to before PPN. */
  subtotal: string;
  /** `subtotal + taxAmount + expenseCharges` — Total tagihan. */
  total: string;
}

/** A typed amount as minor units, or 0 while it is not a positive number. */
function positiveMinor(value: string): bigint {
  const minor = toMinor(value.trim() || "0") ?? 0n;
  return minor > 0n ? minor : 0n;
}

export function pricePurchaseInvoice(
  lines: PricingLine[],
  invoiceDiscount: PricingDiscount,
  charges: PricingCharge[],
  taxAmount = "0",
): PurchaseInvoicePricing {
  const priced = lines.map((line) => {
    const gross = toMinor(multiplyDecimals(line.qty || "0", line.price || "0")) ?? 0n;
    const discount = resolve(gross, line.discount);
    return { gross, discount, net: gross - discount };
  });

  const sum = (values: bigint[]) => values.reduce((total, value) => total + value, 0n);
  const afterItems = sum(priced.map((line) => line.net));
  const billDiscount = resolve(afterItems, invoiceDiscount);
  const chargesOf = (allocation: PurchaseChargeAllocation) =>
    sum(
      charges
        .filter((charge) => charge.allocation === allocation)
        .map((charge) => positiveMinor(charge.amount)),
    );
  const goodsCharges = chargesOf("goods");
  const expenseCharges = chargesOf("expense");
  const subtotal = afterItems - billDiscount + goodsCharges;

  return {
    lines: priced.map((line) => ({
      gross: toDecimalString(line.gross),
      discount: toDecimalString(line.discount),
      net: toDecimalString(line.net),
    })),
    grossSubtotal: toDecimalString(sum(priced.map((line) => line.gross))),
    itemDiscount: toDecimalString(sum(priced.map((line) => line.discount))),
    invoiceDiscount: toDecimalString(billDiscount),
    charges: toDecimalString(goodsCharges),
    expenseCharges: toDecimalString(expenseCharges),
    subtotal: toDecimalString(subtotal),
    total: toDecimalString(subtotal + positiveMinor(taxAmount) + expenseCharges),
  };
}

/** One product's line on an invoice made from receipts — see `mergeReceiptLines`. */
export interface MergedReceiptLine {
  productId: string;
  /** The lot — the same product in two batches is two lines. Null: no lot. */
  batchId: string | null;
  name: string;
  sku: string | null;
  unit: string | null;
  /** Σ billed qty over every receipt line of the product. */
  qty: string;
  /** Σ billed value — exact, the receipts' own. */
  subtotal: string;
  /** `subtotal ÷ qty`, rounded — an average when the receipts' prices differ. */
  costPerUnit: string;
}

/**
 * WHAT AN INVOICE MADE FROM SEVERAL RECEIPTS WILL CARRY — the server's merge,
 * mirrored for the preview (16 October 2026, BO). One line per product and lot across
 * every receipt, oldest receipt first; each receipt line billed as
 * `#linesFromReceipt` bills it (a line closed short bills only what arrived),
 * and the PPN each receipt bills (a closed one's is what it posted).
 *
 * FOR DISPLAY ONLY, like the pricing above: the server re-reads the receipts
 * and does the merge itself. Nothing computed here is sent.
 */
export function mergeReceiptLines(receipts: GoodsReceiptDetail[]): {
  lines: MergedReceiptLine[];
  subtotal: string;
  taxAmount: string;
} {
  const ordered = [...receipts].sort(
    (a, b) =>
      a.receiptDate.localeCompare(b.receiptDate) || a._id.localeCompare(b._id),
  );
  const ONE = toMinor("1") as bigint;
  const merged = new Map<
    string,
    Omit<MergedReceiptLine, "qty" | "subtotal" | "costPerUnit"> & {
      qty: bigint;
      subtotal: bigint;
    }
  >();
  let subtotal = 0n;
  let tax = 0n;

  for (const receipt of ordered) {
    for (const item of receipt.items) {
      const cancelled = toMinor(item.cancelledQty) ?? 0n;
      const billedQty = cancelled > 0n ? subtractDecimals(item.qty, item.cancelledQty) : item.qty;
      const value =
        (cancelled > 0n
          ? toMinor(multiplyDecimals(billedQty, item.costPerUnit))
          : toMinor(item.subtotal)) ?? 0n;
      // ONE LINE PER PRODUCT AND LOT, as the server merges them.
      const key = `${item.productId}:${item.batchId ?? "-"}`;
      const line = merged.get(key) ?? {
        productId: item.productId,
        batchId: item.batchId ?? null,
        name: item.productName ?? item.name,
        sku: item.productSku,
        unit: item.productUnit,
        qty: 0n,
        subtotal: 0n,
      };
      line.qty += toMinor(billedQty) ?? 0n;
      line.subtotal += value;
      merged.set(key, line);
      subtotal += value;
    }
    tax +=
      toMinor(receipt.status === "closed" ? receipt.receivedTax : receipt.taxAmount) ??
      0n;
  }

  return {
    lines: [...merged.values()].map((line) => ({
      ...line,
      qty: toDecimalString(line.qty),
      subtotal: toDecimalString(line.subtotal),
      costPerUnit: toDecimalString(
        line.qty > 0n ? divideRound(line.subtotal * ONE, line.qty) : 0n,
      ),
    })),
    subtotal: toDecimalString(subtotal),
    taxAmount: toDecimalString(tax),
  };
}
