/**
 * The Accounting module's contract — the chart of accounts (COA) and the
 * general ledger posted against it.
 *
 * BOTH ENDPOINTS ARE ALREADY LIVE ON THE BACKEND (/api/chart-of-accounts and
 * /api/journal-entries); no screen calls them yet. These types are written
 * against what those routes return so the dummy fixtures the prototype screens
 * read cannot drift into a shape the API will never produce — the same three
 * rules Inventory and Purchasing follow: money is a decimal STRING, ids are
 * strings, and nothing carries a total the server would rather derive.
 *
 * WHERE THIS DEPARTS FROM THE BACKEND DOCUMENTS, and why:
 *   - a journal line here carries `accountId` only, exactly as stored. The code
 *     and the name a table shows are resolved against the COA, because that is
 *     what keeps a renamed account renamed everywhere at once;
 *   - `branchName` and `createdByName` are display labels the list endpoint
 *     populates. The ids they come from are not modelled, because no screen
 *     navigates by them.
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
  | "invoice"
  | "receipt"
  | "goods_receipt"
  | "purchase_payment"
  | "opname"
  | "return"
  | "commission"
  | "manual";

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
  /** Which line of business this line belongs to, when it is attributable. */
  businessLine: string | null;
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
  branchName: string;
  source: {
    type: JournalSourceType;
    /** The document that caused it — null for a manual entry. */
    id: string | null;
    /**
     * That document's human-facing number ("POS-2026-08-0143"), for display.
     * Null when the source has no number to show.
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
