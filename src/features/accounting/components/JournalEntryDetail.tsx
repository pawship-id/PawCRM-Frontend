"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JournalEntry } from "@/types/accounting";
import { normalBalanceOf } from "@/types/accounting";
import { formatMoney, sumDecimals } from "@/utils/decimal";

import {
  ACCOUNTS_BY_ID,
  BUSINESS_LINES_BY_ID,
  entryNumberOf,
  findEntry,
} from "../data/dummy";
import {
  ACCOUNT_TYPE_LABEL,
  CASHFLOW_LABEL,
  formatDate,
  SOURCE_LABEL,
  SOURCE_TONE,
} from "../labels";

/**
 * One entry, and the double entry it is made of.
 *
 * THE BALANCE MARKER IS THE POINT OF THE PAGE. Σdebit === Σcredit is what makes
 * a row a journal entry rather than a note about money, and it is the invariant
 * the backend refuses a posting over. Showing the two totals side by side — with
 * the verdict spelled out — is what lets somebody trust the number without
 * re-adding the column.
 *
 * THE REVERSAL LINK IS AT THE TOP, not buried in the metadata. An entry that has
 * been reversed no longer affects any report, and reading its amounts without
 * knowing that is the single most expensive mistake this screen can cause. The
 * same banner, mirrored, tells a reversal which entry it undoes.
 */
