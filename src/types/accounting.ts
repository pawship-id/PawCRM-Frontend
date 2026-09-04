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
 * Which side increases an account. DERIVED from `accountType`, never stored —
 * assets and expenses grow on the debit side, everything else on the credit
 * side, and that is a property of the class rather than a per-account setting.
 */
export type NormalBalance = "debit" | "credit";

/** One account in the tenant's chart of accounts. */
export interface ChartOfAccount {
  _id: string;
  /** The stable identifier every posting module resolves against ("1201"). */
  code: string;
  name: string;
  accountType: AccountType;
  /** Parent in the hierarchy, or null for a root. Max 4 levels deep. */
  parentAccountId: string | null;
  /**
   * The line of business postings against this account belong to, or null.
   *
   * ASKED HERE because the chart is where a tenant knows the answer: naming the
   * line on "5102 HPP Grooming" says it once for everything that ever lands
   * there. Null is ordinary rather than missing — rent and the electricity bill
   * belong to no single line.
   */
  businessLineId: string | null;
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
export type JournalEntrySort = "newest" | "oldest" | "numberDesc" | "numberAsc";

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
  };
  lines: JournalLine[];
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
