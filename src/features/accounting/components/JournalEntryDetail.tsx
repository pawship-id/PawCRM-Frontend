"use client";

import Link from "next/link";
import { ChevronLeft, RotateCcw } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  ChartOfAccount,
  JournalEntry,
  JournalSourceDocument,
} from "@/types/accounting";
import { normalBalanceOf } from "@/types/accounting";
import { formatMoney, isPositive, sumDecimals } from "@/utils/decimal";

import { ACCOUNTING_CRUMBS } from "../crumbs";
import { useJournalEntry } from "../hooks/useJournalEntry";
import {
  ACCOUNT_TYPE_LABEL,
  CASHFLOW_LABEL,
  formatDate,
  sourceLabel,
  SOURCE_TONE,
} from "../labels";

/**
 * One entry, and the double entry it is made of, read from
 * GET /api/journal-entries/:id through `useJournalEntry`.
 *
 * THE BALANCE MARKER IS THE POINT OF THE PAGE. Σdebit === Σcredit is what makes
 * a row a journal entry rather than a note about money, and it is the invariant
 * the backend refuses a posting over. Showing the two totals side by side — with
 * the verdict spelled out — is what lets somebody trust the number without
 * re-adding the column. It is computed here from the lines the API sent rather
 * than taken on trust, which is the only version of the check worth drawing.
 *
 * THE REVERSAL LINK IS AT THE TOP, not buried in the metadata. An entry that has
 * been reversed no longer affects any report, and reading its amounts without
 * knowing that is the single most expensive mistake this screen can cause. The
 * same banner, mirrored, tells a reversal which entry it undoes.
 *
 * ACCOUNT AND BUSINESS-LINE NAMES ARE RESOLVED CLIENT-SIDE — see the hook. Both
 * fall back to the id, which is a worse label than a name and a far better one
 * than a blank cell on a page somebody is auditing.
 */
