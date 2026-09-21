/**
 * The Accounting module's contract — the chart of accounts (COA) and the
 * general ledger posted against it.
 *
 * WRITTEN AGAINST THE LIVE API, not against a guess. Every screen in this
 * feature now reads /api/chart-of-accounts and /api/journal-entries, and the
 * three rules Inventory and Purchasing follow hold here too: money is a decimal
 * STRING, ids are strings, and nothing carries a total the server would rather
 * derive.
 *
 * WHAT THE SERVER RESOLVES AND WHAT THIS CLIENT DOES:
 *   - `branchName` and `createdByName` come down on every read. Only the server
 *     can answer them without a client pulling the branch and user lists to
 *     render a table;
 *   - `source.reference` likewise — the number of the document that caused the
 *     entry, and null for the source types whose collection does not exist yet;
 *   - `lines[].accountId` and `lines[].businessLineId` stay as IDS. The chart of
 *     accounts and the business lines are short, cacheable lists this client
 *     already holds to render its own filters, and resolving them here is what
 *     keeps a renamed account renamed everywhere at once.
 *
 * `businessLineId` REPLACED a `businessLine: string` that never existed on the
 * wire. The fixtures carried a name because they were written before anything
 * called the endpoint; the API has always stored an ObjectId.
 */

/**
 * The five account classes of double-entry bookkeeping — fixed, not tenant
 * configurable. Mirrors ACCOUNT_TYPES in the backend model.
 */
export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense";

/**
 * THE FIFTEEN CATEGORIES A TENANT ACTUALLY PICKS FROM — Buloo's own list,
 * modelled on Jubelio's. Mirrors ACCOUNT_CATEGORIES in the backend model.
 *
 * `accountType` above is the vocabulary of the LEDGER; this is the vocabulary of
 * the REPORTS and of the person filling in the form. It is finer — cash, stock
 * and a vehicle are all `asset` and each belongs on its own line of a neraca —
 * and it is the only classification a client may assert. The class is derived
 * from it on the server, which is what stopped "Beban Iklan" from being filed as
 * income.
 */
export type AccountCategory =
  | "cash_bank"
  | "piutang_dagang"
  | "persediaan"
  | "aset_lancar_lainnya"
  | "aset_tetap"
  | "investasi_jangka_panjang"
  | "hutang_dagang"
  | "hutang_lainnya"
  | "hutang_jangka_panjang"
  | "modal"
  | "pendapatan"
  | "hpp"
  | "biaya"
  | "pendapatan_lainnya"
  | "biaya_lainnya";

/**
 * The class each category implies — the same map the backend derives with.
 *
 * MIRRORED RATHER THAN FETCHED, like every other enum in this file: the list is
 * fixed, and an endpoint returning it would be a request on every page load for
 * something that changes when the code does. The form uses it to show what the
 * chosen category means before the account is saved; the server remains the
 * authority on what is stored.
 */
export const CATEGORY_ACCOUNT_TYPE: Record<AccountCategory, AccountType> = {
  cash_bank: "asset",
  piutang_dagang: "asset",
  persediaan: "asset",
  aset_lancar_lainnya: "asset",
  aset_tetap: "asset",
  investasi_jangka_panjang: "asset",
  hutang_dagang: "liability",
  hutang_lainnya: "liability",
  hutang_jangka_panjang: "liability",
  modal: "equity",
  pendapatan: "income",
  pendapatan_lainnya: "income",
  hpp: "expense",
  biaya: "expense",
  biaya_lainnya: "expense",
};

