"use client";

import { Fragment, useMemo, useState } from "react";

import { Alert, Breadcrumb, Spinner } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { absDecimal, formatMoney } from "@/utils/decimal";

import { ACCOUNTING_CRUMBS } from "../crumbs";
import { balanceSheet, type BalanceSheetSection } from "../balanceSheet";
import { currentMonthRange, reportPresets, type FinanceQuery } from "../financeSummary";
import { useFinanceReport } from "../hooks/useFinanceReport";
import { formatDate } from "../labels";
import { FinanceReportToolbar } from "./FinanceReportToolbar";

/**
 * Neraca — what the shop owns, what it owes, and what is left.
 *
 * A POSITION, NOT A PERIOD, and that is the whole difference from the laba rugi
 * beside it. The toolbar's date range still appears because every Keuangan
 * report wears the same bar, but only its END is used: a balance is cumulative
 * from inception, so "1–30 September" and "everything up to 30 September" are
 * the same sheet. The card says so rather than leaving somebody to wonder why
 * moving the start changes nothing.
 *
 * NO LINI BISNIS FILTER, for the reason Arus Kas has none: a rupiah in the bank
 * and a debt to a supplier belong to the shop, not to grooming or retail. The
 * lini bisnis tag lives on P&L postings, where it answers a question.
 *
 * LABA DITAHAN IS A DERIVED ROW, not an account — see `balanceSheet`. It carries
 * its own note on the page, because a figure with no account behind it is one
 * somebody will otherwise go looking for in the chart of accounts.
 *
 * WHETHER IT BALANCES IS PRINTED. A balance sheet that silently does not add up
 * is the most misleading thing this module could show; when the two sides differ
 * the page says so and names the difference.
 */