export function JournalEntryDetail({ entryId }: { entryId: string }) {
  const entry = findEntry(entryId);

  if (!entry) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <p className="font-medium text-foreground">Entri tidak ditemukan</p>
        <p className="mt-1 text-sm text-muted">
          Nomor jurnal ini tidak ada di data contoh.
        </p>
        <Button variant="ghost" size="sm" asChild className="mt-4">
          <Link href="/dashboard/keuangan/journal-entries">
            Kembali ke jurnal umum
          </Link>
        </Button>
      </div>
    );
  }

  const totalDebit = sumDecimals(entry.lines.map((line) => line.debit));
  const totalCredit = sumDecimals(entry.lines.map((line) => line.credit));
  const balanced = totalDebit === totalCredit;

  const reversedBy = entryNumberOf(entry.reversedByEntryId);
  const reverses = entryNumberOf(entry.reversesEntryId);

  return (
    <div className="flex flex-col gap-6">
      {entry.reversedByEntryId && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-sm">
          <b className="text-danger">Entri ini sudah dibalik.</b> Nilainya sudah
          dikoreksi oleh{" "}
          <Link
            href={`/dashboard/keuangan/journal-entries/${entry.reversedByEntryId}`}
            className="tabular-nums text-xs font-semibold text-danger underline-offset-4 hover:underline"
          >
            {reversedBy}
          </Link>{" "}
          dan tidak lagi berpengaruh ke laporan.
        </div>
      )}

      {entry.reversesEntryId && (
        <div className="rounded-lg border border-border bg-accent/50 px-4 py-3 text-sm">
          Entri pembalik untuk{" "}
          <Link
            href={`/dashboard/keuangan/journal-entries/${entry.reversesEntryId}`}
            className="tabular-nums text-xs font-semibold text-foreground underline-offset-4 hover:underline"
          >
            {reverses}
          </Link>
          . Debit dan kreditnya adalah kebalikan dari entri asli.
        </div>
      )}

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-sm font-semibold text-foreground">
                {entry.entryNumber}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  entry.source.type !== "manual" && "border-transparent",
                  SOURCE_TONE[entry.source.type],
                )}
              >
                {SOURCE_LABEL[entry.source.type]}
              </Badge>
              {entry.recurring.enabled && (
                <Badge
                  variant="outline"
                  className="border-transparent bg-accent text-muted"
                  title="Konfigurasi pengulangan tersimpan; penjadwalnya belum ada di backend."
                >
                  berulang
                </Badge>
              )}
            </div>
            <p className="mt-1.5 text-lg font-semibold text-foreground">
              {entry.description}
            </p>
          </div>

          {/*
            Disabled, like the create buttons: POST /:id/reverse exists and is
            the only legal correction, but nothing here calls it yet. Hidden
            entirely on an entry that has already been reversed — the backend
            refuses a second reversal, and offering it would promise otherwise.
          */}
          {!entry.reversedByEntryId && (
            <Button
              variant="outline"
              disabled
              title="Belum tersambung ke API"
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
              entry.createdAt !== entry.date
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
            <dt className="text-[10px] font-medium uppercase tracking-widest text-muted">
              Tag
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {entry.tags.length === 0 ? (
                <span className="text-sm text-muted">—</span>
              ) : (
                entry.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="border-border text-xs font-normal text-muted"
                  >
                    {tag}
                  </Badge>
                ))
              )}
            </dd>
          </div>
        </dl>

        {entry.attachmentUrl && (
          <p className="border-t border-border pt-3 text-xs text-muted">
            Lampiran:{" "}
            <span className="tabular-nums text-foreground">
              {entry.attachmentUrl}
            </span>
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border bg-foreground px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-background">
          <span>Baris jurnal ({entry.lines.length})</span>
          <span className={cn("ml-auto", balanced ? "text-success" : "text-danger")}>
            {balanced ? "✓ seimbang" : "✕ tidak seimbang"}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
                <th className="px-4 py-2.5 text-left font-medium">Akun</th>
                <th className="px-4 py-2.5 text-left font-medium">Tipe</th>
                <th className="px-4 py-2.5 text-left font-medium">
                  Lini bisnis
                </th>
                <th className="px-4 py-2.5 text-left font-medium">Memo</th>
                <th className="px-4 py-2.5 text-right font-medium">Debit</th>
                <th className="px-4 py-2.5 text-right font-medium">Kredit</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((line, index) => {
                const account = ACCOUNTS_BY_ID.get(line.accountId);
                const isDebit = line.debit !== "0";

                return (
                  <tr
                    key={`${line.accountId}-${index}`}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-4 py-2.5">
                      {/*
                        The credit side is indented, the way a hand-written
                        journal has always been laid out: debits at the margin,
                        credits stepped in. It is the fastest way to read which
                        side a line is on without checking which column the
                        number landed in.
                      */}
                      <div className={cn(!isDebit && "pl-6")}>
                        <span className="tabular-nums text-xs text-muted">
                          {account?.code ?? "????"}
                        </span>
                        <span className="ml-2 text-sm font-medium text-foreground">
                          {account?.name ?? "Akun tidak dikenal"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {account
                        ? `${ACCOUNT_TYPE_LABEL[account.accountType]} · normal ${
                            normalBalanceOf(account.accountType) === "debit"
                              ? "debit"
                              : "kredit"
                          }`
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {businessLineName(line.businessLineId)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {line.memo ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                      {isDebit ? formatMoney(line.debit) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                      {isDebit ? "—" : formatMoney(line.credit)}
                    </td>
                  </tr>
                );
              })}

              <tr className="bg-accent/60">
                <td
                  colSpan={4}
                  className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-widest text-muted"
                >
                  Total
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sm font-semibold">
                  {formatMoney(totalDebit)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-sm font-semibold">
                  {formatMoney(totalCredit)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
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

/**
 * A line's business line by name.
 *
 * Resolved here rather than sent by the API, for the reason stated in
 * types/accounting.ts: the business lines are a short, cacheable list a client
 * already holds, and resolving ids locally is what keeps a renamed line renamed
 * everywhere at once. Falls back to the id, which is a worse label than a name
 * and a better one than a blank cell.
 */
function businessLineName(businessLineId: string | null): string {
  if (!businessLineId) return "—";
  return BUSINESS_LINES_BY_ID.get(businessLineId)?.name ?? businessLineId;
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
      <dt className="text-[10px] font-medium uppercase tracking-widest text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-sm text-foreground",
          mono && "tabular-nums text-xs",
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
