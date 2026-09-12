import type {
  CashTransaction,
  CashTransactionListResponse,
  PaymentChannel,
} from "@/types/api";

/**
 * One cash transaction as GET /cash-transactions/:id returns it — a receipt of
 * Rp 150.000 into the cash drawer against INV/CBS/2609/0012. Override what a
 * case is about; the rest stays a believable, changeable transaction.
 */
export const cashTx = (
  overrides: Partial<CashTransaction> = {},
): CashTransaction => ({
  _id: "ct1",
  number: "BKM/CBS/2609/0001",
  direction: "in",
  kind: "customer_payment",
  recordedVia: "backoffice",
  status: "posted",
  isVoided: false,
  branchId: "b1",
  branchName: "Cabang Pusat",
  at: "2026-09-10T03:00:00.000Z",
  amount: "150000.0000",
  mdrAmount: "0.0000",
  netAmount: "150000.0000",
  tenderedAmount: null,
  changeAmount: null,
  channelId: "ch-cash",
  channelType: "cash",
  channelName: "Kas Laci",
  method: "cash",
  ref: null,
  note: null,
  document: {
    type: "customer_invoice",
    id: "inv1",
    number: "INV/CBS/2609/0012",
  },
  party: { type: "customer", id: "c1", name: "Bu Sari" },
  commission: null,
  lines: null,
  posTransactionId: null,
  shiftId: null,
  journalEntryId: "je1",
  journalEntryNumber: "JE-2026-09-0001",
  voidedAt: null,
  voidedBy: null,
  voidedByName: null,
  voidReason: null,
  reversalJournalEntryId: null,
  reversalJournalEntryNumber: null,
  revisions: [],
  legacy: false,
  createdBy: "u1",
  createdByName: "Rani",
  createdAt: "2026-09-10T03:00:00.000Z",
  updatedAt: "2026-09-10T03:00:00.000Z",
  ...overrides,
});

export const cashPage = (
  items: CashTransaction[],
  totals: CashTransactionListResponse["totals"] = {
    in: { amount: "0.0000", count: 0 },
    out: { amount: "0.0000", count: 0 },
  },
): CashTransactionListResponse => ({
  items,
  pagination: {
    page: 1,
    limit: 20,
    total: items.length,
    totalPages: items.length > 0 ? 1 : 0,
  },
  totals,
});

export const channel = (
  overrides: Partial<PaymentChannel> & Pick<PaymentChannel, "_id" | "name" | "type">,
): PaymentChannel => ({
  tenantId: "t1",
  accountId: "acc-channel",
  mdrPercent: 0,
  usableFor: ["in", "out"],
  branchId: null,
  requiresReference: false,
  sortOrder: 0,
  isActive: true,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

export const channelPage = (items: PaymentChannel[]) => ({
  items,
  pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
});