export function BalanceSheetScreen({ now }: { now: string }) {
  const today = useMemo(() => new Date(now), [now]);
  const presets = useMemo(() => reportPresets(today), [today]);

  const [query, setQuery] = useState<FinanceQuery>(() => {
    const month = currentMonthRange(today);
    return {
      dateFrom: month.dateFrom,
      dateTo: month.dateTo,
      branchId: "",
      businessLineId: "",
    };
  });

  const { branches, balances, loading, error } = useFinanceReport(
    "balanceSheet",
    query,
  );

  const sheet = useMemo(
    () => (balances ? balanceSheet(balances) : null),
    [balances],
  );

  const asOfLabel = query.dateTo ? formatDate(query.dateTo) : "hari ini";
  const branchLabel = query.branchId
    ? (branches.find((branch) => branch._id === query.branchId)?.name ??
      "Cabang terpilih")
    : "Semua cabang";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[ACCOUNTING_CRUMBS.hub, { label: "Neraca" }]} />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">Neraca</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Posisi keuangan pada satu tanggal: yang dimiliki, yang masih jadi
          kewajiban, dan sisanya milik pemilik. Berbeda dari laba rugi — ini
          bukan hasil satu periode, tapi keadaan sampai tanggal itu.
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <FinanceReportToolbar
        query={query}
        branches={branches}
        presets={presets}
        disabled={loading}
        onChange={(patch) => setQuery((prev) => ({ ...prev, ...patch }))}
      />

      {sheet === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat neraca…
        </div>
      ) : (
        <div className={cn("flex flex-col gap-6", loading && "opacity-60")}>
          {!sheet.balanced && (
            /*
              A neraca that does not balance means something posted to the ledger
              one-sided, or an account changed class after it was posted to. It is
              stated plainly and with the number, because the size of the gap is
              the first clue to which.
            */
            <Alert variant="error">
              <p className="font-semibold">Neraca belum seimbang.</p>
              <p className="mt-0.5">
                Aset dan (kewajiban + modal) selisih{" "}
                <span className="font-semibold tabular-nums">
                  {signed(sheet.difference)}
                </span>
                . Biasanya ada jurnal yang sisinya tidak lengkap, atau akun yang
                tipenya berubah setelah dipakai posting.
              </p>
            </Alert>
          )}

          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-hover px-4 py-3">
              <h2 className="text-base font-bold">Laporan Neraca</h2>
              <span className="text-xs tabular-nums text-muted">
                Per {asOfLabel} · {branchLabel}
              </span>
              <span className="ml-auto text-xs text-muted">
                Aset = Kewajiban + Modal
              </span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Akun</TableHead>
                  <TableHead className="text-right whitespace-nowrap">
                    Saldo
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Section section={sheet.assets} />

                {/* The total a reader checks the other side against, so it is
                    emphasised on its own row rather than left as the last
                    section subtotal. */}
                <TotalRow label="Total Aset" value={sheet.assets.total} emphasis />

                <Section section={sheet.liabilities} />
                <TotalRow
                  label="Total Kewajiban"
                  value={sheet.liabilities.total}
                />

                <Section
                  section={sheet.equity}
                  extraRow={{
                    label: "Laba Ditahan",
                    hint: "Akumulasi laba rugi sampai tanggal ini — dihitung, bukan akun",
                    value: sheet.retainedEarnings,
                  }}
                />
                <TotalRow label="Total Modal" value={sheet.equityTotal} />

                <TotalRow
                  label="Total Kewajiban + Modal"
                  value={sheet.liabilitiesAndEquity}
                  emphasis
                />
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted">
            Laba Ditahan tidak punya akun sendiri di daftar akun: PawCRM belum
            punya proses tutup buku, jadi angkanya dihitung dari seluruh akun
            pendapatan dikurangi seluruh akun beban sampai tanggal ini. Akun yang
            belum pernah dipakai posting tidak muncul di sini.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * One side of the sheet: its categories, each with the accounts under it.
 *
 * The category is a heading rather than a row of its own with a code, for the
 * same reason the chart of accounts draws its groups that way — "Cash & Bank" is
 * not an account, and giving it the shape of one invents a record that would
 * collide the day a tenant creates a real header account.
 */
function Section({
  section,
  extraRow,
}: {
  section: BalanceSheetSection;
  /** A derived row printed after the real accounts — laba ditahan under Modal. */
  extraRow?: { label: string; hint: string; value: string };
}) {
  return (
    <Fragment>
      <TableRow className="bg-surface-hover hover:bg-surface-hover">
        <TableCell colSpan={2} className="px-4 py-2.5 text-sm font-bold">
          {section.label}
        </TableCell>
      </TableRow>

      {section.groups.map((group) => (
        <Fragment key={group.key}>
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={2}
              className="px-4 py-2 pl-8 text-xs font-semibold text-muted"
            >
              {group.label}
            </TableCell>
          </TableRow>

          {group.accounts.map((account) => (
            <TableRow key={account.accountId}>
              <TableCell className="py-2 pr-4 pl-12 text-sm">
                <span className="mr-2 text-xs tabular-nums text-muted">
                  {account.code}
                </span>
                {account.name}
              </TableCell>
              <TableCell className="px-4 py-2 text-right text-sm tabular-nums text-muted">
                {signed(account.balance)}
              </TableCell>
            </TableRow>
          ))}
        </Fragment>
      ))}

      {section.groups.length === 0 && !extraRow && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={2} className="py-4 pl-8 text-sm text-muted">
            Belum ada akun dengan saldo di bagian ini.
          </TableCell>
        </TableRow>
      )}

      {extraRow && (
        <TableRow>
          <TableCell className="py-2 pr-4 pl-12 text-sm">
            {extraRow.label}
            <span className="mt-0.5 block text-xs text-muted">
              {extraRow.hint}
            </span>
          </TableCell>
          <TableCell className="px-4 py-2 text-right text-sm tabular-nums text-muted">
            {signed(extraRow.value)}
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

function TotalRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  /** The two figures that must match, tinted so the eye can pair them. */
  emphasis?: boolean;
}) {
  const tone = emphasis ? "bg-navy-100" : "bg-surface-selected";

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className={cn("px-4 py-2.5 text-sm font-bold", tone)}>
        {label}
      </TableCell>
      <TableCell
        className={cn("px-4 py-2.5 text-right text-sm font-bold tabular-nums", tone)}
      >
        {signed(value)}
      </TableCell>
    </TableRow>
  );
}

/**
 * Money as this report prints it.
 *
 * A TRUE MINUS SIGN, not the hyphen `formatMoney` puts after "Rp" — the same
 * choice the laba rugi and arus kas screens make. On a neraca it shows up on a
 * contra account and on an accumulated loss, and both are numbers somebody
 * should not have to read twice.
 */
function signed(value: string): string {
  return value.startsWith("-")
    ? `−${formatMoney(absDecimal(value))}`
    : formatMoney(value);
}