/**
 * THE REFERENCE NUMBER OF EACH CATEGORY — BO's chart, matching Jubelio's.
 * Mirrors CATEGORY_CODE in the backend model.
 *
 * IT IS NOT AN ACCOUNT CODE PREFIX. An account's leading digit names its CLASS
 * (1 asset, 2 liability, 3 equity, 4 income, 5/6 expense) — which is why
 * 1101 Kas, 1201 Persediaan and 1301 PPN Masukan all start with 1 while sitting
 * in three different categories. This numbers the CATEGORY instead, and the two
 * are independent on purpose: a tenant renumbering its own chart must not be
 * able to renumber the report's sections by accident.
 *
 * NOT STORED. `accountCategory` carries the key (`cash_bank`); the number is
 * read from it wherever one is shown, so correcting it later is a code change
 * rather than a migration over every account document.
 *
 * MIRRORED RATHER THAN FETCHED, like CATEGORY_ACCOUNT_TYPE above and for the
 * same reason: the list is fixed, and an endpoint returning it would be a
 * request on every page load for something that changes when the code does.
 */
export const CATEGORY_CODE: Record<AccountCategory, string> = {
  cash_bank: "110",
  piutang_dagang: "111",
  persediaan: "112",
  aset_lancar_lainnya: "113",
  aset_tetap: "120",
  investasi_jangka_panjang: "121",
  hutang_dagang: "220",
  hutang_lainnya: "221",
  hutang_jangka_panjang: "222",
  modal: "330",
  pendapatan: "440",
  hpp: "550",
  biaya: "660",
  pendapatan_lainnya: "770",
  biaya_lainnya: "880",
};

/**
 * Which side increases an account. DERIVED from `accountType`, never stored —
 * assets and expenses grow on the debit side, everything else on the credit
 * side, and that is a property of the class rather than a per-account setting.
 */
export type NormalBalance = "debit" | "credit";

/**
 * THE FIVE CATEGORIES A LABA RUGI IS MADE OF, in the order it is read — mirrors
 * PROFIT_LOSS_CATEGORIES in the backend model.
 *
 * Doubles as the answer to "may this account carry allocation rules", which is
 * the same question: an account that does not appear on the laba rugi has no
 * per-line column to be divided into, and the server refuses rules on one.
 */
export const PROFIT_LOSS_CATEGORIES: readonly AccountCategory[] = [
  "pendapatan",
  "hpp",
  "biaya",
  "pendapatan_lainnya",
  "biaya_lainnya",
];

/** Whether this account's amounts can be mapped to a line at all. */
export function isProfitLossAccount(category: AccountCategory): boolean {
  return PROFIT_LOSS_CATEGORIES.includes(category);
}

/**
 * How one Detil Akun reaches a business line. Mirrors ALLOCATION_TYPES in the
 * backend model.
 *
 *   direct         — one named line. A branch may pin it further; without one it
 *                    is split across every branch running that line, weighted by
 *                    what each earned.
 *   shared_lokasi  — the lines active at the branch the entry was posted in.
 *   shared_overall — the whole company.
 *
 * The two shared kinds only differ for a tenant with more than one branch; with
 * one, they divide the same set and the screen offers a single "Shared". That is
 * a LABEL rule and not a data rule — both values stay storable, so a tenant that
 * opens a second branch keeps what it set.
 */
export type AllocationType = "direct" | "shared_lokasi" | "shared_overall";

/**
 * ONE ALLOCATION RULE — a "Detil Akun" on a Pendapatan or Beban account.
 *
 * `_id` IS WHAT MAKES THE LIST EDITABLE rather than merely replaceable. A save
 * sends the whole array; a rule that goes back carrying the id it was read with
 * is the SAME rule renamed or repointed, and one without an id is new. Drop it
 * and every save mints fresh ids, orphaning the journal lines that name them —
 * which the server then refuses, so this is not a silent mistake, just an
 * unexplainable one.
 */
export interface AccountAllocation {
  /** Absent on a rule the user has just added and not yet saved. */
  _id?: string;
  /** What a person picks from when recording a cost: "Gaji - Grooming Pusat". */
  name: string;
  allocationType: AllocationType;
  /** Required when `direct`, always null otherwise. */
  businessLineId: string | null;
  /** Only on `direct`. Null means every branch that runs the line. */
  branchId: string | null;
  /**
   * Retired rather than removed. A rule journal entries already name cannot be
   * deleted — the entries are immutable and would be left pointing at nothing —
   * so this is what takes it off the pickers while keeping history explicable.
   */
  isActive: boolean;
}

