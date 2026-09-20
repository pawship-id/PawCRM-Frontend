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

/**
 * Where the LIST lives — the Kas & Bank tab, whose first sub-tab it is.
 *
 * IT MOVED UNDER KAS & BANK on 16 September 2026, with the mockup: Transaksi
 * stopped being a tab of its own and became the first of two sub-tabs there,
 * under the cards and the channel table that say where the money sits. The old
 * `/dashboard/keuangan/transaksi` redirects here.
 */
export const CASH_TRANSACTIONS_HREF = "/dashboard/keuangan/kas-bank";

/**
 * Where a single transaction lives — a level deeper than the list.
 *
 * SEPARATE FROM THE LIST'S HREF, which they used to share. The list is a sub-tab
 * of a page that also carries a channel table and its own `new`/`[id]` routes,
 * so a transaction cannot hang directly off it: `/kas-bank/9f2…` is a CHANNEL.
 */
export const CASH_TRANSACTION_DETAIL_HREF =
  "/dashboard/keuangan/kas-bank/transaksi";

export function cashTransactionHref(id: string): string {
  return `${CASH_TRANSACTION_DETAIL_HREF}/${id}`;
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

/**
 * SUMBER — what produced the transaction, as the Kas & Bank table's last column
 * names it (BO mockup, `buloo-keuangan-v1.html`).
 *
 * NOT A SECOND SPELLING OF `KIND_LABEL`. Jenis answers "what kind of money is
 * this" from the books' point of view — penerimaan piutang, pembayaran komisi.
 * Sumber answers "where did this row come from", which is what somebody
 * scanning a cash book for the thing they typed last Tuesday is actually asking:
 * Manual is the one they can still edit, and every other value names a document
 * elsewhere in the app that owns it.
 *
 * The mockup also lists "Transfer", for money moved between two of the shop's
 * own accounts. THERE IS NO SUCH TRANSACTION in this system — nothing creates
 * one — so it is not in this map. Add it here when the feature exists, not
 * before: a filter option that can never match anything is a filter people stop
 * trusting.
 */
export const SOURCE_LABEL: Record<CashTransactionKind, string> = {
  expense: "Manual",
  other_income: "Manual",
  customer_payment: "Pembayaran",
  supplier_payment: "Pembelian",
  commission_payment: "Komisi",
  pos_refund: "Retur",
};

export function sourceLabel(kind: CashTransactionKind): string {
  return SOURCE_LABEL[kind] ?? kindLabel(kind);
}

/**
 * WHAT A TRANSACTION IS CALLED AT THE TOP OF ITS OWN PAGE — "Uang keluar", the
 * same two words the toggle on the form and the cards above the list use.
 *
 * Not `KIND_LABEL`: a heading answers "what am I looking at" before it answers
 * "how is it filed", and every one of the six kinds is one of these two.
 */
export const DIRECTION_TITLE: Record<CashTransactionDirection, string> = {
  in: "Uang masuk",
  out: "Uang keluar",
};

export function directionTitle(
  transaction: Pick<CashTransaction, "direction" | "number" | "kind" | "amount">,
): string {
  const name = DIRECTION_TITLE[transaction.direction];
  return transaction.number
    ? `${name} – ${transaction.number}`
    : `${name} – ${cashTransactionTitle(transaction)}`;
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

/**
 * The series prefix a transaction draws, from the kas/bank class itself.
 *
 * TWO THINGS DECIDE THAT CLASS and they are asked in different places: a till
 * payment reads it off its CHANNEL's type, and a back-office transaction off the
 * ACCOUNT's own `cashType` (20 September 2026, when Transaksi Keuangan stopped
 * going through a channel). Both land here, so the two paths cannot come to
 * disagree about what a BKM is.
 */
export function numberPrefixForClass(
  direction: CashTransactionDirection,
  ledgerClass: ChannelClass,
): string {
  const cash = ledgerClass === "cash";
  if (direction === "in") return cash ? "BKM" : "BBM";
  return cash ? "BKK" : "BBK";
}

/** The prefix a payment through this CHANNEL will draw. */
export function numberPrefix(
  direction: CashTransactionDirection,
  type: PaymentChannelType | null | undefined,
): string {
  return numberPrefixForClass(direction, channelClassOf(type));
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
