import Link from "next/link";

/**
 * A journal entry, named by its NUMBER and linked to its page.
 *
 * THE NUMBER, NEVER THE ObjectId, whenever one is known. `JE-2026-08-0124` is
 * what a person quotes to their accountant; `6a903f15…` is what a database calls
 * it. The id is the fallback only because a link with no label at all would be
 * worse than an unreadable one.
 *
 * `linked` IS THE PERMISSION, passed in rather than checked here. Reading the
 * ledger is `journalEntries:read`, a separate grant from seeing an invoice — and
 * a link that 403s on click is worse than plain text, because it promises
 * somewhere to go.
 *
 * PROMOTED OUT OF `PaymentHistory` when the invoice's own entries needed it too
 * — `docs/ui-rules.md` §14: a component moves when a SECOND caller appears, and
 * copy-paste is what that rule exists to prevent.
 */
export function JournalLink({
  id,
  number,
  linked,
}: {
  id: string;
  number: string | null;
  linked: boolean;
}) {
  const label = number ?? id;

  if (!linked) {
    return <span className="tabular-nums">{label}</span>;
  }

  return (
    <Link
      href={`/dashboard/keuangan/journal-entries/${id}`}
      className="tabular-nums text-primary-hover underline-offset-2 hover:underline"
    >
      {label}
    </Link>
  );
}