/** One account in the tenant's chart of accounts. */
/** The two kinds of Kas & Bank account. See `ChartOfAccount.cashType`. */
export type CashType = "cash" | "bank";

/** What a Kas & Bank account is, with the pre-`cashType` default. */
export function cashTypeOf(
  account: Pick<ChartOfAccount, "cashType"> | null | undefined,
): CashType {
  return account?.cashType === "cash" ? "cash" : "bank";
}

export interface ChartOfAccount {
  _id: string;
  /** The stable identifier every posting module resolves against ("1201"). */
  code: string;
  name: string;
  /**
   * The bookkeeping class. READ-ONLY from this client's point of view: the
   * server derives it from `accountCategory` and no request body carries it.
   */
  accountType: AccountType;
  /**
   * What the tenant chose, and the only classification a create or update
   * sends. Everything the screens group, filter and colour by.
   */
  accountCategory: AccountCategory;
  /**
   * KAS OR BANK — only on a `cash_bank` account, null on every other.
   *
   * What it decides is the bukti kas series a transaction on the account draws:
   * BKM/BKK for a till, BBM/BBK for a bank account. Added 20 September 2026,
   * when Transaksi Keuangan stopped going through a payment channel and the
   * channel's type stopped being there to read it off. Defaults to `bank` on the
   * server, never guessed from the name.
   */
  cashType?: CashType | null;
  /** Parent in the hierarchy, or null for a root. Max 4 levels deep. */
  parentAccountId: string | null;
  /**
   * HOW THIS ACCOUNT'S AMOUNTS REACH A BUSINESS LINE — its Detil Akun.
   *
   * Replaces a single `businessLineId`, which could say "everything here is
   * grooming's" and nothing else. One account routinely serves several segments
   * at once: Beban Gaji carries groomers belonging to one line outright and
   * admin staff belonging to the company as a whole, and the old shape had to
   * record the second as "no line" — where it fell into the shared bucket of
   * every report and stayed there.
   *
   * EMPTY FOR TWO DIFFERENT REASONS the screen must not blur: an account that is
   * not on the laba rugi can never have rules (check `isProfitLossAccount`
   * first), and one that is has simply not been mapped yet — which reads as
   * "Belum Dipetakan" and is the thing somebody has to act on.
   *
   * OPTIONAL, AND ABSENT IS NOT THE SAME AS EMPTY on the wire: an account
   * written before this field existed and not yet touched by
   * `backfillAccountAllocations` carries no key at all. Every reader spells
   * `allocations ?? []` for that reason — the two cases mean the same thing to a
   * screen, and pretending the field is guaranteed is how a chart that has not
   * been migrated yet throws instead of rendering.
   */
  allocations?: AccountAllocation[];
  /** True for accounts written by the per-tenant seed — undeletable. */
  isDefault: boolean;
  /** Whether the account may be picked for NEW postings. */
  isActive: boolean;
}

/**
 * One node of GET /chart-of-accounts/tree — an account plus the accounts filed
 * under it.
 *
 * A SEPARATE TYPE RATHER THAN `children?` ON ChartOfAccount, because only the
 * tree endpoint nests: the list, the by-code lookup and the single-account read
 * all answer with flat records, and an optional `children` on the shared type
 * would let a caller check for a field three of the four routes never send.
 *
 * `children` is always present on a node, empty for a leaf — the backend builds
 * every node with the array in place.
 */
export interface ChartOfAccountNode extends ChartOfAccount {
  children: ChartOfAccountNode[];
}

/**
 * What caused a ledger entry. Mirrors SOURCE_TYPES in the backend model —
 * `manual` is the only value the HTTP layer can produce; the rest are posted
 * service-to-service by the module that owns the document.
 */