export function JournalEntryDetail({ entryId }: { entryId: string }) {
  const {
    entry,
    accountsById,
    businessLineNames,
    relatedNumbers,
    loading,
    notFound,
    error,
    refetch,
  } = useJournalEntry(entryId);

  if (loading && !entry) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat entri…
      </div>
    );
  }

  // A 404 is not a failure to retry — this id does not exist in the tenant — so
  // the way out is the list, not a reload button.
  if (notFound) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <p className="font-medium text-foreground">Entri tidak ditemukan.</p>
        <p className="mt-1 text-sm text-muted">
          Nomor jurnal ini tidak ada di buku besar tenant kamu. Mungkin
          tautannya sudah usang.
        </p>
        <Button variant="secondary" size="sm" asChild className="mt-4">
          <Link href={ACCOUNTING_CRUMBS.journal.href}>
            Kembali ke Jurnal
          </Link>
        </Button>
      </div>
    );
  }

  if (!entry) {
    return (
      <Alert variant="error">
        <span className="flex flex-wrap items-center gap-3">
          {error ?? "Gagal memuat entri jurnal."}
          <Button variant="secondary" size="sm" onClick={refetch}>
            <RotateCcw className="size-4" />
            Coba lagi
          </Button>
        </span>
      </Alert>
    );
  }

  /** Whether any line on this entry names a Detil Akun — see the column below. */
  const anyAllocation = entry.lines.some((line) => line.allocationId);

  const totalDebit = sumDecimals(entry.lines.map((line) => line.debit));
  const totalCredit = sumDecimals(entry.lines.map((line) => line.credit));
  const balanced = totalDebit === totalCredit;

  const sourceHref = documentHref(entry.source.document);

  return (
    <div className="flex flex-col gap-6">
      {/* The mockup's head: the entry named in the title, and the way back to
          the list beside it. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-foreground">
          Jurnal — <span className="tabular-nums">{entry.entryNumber}</span>
        </h1>
        <Button variant="secondary" asChild>
          <Link href={ACCOUNTING_CRUMBS.journal.href}>
            <ChevronLeft className="size-4" />
            Kembali ke Jurnal
          </Link>
        </Button>
      </div>

      {error && (
        // The entry itself is on screen — this only reports that a refresh
        // failed, so it sits above the data rather than replacing it.
        <Alert variant="error">
          <span className="flex flex-wrap items-center gap-3">
            {error}
            <Button variant="secondary" size="sm" onClick={refetch}>
              <RotateCcw className="size-4" />
              Coba lagi
            </Button>
          </span>
        </Alert>
      )}

      {entry.reversedByEntryId && (
        <div className="rounded-lg bg-tint-danger px-4 py-3 text-sm">
          <b className="font-semibold text-danger">Entri ini sudah dibalik.</b>{" "}
          Nilainya sudah dikoreksi oleh{" "}
          <Link
            href={`${ACCOUNTING_CRUMBS.journal.href}/${entry.reversedByEntryId}`}
            className="rounded-md font-semibold tabular-nums text-danger underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {relatedNumbers.get(entry.reversedByEntryId) ?? "entri pembalik"}
          </Link>{" "}
          dan tidak lagi berpengaruh ke laporan.
        </div>
      )}

      {entry.reversesEntryId && (
        <div className="rounded-lg border border-border bg-surface-hover px-4 py-3 text-sm">
          Entri pembalik untuk{" "}
          <Link
            href={`${ACCOUNTING_CRUMBS.journal.href}/${entry.reversesEntryId}`}
            className="rounded-md font-semibold tabular-nums text-foreground underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {relatedNumbers.get(entry.reversesEntryId) ?? "entri asli"}
          </Link>
          . Debit dan kreditnya adalah kebalikan dari entri asli.
        </div>
      )}

      {/* WHERE THIS ENTRY CAME FROM, and the way there (mockup). Three cases:
          a document that can be opened, a machine posting whose document has
          no page yet, and a manual entry that has none at all. */}
      <div className="rounded-lg border border-primary/20 bg-accent/60 px-4 py-3 text-sm">
        {entry.source.type === "manual" ? (
          <>
            <b className="mb-0.5 block text-primary">
              Tidak ada dokumen sumber
            </b>
            Dibuat langsung lewat Tambah jurnal manual — tidak ada transaksi kas
            atau bank di baliknya.
          </>
        ) : (
          <>
            <b className="mb-0.5 block text-primary">Ada dokumen sumber</b>
            {sourceLabel(entry.source.type)}
            {entry.source.reference && (
              <>
                {" · "}
                <span className="tabular-nums">{entry.source.reference}</span>
              </>
            )}
            .{" "}
            {sourceHref ? (
              <Link
                href={sourceHref}
                className="rounded-md font-semibold text-primary-hover underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                Buka {entry.source.reference ?? "dokumennya"} →
              </Link>
            ) : (
              <span className="text-muted">
                Dokumennya belum punya halaman yang bisa dibuka dari sini.
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {entry.entryNumber}
              </span>
              <span
                className={cn(
                  "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                  SOURCE_TONE[entry.source.type],
                )}
              >
                {sourceLabel(entry.source.type)}
              </span>
              {entry.recurring.enabled && (
                <span
                  className="inline-block rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted"
                  title="Konfigurasi pengulangan tersimpan; penjadwalnya belum ada di backend."
                >
                  berulang
                </span>
              )}
            </div>
            <p className="mt-1.5 text-lg font-semibold text-foreground">
              {entry.description}
            </p>
          </div>

          {/*
            Disabled, and the reason has changed since it was written: POST
            /:id/reverse is reachable now — journalEntryService.reverse calls it
            — but a reversal needs a date and a description confirmed by a human
            before it posts a second permanent entry into the ledger, and that
            dialog does not exist yet. Hidden entirely on an entry that has
            already been reversed: the backend refuses a second reversal, and
            offering it would promise otherwise.
          */}
          {!entry.reversedByEntryId && (
            <Button
              variant="secondary"
              disabled
              title="Dialog konfirmasi pembalikan belum tersedia"
            >
              Balik entri
            </Button>
          )}
        </div>

        <dl className="grid gap-x-6 gap-y-3 border-t border-border pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tanggal transaksi" value={formatDate(entry.date)} />
          <Field label="Cabang" value={entry.branchName ?? "—"} />
          <Field
            label="Dokumen sumber"
            value={entry.source.reference ?? "— (jurnal manual)"}
            mono={Boolean(entry.source.reference)}
          />
          <Field
            label="Arus kas"
            value={
              entry.cashflowType
                ? CASHFLOW_LABEL[entry.cashflowType]
                : "— (tidak menggerakkan kas)"
            }
          />
          <Field
            label="Dibuat oleh"
            value={entry.createdByName ?? "Sistem (posting otomatis)"}
          />
          <Field
            label="Dicatat pada"
            value={formatDate(entry.createdAt)}
            hint={
              entry.createdAt.slice(0, 10) !== entry.date.slice(0, 10)
                ? "Berbeda dari tanggal transaksi — laporan memakai tanggal transaksi."
                : undefined
            }
          />
          <Field
            label="Pengulangan"
            value={
              entry.recurring.enabled
                ? `Setiap ${RECURRING_LABEL[entry.recurring.interval ?? "monthly"]}`
                : "Tidak berulang"
            }
          />
          <div>
            <dt className="text-xs font-medium tracking-widest text-muted uppercase">
              Tag
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {entry.tags.length === 0 ? (
                <span className="text-sm text-muted">—</span>
              ) : (
                entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-block rounded-full bg-tint-neutral px-2 py-0.5 text-xs text-muted"
                  >
                    {tag}
                  </span>
                ))
              )}
            </dd>
          </div>
        </dl>

        {entry.attachmentUrl && (
          <p className="border-t border-border pt-3 text-xs text-muted">
            Lampiran:{" "}
            <a
              href={entry.attachmentUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md tabular-nums text-primary-hover underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {entry.attachmentUrl}
            </a>
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border bg-foreground px-4 py-2 text-xs font-medium tracking-widest text-background uppercase">
          <span>Baris jurnal ({entry.lines.length})</span>
          {/* Always a word beside the mark — a tick alone is colour-only status
              (§9), and this is the one verdict on the page that has to survive
              being read quickly. */}
          <span className={cn("ml-auto", balanced ? "text-success" : "text-danger")}>
            {balanced ? "✓ seimbang" : "✕ tidak seimbang"}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Akun</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead>Lini bisnis</TableHead>
              {/* Only when a line on THIS entry names one — a column of em
                  dashes over every entry posted before allocation existed is a
                  column people learn to skip. */}
              {anyAllocation && <TableHead>Detil akun</TableHead>}
              <TableHead>Memo</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Kredit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.lines.map((line, index) => {
              const account = accountsById.get(line.accountId);
              /**
               * WHICH SIDE THIS LINE IS ON, decided on the VALUE rather than on
               * the string. The API renders money at four decimal places, so a
               * credit line's debit arrives as `"0.0000"` — which is not `"0"`,
               * and a `!== "0"` test therefore called every credit a debit,
               * printing "Rp 0" in the debit column and a dash where the amount
               * belonged. The totals row summed the decimals properly, so the
               * page said SEIMBANG over a table where no credit had a number.
               */
              const isDebit = isPositive(line.debit);

              return (
                <TableRow key={`${line.accountId}-${index}`}>
                  <TableCell className="px-4 py-2.5">
                    {/*
                      The credit side is indented, the way a hand-written journal
                      has always been laid out: debits at the margin, credits
                      stepped in. It is the fastest way to read which side a line
                      is on without checking which column the number landed in.
                    */}
                    <div className={cn(!isDebit && "pl-6")}>
                      <span className="text-xs tabular-nums text-muted">
                        {account?.code ?? "????"}
                      </span>
                      <span className="ml-2 text-sm font-medium text-foreground">
                        {account?.name ?? accountLabelFallback(line.accountId)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-xs text-muted">
                    {account ? describeAccount(account) : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-xs text-muted">
                    {line.businessLineId
                      ? (businessLineNames.get(line.businessLineId) ??
                        line.businessLineId)
                      : "—"}
                  </TableCell>
                  {anyAllocation && (
                    <TableCell className="px-4 py-2.5 text-xs text-muted">
                      {/*
                        Resolved against the account's CURRENT rules, which may
                        since have been renamed — the entry is immutable, the
                        chart is not. A rule that cannot be found at all falls
                        back to a dash rather than an ObjectId; the chart refuses
                        to delete one a live line names, so this is only reachable
                        through a direct database edit.
                      */}
                      {line.allocationId
                        ? ((account?.allocations ?? []).find(
                            (rule) => rule._id === line.allocationId,
                          )?.name ?? "—")
                        : "—"}
                    </TableCell>
                  )}
                  <TableCell className="px-4 py-2.5 text-xs text-muted">
                    {line.memo ?? "—"}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums">
                    {isDebit ? formatMoney(line.debit) : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums">
                    {isDebit ? "—" : formatMoney(line.credit)}
                  </TableCell>
                </TableRow>
              );
            })}

            <TableRow className="bg-surface-hover hover:bg-surface-hover">
              <TableCell
                colSpan={4}
                className="px-4 py-2.5 text-right text-xs font-semibold tracking-widest text-muted uppercase"
              >
                Total
              </TableCell>
              <TableCell className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">
                {formatMoney(totalDebit)}
              </TableCell>
              <TableCell className="px-4 py-2.5 text-right text-sm font-semibold tabular-nums">
                {formatMoney(totalCredit)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Where a source document's own page is, by the kind the server names.
 *
 * NULL FOR A KIND WITH NO PAGE — a till return is only ever seen inside the
 * kasir — and the callout then says so instead of drawing a dead link. The
 * paths are written out rather than imported from the modules that own them,
 * so the ledger does not pull four features into its bundle for five strings.
 */
function documentHref(document: JournalSourceDocument | null): string | null {
  if (!document) return null;

  switch (document.kind) {
    case "goods_receipt":
      return `/dashboard/purchasing/receipts/${document.id}`;
    case "purchase_return":
      return `/dashboard/purchasing/returns/${document.id}`;
    case "stock_opname":
      return `/dashboard/inventory/opname/${document.id}`;
    case "cash_transaction":
      return `/dashboard/keuangan/kas-bank/transaksi/${document.id}`;
    case "customer_invoice":
      return `/dashboard/sales/${document.id}`;
    default:
      return null;
  }
}

const RECURRING_LABEL: Record<
  NonNullable<JournalEntry["recurring"]["interval"]>,
  string
> = {
  daily: "hari",
  weekly: "minggu",
  monthly: "bulan",
  yearly: "tahun",
};

/** "Aset · normal debit" — the fact somebody needs to read which side is which. */
function describeAccount(account: ChartOfAccount): string {
  const side = normalBalanceOf(account.accountType) === "debit" ? "debit" : "kredit";
  return `${ACCOUNT_TYPE_LABEL[account.accountType]} · normal ${side}`;
}

/**
 * What a line's account column says when the chart could not be read.
 *
 * The id rather than "Akun tidak dikenal", which is what this used to say and was
 * wrong twice over: the account almost certainly exists — the usual reason it is
 * missing here is that the user lacks `chartOfAccounts:read` — and a label naming
 * nothing is unusable to whoever has to go and look it up.
 */
function accountLabelFallback(accountId: string): string {
  return accountId;
}

function Field({
  label,
  value,
  mono = false,
  hint,
}: {
  label: string;
  value: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-widest text-muted uppercase">
        {label}
      </dt>
      <dd
        className={cn("mt-1 text-sm text-foreground", mono && "tabular-nums")}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
