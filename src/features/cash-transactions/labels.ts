import type {
  CashTransaction,
  CashTransactionDirection,
  CashTransactionDocumentType,
  CashTransactionKind,
  CashTransactionRecordedVia,
  PaymentChannelType,
} from "@/types/api";
import { formatMoney } from "@/utils/decimal";

/**
 * The words the Transaksi Keuangan screens share — one place, so the list, the
 * detail, the form and the invoice's payment page never name one kind two ways.
 */

export const CASH_TRANSACTIONS_HREF = "/dashboard/keuangan/transaksi";

export function cashTransactionHref(id: string): string {
  return `${CASH_TRANSACTIONS_HREF}/${id}`;
}

/** In the order a shop meets them: money coming in, money going out, the rest. */
export const CASH_TRANSACTION_KINDS: CashTransactionKind[] = [
  "customer_payment",
  "other_income",
  "supplier_payment",
  "commission_payment",
  "expense",
  "pos_refund",
];

export const KIND_LABEL: Record<CashTransactionKind, string> = {
  customer_payment: "Penerimaan piutang",
  supplier_payment: "Pembayaran supplier",
  commission_payment: "Pembayaran komisi",
  expense: "Pengeluaran",
  other_income: "Pemasukan lain",
  pos_refund: "Refund retur",
};

/** Falls back to the raw value, so a kind this build does not know still draws. */
export function kindLabel(kind: CashTransactionKind): string {
  return KIND_LABEL[kind] ?? kind;
}

export const DIRECTION_LABEL: Record<CashTransactionDirection, string> = {
  in: "Masuk",
  out: "Keluar",
};

export const RECORDED_VIA_LABEL: Record<CashTransactionRecordedVia, string> = {
  pos: "Kasir",
  backoffice: "Back office",
};

export const DOCUMENT_TYPE_LABEL: Record<CashTransactionDocumentType, string> = {
  customer_invoice: "Faktur penjualan",
  purchase_invoice: "Faktur supplier",
  pos_return: "Retur kasir",
};

/** Where a document opens. A till return has no page of its own yet. */
export function documentHref(
  document: NonNullable<CashTransaction["document"]>,
): string | null {
  if (document.type === "customer_invoice") {
    return `/dashboard/sales/${document.id}`;
  }
  if (document.type === "purchase_invoice") {
    return `/dashboard/purchasing/payables/${document.id}`;
  }
  return null;
}

/** The two kinds a person types — the ones with account lines. */
export function hasLines(
  kind: CashTransactionKind,
): kind is "expense" | "other_income" {
  return kind === "expense" || kind === "other_income";
}

/**
 * What names a transaction: its number, or — for migrated history that never
 * got one — its kind and amount, so a heading is never blank.
 */
export function cashTransactionTitle(
  transaction: Pick<CashTransaction, "number" | "kind" | "amount">,
): string {
  return (
    transaction.number ??
    `${kindLabel(transaction.kind)} ${formatMoney(transaction.amount)}`
  );
}

/**
 * KAS OR BANK — the half of the number an edit may not change.
 *
 * Mirrors `ledgerClassOf` on the server: `cash` is kas, every other type
 * (transfer, QRIS, EDC, giro) is bank. BKM/BKK versus BBM/BBK is decided by
 * this, so moving a payment across it would leave a number that lies.
 */
export type ChannelClass = "cash" | "bank";

export function channelClassOf(
  type: PaymentChannelType | null | undefined,
): ChannelClass {
  return type === "cash" ? "cash" : "bank";
}

/** The series prefix a new transaction will draw — for the form's meta line. */
export function numberPrefix(
  direction: CashTransactionDirection,
  type: PaymentChannelType | null | undefined,
): string {
  const cash = channelClassOf(type) === "cash";
  if (direction === "in") return cash ? "BKM" : "BBM";
  return cash ? "BKK" : "BBK";
}

/**
 * Why a transaction cannot be changed or cancelled, or null when it can.
 *
 * The server's `#assertChangeable`, said in words: a cancelled one is final, a
 * legacy one has no journal of its own to reverse, and a till refund belongs to
 * its return.
 */
export function lockedReason(transaction: CashTransaction): string | null {
  if (transaction.status === "void") return "Transaksi ini sudah dibatalkan.";
  if (transaction.legacy || !transaction.journalEntryId) {
    return "Riwayat hasil migrasi — jurnalnya tidak dibentuk ulang, jadi hanya bisa dibaca.";
  }
  if (transaction.kind === "pos_refund") {
    return "Refund retur diatur dari returnya di kasir.";
  }
  return null;
}

/** "11 Sep 2026" — the local calendar day of an instant. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** "11 Sep 2026 14.05" — for revisions, where two edits can share a day. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatDate(iso)} ${date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** An instant as the `date` input wants it — the LOCAL day, not the UTC one. */
export function toDateInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

/** Today in the browser's timezone, as the `date` input wants it. */
export function todayValue(): string {
  return toDateInputValue(new Date().toISOString());
}