export type JournalSourceType =
  | "pos"
  /**
   * The cost-of-goods half of a POS sale, posted separately from the revenue
   * half. A SECOND SOURCE TYPE RATHER THAN A SECOND ENTRY UNDER `pos`, because
   * the ledger is idempotent on `(source.type, source.id)` — one sale posting
   * two entries under one type would collide with itself, and the second would
   * be silently swallowed as a duplicate.
   */
  | "pos_cogs"
  | "invoice"
  /**
   * The COST side of an issued invoice — `Dr 5101 HPP / Cr 1201 Persediaan`.
   *
   * Separate from `invoice` for the reason `pos_cogs` is separate from `pos`:
   * one invoice posts TWO entries naming the same document, and the ledger is
   * idempotent on `(source.type, source.id)` — one shared type would make the
   * guard reject the invoice's own second half.
   */
  | "invoice_cogs"
  | "receipt"
  | "goods_receipt"
  | "purchase_payment"
  | "opname"
  | "return"
  /**
   * The cost-of-goods half of a SALES return — the goods put back on the shelf,
   * posted separately from the refund. A SECOND SOURCE TYPE for the same reason
   * `pos_cogs` is one: both halves name the same return document, and the ledger
   * is idempotent on `(source.type, source.id)`.
   */
  | "return_cogs"
  /** The monthly commission ACCRUAL, and the reversal of one already accrued. */
  | "commission"
  /**
   * PAYING that commission.
   *
   * A SECOND SOURCE TYPE, and not for taxonomy: this one MOVES CASH and belongs
   * in the operating section of the cash flow statement, while the accrual
   * belongs in no section at all. One type covering both would have to be
   * classified one way, and either choice is wrong half the time.
   */
  | "commission_payment"
  /**
   * An operating expense paid from a channel — a numbered Transaksi Keuangan
   * document (BKK/BBK), not a hand-written manual entry.
   */
  | "expense"
  /** Money in that is not a sale, recorded the same way. */
  | "other_income"
  | "manual";

/**
 * The orderings `GET /api/journal-entries` accepts — JOURNAL_ENTRY_SORTS in the
 * backend model.
 *
 * `newest` / `oldest` key on the TRANSACTION date, the day the money moved, which
 * is the date shown on the row. The number orderings walk the sequence entries
 * were written in instead; the two part company whenever anything is backdated,
 * which is what makes the second axis worth having rather than a second spelling
 * of the first.
 *
 * NOTHING BY AMOUNT, though "terbesar dulu" is a fair question: an entry's total
 * is not a stored field — it is Σdebit over its lines — so there is nothing to
 * index and the server would have to sum the tenant's whole book to order it.
 */
export type JournalEntrySort =
  | "newest"
  | "oldest"
  | "numberDesc"
  | "numberAsc"
  // The column orderings of the Jurnal list (mockup, 21 September 2026).
  | "descriptionAsc"
  | "descriptionDesc"
  | "branchAsc"
  | "branchDesc"
  | "totalDesc"
  | "totalAsc";

/**
 * The document a journal entry can be opened back to — `source.document`.
 *
 * `id` is the DOCUMENT's own, which for a cash transaction is not `source.id`
 * (that is a posting ref that stops matching after an edit).
 */
export interface JournalSourceDocument {
  kind:
    | "goods_receipt"
    | "purchase_return"
    | "pos_return"
    | "stock_opname"
    | "cash_transaction"
    | "customer_invoice";
  id: string;
}

/** Which section of the cash flow statement an entry belongs to, if any. */
export type CashflowType = "operating" | "investing" | "financing";

/** How often a recurring manual entry repeats. */
export type RecurringInterval = "daily" | "weekly" | "monthly" | "yearly";

/**
 * One side of one transaction. Exactly one of debit/credit is non-zero, and
 * neither is ever negative — a negative debit is not how a credit is expressed.
 */
