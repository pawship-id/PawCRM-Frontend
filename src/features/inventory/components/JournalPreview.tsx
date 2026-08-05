import { formatMoney, sumDecimals } from "@/utils/decimal";
import type { JournalLine } from "@/types/inventory";

/**
 * The double entry a stock movement will post, shown before it is posted.
 *
 * WHY A STOCK FORM SHOWS ACCOUNTING. Because the two are the same event. Moving
 * goods changes what the business owns, and the shop owner who writes off three
 * damaged bags is the person who later asks why the inventory figure dropped.
 * Surfacing the entry at the moment of the decision is what stops "the stock
 * report and the books disagree" from becoming a support ticket a month later.
 *
 * The balanced marker is not decoration: the backend refuses an entry whose
 * debits and credits differ, so an unbalanced preview means the form is about
 * to be rejected and the user should know before they press the button.
 */
export function JournalPreview({
  lines,
  emptyReason,
}: {
  lines: JournalLine[];
  /** Shown instead of the table when a movement deliberately posts nothing. */
  emptyReason?: string;
}) {
  if (lines.length === 0) {
    return emptyReason ? (
      <div className="rounded-lg border border-border bg-accent/50 px-4 py-3 text-xs text-muted">
        {emptyReason}
      </div>
    ) : null;
  }

  const totalDebit = sumDecimals(lines.map((line) => line.debit));
  const totalCredit = sumDecimals(lines.map((line) => line.credit));
  const balanced = totalDebit === totalCredit;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 bg-foreground px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-background">
        <span>Jurnal otomatis</span>
        <span className={balanced ? "ml-auto text-success" : "ml-auto text-danger"}>
          {balanced ? "✓ seimbang" : "✕ tidak seimbang"}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
            <th className="px-3 py-2 text-left font-medium">Akun</th>
            <th className="px-3 py-2 text-left font-medium">Nama</th>
            <th className="px-3 py-2 text-right font-medium">Debit</th>
            <th className="px-3 py-2 text-right font-medium">Kredit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.accountCode}-${index}`} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2 font-mono text-xs">{line.accountCode}</td>
              <td className="px-3 py-2 text-xs">{line.accountName}</td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                {line.debit ? formatMoney(line.debit) : "—"}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                {line.credit ? formatMoney(line.credit) : "—"}
              </td>
            </tr>
          ))}
          <tr className="bg-accent/40">
            <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold">
              Total
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums">
              {formatMoney(totalDebit)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-xs font-semibold tabular-nums">
              {formatMoney(totalCredit)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
