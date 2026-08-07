"use client";

import { JournalPreview } from "@/features/inventory/components/JournalPreview";
import type { ReceiptJournalLine } from "@/types/api";
import type { JournalLine } from "@/types/inventory";

/**
 * The entry a goods receipt would post, rendered through the shared
 * JournalPreview.
 *
 * THIS FILE IS A SHIM OVER AN API INCONSISTENCY, and it should not outlive it.
 * `POST /stock-movements/preview` labels its journal lines — `accountCode` and
 * `accountName` — and JournalPreview renders exactly those two columns.
 * `POST /goods-receipts/preview` returns `{ accountId, debit, credit }` and
 * nothing else, so the same panel would show a raw ObjectId in the column a
 * reader uses to recognise the account. On the one screen where the entry
 * matters most — HPP is set here, permanently — that is not an acceptable
 * answer.
 *
 * THE ALTERNATIVE WAS WORSE. Fetching `/chart-of-accounts` to resolve the ids
 * needs `chartOfAccounts:read`, which the seeded Staff role does not hold —
 * and Staff is precisely who unloads the van. The panel would then be blank for
 * the people who use it most.
 *
 * WHY THE MAPPING IS SAFE. A receipt posts one shape, documented in the backend's
 * own api.md and enforced by GoodsReceiptService#journalLines:
 *
 *   Dr  1201 Persediaan Barang Dagangan   total
 *   Dr  1301 PPN Masukan                  taxAmount   (line omitted when zero)
 *       Cr  2101 Utang Supplier                       total + taxAmount
 *
 * There is exactly one credit line and at most two debit lines, in that order.
 * The mapping below reads the ROLE of each line rather than counting positions
 * blindly, so a receipt without PPN — where the `1301` line is absent — still
 * labels its credit correctly.
 *
 * WHAT REMOVES THIS FILE: the preview returning `accountCode` and `accountName`
 * like its stock-movement sibling. Then ReceiptForm passes `journal` straight to
 * JournalPreview and this shim is deleted.
 */

/** The three accounts a receipt can touch, in the order the backend emits them. */
const DEBIT_ACCOUNTS = [
  { accountCode: "1201", accountName: "Persediaan Barang Dagangan" },
  { accountCode: "1301", accountName: "PPN Masukan" },
];

const CREDIT_ACCOUNT = {
  accountCode: "2101",
  accountName: "Utang Supplier",
};

/**
 * Labels each line by its role: credits are the payable, debits are inventory
 * then input VAT. Not by index — a receipt with no PPN has two lines, not three.
 */
export function labelReceiptJournal(
  lines: ReceiptJournalLine[],
): JournalLine[] {
  let debitIndex = 0;

  return lines.map((line) => {
    if (line.credit !== null) {
      return { ...CREDIT_ACCOUNT, debit: line.debit, credit: line.credit };
    }

    const account = DEBIT_ACCOUNTS[debitIndex] ?? {
      // Unreachable against today's backend — a third debit line would mean the
      // posting changed shape, and showing the id beats inventing a label for it.
      accountCode: "—",
      accountName: "Akun tidak dikenal",
    };
    debitIndex += 1;

    return { ...account, debit: line.debit, credit: line.credit };
  });
}

export function ReceiptPreviewJournal({
  lines,
  emptyReason,
}: {
  lines: ReceiptJournalLine[];
  emptyReason?: string;
}) {
  return (
    <JournalPreview lines={labelReceiptJournal(lines)} emptyReason={emptyReason} />
  );
}