export interface JournalLine {
  accountId: string;
  /**
   * Which line of business this line belongs to, when it is attributable.
   *
   * PER LINE rather than per entry, which is the point: one POS sale can sell a
   * grooming service and a bag of food, and a per-entry field could not
   * attribute the two revenue lines separately. Null for a line that is not
   * attributable — a cash receipt, a tax liability, the rent.
   *
   * Resolved to a name against `GET /business-lines`, the same way `accountId`
   * is resolved against the COA.
   */
  businessLineId: string | null;
  /**
   * Which Detil Akun of `accountId` this line was posted to — the `_id` of one
   * rule in that account's `allocations[]`.
   *
   * NULL IS ORDINARY AND MEANS TWO THINGS, both fine: the account carries no
   * rules to choose from (every asset and liability, and any P&L account still
   * Belum Dipetakan), or the line was attributed directly at posting time and
   * needs none — a POS sale already knows the product's line, and a fact beats a
   * mapping. Every entry written before allocation existed reads as null and
   * reports exactly as it always did.
   *
   * RESOLVED AGAINST THE ACCOUNT'S CURRENT RULES when a name is shown. The entry
   * is immutable and the chart is not, so the rule may since have been renamed —
   * but it cannot have been deleted, because the chart refuses to remove one a
   * live line names.
   */
  allocationId: string | null;
  /** Decimal string. "0" when the amount sits on the other side. */
  debit: string;
  credit: string;
  /** Explains THIS side; the entry's `description` explains the transaction. */
  memo: string | null;
}

/** One balanced transaction in the general ledger. Immutable once posted. */
export interface JournalEntry {
  _id: string;
  /** Server-allocated, unique per tenant: "JE-2026-08-0007". */
  entryNumber: string;
  /** The TRANSACTION date (ISO), not the day the row was written. */
  date: string;
  description: string;
  branchId: string;
  /** Resolved by the server. Null if the branch has been hard-deleted. */
  branchName: string | null;
  source: {
    type: JournalSourceType;
    /** The document that caused it — null for a manual entry. */
    id: string | null;
    /**
     * That document's human-facing number ("RCP-2026-08-0021"), for display.
     *
     * NULL FOR EVERY SOURCE TYPE WHOSE COLLECTION DOES NOT EXIST YET — `pos`,
     * `invoice`, `receipt` and `commission` have no documents to read a number
     * from until those modules land. Null therefore reads as "this entry names
     * no document we can resolve", and a client renders the type it already has.
     */
    reference: string | null;
    /** What a reader can open from this entry, or null. See the type. */
    document: JournalSourceDocument | null;
  };
  lines: JournalLine[];
  /**
   * Σdebit as a decimal string, stored so the list can sort by it. Null on an
   * entry older than the field until the backfill has run.
   */
  total: string | null;
  cashflowType: CashflowType | null;
  tags: string[];
  attachmentUrl: string | null;
  recurring: { enabled: boolean; interval: RecurringInterval | null };
  /** Set once this entry has been reversed — a second reversal is refused. */
  reversedByEntryId: string | null;
  /** Set on the reversal itself: the entry it undoes. */
  reversesEntryId: string | null;
  createdByName: string | null;
  createdAt: string;
}

/** Assets and expenses increase on the debit side; the rest on the credit side. */
export function normalBalanceOf(accountType: AccountType): NormalBalance {
  return accountType === "asset" || accountType === "expense"
    ? "debit"
    : "credit";
}

/** The class a category implies. Mirrors accountTypeForCategory on the server. */
export function accountTypeOf(category: AccountCategory): AccountType {
  return CATEGORY_ACCOUNT_TYPE[category];
}

/* ---------------------------------------------------------------------- *
 * BIAYA TETAP — the costs a shop knows it will meet again.
 * ---------------------------------------------------------------------- */

/** The two kinds a fixed cost can post as — the two a hand-raised one may take. */
export type FixedCostKind = "expense" | "other_income";

/** How often it comes round. The server's `INTERVALS`, same four words. */
export type FixedCostInterval = "daily" | "weekly" | "monthly" | "yearly";

export type FixedCostSort =
  | "dueSoonest"
  | "dueLatest"
  | "newest"
  | "oldest"
  | "amountHighest"
  | "amountLowest"
  | "nameAsc"
  | "nameDesc";

export interface FixedCostLine {
  accountId: string;
  /** Decimal string — see utils/decimal. */
  amount: string;
  businessLineId: string | null;
  allocationId: string | null;
  memo: string | null;
}

/**
 * A TEMPLATE, NOT A TRANSACTION. Nothing here has touched the ledger: it says
 * "this is due every month and it looks like this". Posting one creates a real
 * `CashTransaction`, and THAT is the money.
 */
export interface FixedCost {
  _id: string;
  /** What a person calls it — "Gaji staff". Unique per tenant. */
  name: string;
  kind: FixedCostKind;
  direction: "in" | "out";
  branchId: string;
  branchName: string | null;
  /** The Kas & Bank account the money moves through. */
  accountId: string;
  /** "1102 · Bank BCA", or null when the account no longer resolves. */
  accountName: string | null;
  /**
   * The non-cash side, NAMED — the mockup's "Kategori" column. One is named and
   * several are counted: a column printing the first of three misfiles the rest.
   * An id the chart no longer holds is dropped, not rendered as hex.
   */
  counterAccounts: { id: string; code: string; name: string }[];
  /** Σ `lines[].amount`, as a decimal string. */
  amount: string;
  lines: FixedCostLine[];
  partyType: "customer" | "supplier" | "user" | null;
  partyId: string | null;
  partyName: string | null;
  cashflowType: string;
  ref: string | null;
  note: string | null;
  interval: FixedCostInterval;
  /** The anchor of the schedule, and its first occurrence. */
  startDate: string;
  nextDueAt: string;
  postedCount: number;
  lastPostedAt: string | null;
  lastTransactionId: string | null;
  /**
   * PAUSED RATHER THAN DELETED — a lease on hold. An inactive row keeps its
   * due date, is not offered for posting and is not counted in the totals.
   */
  isActive: boolean;
  /**
   * HOW MANY OCCURRENCES ARE WAITING, derived by the server against its own
   * clock — not merely whether one is. A rent entered three months late owes
   * three payments, and a screen that said only "jatuh tempo" would let two of
   * them disappear the moment the first was recorded. `0` on a paused row.
   */
  dueCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FixedCostListQuery {
  page?: number;
  limit?: number;
  sort?: FixedCostSort;
  branchId?: string;
  accountId?: string;
  kind?: FixedCostKind;
  interval?: FixedCostInterval;
  isActive?: boolean;
  dueFrom?: string;
  dueTo?: string;
  search?: string;
}

export interface FixedCostTotals {
  /** Σ of the ACTIVE rows, per direction. Decimal strings. */
  in: { amount: string; count: number };
  out: { amount: string; count: number };
}

export interface FixedCostListResponse {
  items: FixedCost[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  totals: FixedCostTotals;
}

export interface FixedCostLineInput {
  accountId: string;
  amount: string;
  businessLineId?: string | null;
  allocationId?: string | null;
  memo?: string | null;
}

export interface CreateFixedCostInput {
  name: string;
  kind: FixedCostKind;
  branchId: string;
  accountId: string;
  interval: FixedCostInterval;
  startDate: string;
  lines: FixedCostLineInput[];
  ref?: string | null;
  note?: string | null;
  partyType?: "customer" | "supplier" | "user";
  partyId?: string;
  partyName?: string | null;
  cashflowType?: string;
  isActive?: boolean;
}

export type UpdateFixedCostInput = Partial<CreateFixedCostInput>;
