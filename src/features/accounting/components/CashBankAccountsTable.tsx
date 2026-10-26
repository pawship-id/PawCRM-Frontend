"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";

import {
  DataTable,
  RowLinkMenu,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Can } from "@/features/permissions";
import { formatMoney, toMinor } from "@/utils/decimal";

import {
  sumColumn,
  type CashBankAccountRow,
} from "../hooks/useCashBankAccounts";

/** The orderings this table offers. Local names — no API sees them. */
export type CashBankAccountSort =
  | "default"
  | "codeAsc"
  | "codeDesc"
  | "masukAsc"
  | "masukDesc"
  | "keluarAsc"
  | "keluarDesc"
  | "saldoAsc"
  | "saldoDesc";

const SORT_OPTIONS: SortOptions<CashBankAccountSort> = {
  code: { asc: "codeAsc", desc: "codeDesc" },
  masuk: { asc: "masukAsc", desc: "masukDesc", first: "desc" },
  keluar: { asc: "keluarAsc", desc: "keluarDesc", first: "desc" },
  saldo: { asc: "saldoAsc", desc: "saldoDesc", first: "desc" },
};

type MoneyColumn = "masuk" | "keluar" | "saldo";

function minorOf(row: CashBankAccountRow, column: MoneyColumn): bigint {
  return toMinor(row[column]) ?? 0n;
}

function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The rows in the order asked for. `default` is the order they arrived in;
 * `sort` is stable, so ties keep it too.
 */
export function sortCashBankAccounts(
  rows: CashBankAccountRow[],
  sort: CashBankAccountSort,
): CashBankAccountRow[] {
  if (sort === "default") return rows;
  const sorted = [...rows];

  if (sort === "codeAsc" || sort === "codeDesc") {
    const sign = sort === "codeAsc" ? 1 : -1;
    return sorted.sort(
      (a, b) =>
        sign *
        a.account.code.localeCompare(b.account.code, "id", { numeric: true }),
    );
  }

  const column: MoneyColumn = sort.startsWith("masuk")
    ? "masuk"
    : sort.startsWith("keluar")
      ? "keluar"
      : "saldo";
  const sign = sort.endsWith("Asc") ? 1 : -1;
  return sorted.sort(
    (a, b) => sign * compareBigint(minorOf(a, column), minorOf(b, column)),
  );
}

const COLUMNS: DataTableColumn<CashBankAccountRow>[] = [
  {
    id: "code",
    header: "Kode",
    // tabular-nums so the codes line up — ui-rules §5.
    cellClassName: "tabular-nums whitespace-nowrap text-muted",
    cell: ({ account }) => account.code,
  },
  {
    id: "name",
    header: "Akun",
    cellClassName: "font-medium text-foreground",
    cell: ({ account }) => account.name,
  },
  {
    id: "masuk",
    header: "Masuk",
    align: "right",
    cellClassName: "text-success",
    cell: ({ masuk }) => formatMoney(masuk),
  },
  {
    id: "keluar",
    header: "Keluar",
    align: "right",
    cellClassName: "text-foreground",
    cell: ({ keluar }) => formatMoney(keluar),
  },
  {
    id: "saldo",
    header: "Saldo",
    align: "right",
    cell: ({ saldo }) => (
      <b className="font-semibold text-foreground">{formatMoney(saldo)}</b>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: ({ account }) => (
      /* ui-rules §9: pale named tint, saturated ink, no visible border — a
         status is not a button. */
      <Badge
        variant="outline"
        className={
          account.isActive
            ? "border-transparent bg-tint-success text-success"
            : "border-transparent bg-tint-neutral text-muted"
        }
      >
        {account.isActive ? "Aktif" : "Tidak aktif"}
      </Badge>
    ),
  },
  {
    id: "actions",
    header: "Aksi",
    align: "right",
    cellClassName: "whitespace-nowrap",
    /*
      THE ACCOUNT IS EDITED WHERE ACCOUNTS ARE EDITED. A chart of accounts has
      one form, in Pengaturan; a second one reachable from a report is how two
      screens start disagreeing about what a category means.
    */
    cell: ({ account }) => (
      <Can feature="chartOfAccounts" action="update">
        <RowLinkMenu
          name={account.name}
          links={[
            {
              href: `/dashboard/settings/chart-of-accounts/${account._id}/edit`,
              label: "Ubah",
              icon: <Pencil />,
            },
          ]}
        />
      </Can>
    ),
  },
];

/**
 * Akun Kas & Bank — every ledger account the shop's money sits in, what moved
 * through it this period, and what it holds at the end of it.
 *
 * ONE ROW PER ACCOUNT, which is what lets this table have a FOOTER. The version
 * that listed payment channels could not: two channels pointing at one account
 * meant the saldo column was printed once and cross-referenced on the rest, so
 * adding it up gave more money than the shop has. Rows that are accounts add up,
 * and a cash table whose total is the cash position is the whole reason to read
 * one.
 *
 * MASUK AND KELUAR ARE THE PERIOD; SALDO IS A POSITION as of its end. Two kinds
 * of number in one row — which is why Σ saldo is NOT Σ masuk − Σ keluar plus
 * anything on this screen: the balance carries every period before this one
 * too. (The sentence under the table that spelled this out went on BO's call,
 * 20 October 2026.)
 *
 * NO TIPE AND NO CABANG COLUMN, unlike the channel table this replaces. An
 * account has neither: "Tunai / Transfer / QRIS" is how money ARRIVES and a
 * branch is who it arrived at, both properties of the channel. Asking an account
 * for them produced a column of "Semua" and a column that repeated the account's
 * own name.
 *
 * SORTED FROM THE HEADERS, IN THE BROWSER (BO, 20 October 2026) — Kode, Masuk,
 * Keluar and Saldo. Like the lot tab of a stock card, this table is not paged:
 * every account the hook asked for (up to 100) is already in memory, so a client
 * sort orders the whole set. Until a header is clicked the rows keep the order
 * they arrived in. Money is compared in exact minor units (`toMinor`), never as
 * floats.
 */
export function CashBankAccountsTable({
  rows,
  loading,
}: {
  rows: CashBankAccountRow[];
  loading: boolean;
}) {
  const [sort, setSort] = useState<CashBankAccountSort>("default");
  const sorted = useMemo(() => sortCashBankAccounts(rows, sort), [rows, sort]);

  /*
    THE EMPTY STATE STAYS OUTSIDE THE TABLE, as it always has: with no account
    filed under the category there are no columns worth a header row, and the
    next step is in Pengaturan rather than here.
  */
  if (!loading && rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
        <p>Belum ada akun berkategori Kas &amp; Bank.</p>
        <p className="mt-1">
          Tambahkan kas atau rekening banknya di Pengaturan › Daftar Akun, lalu
          pilih kategori <strong>Kas &amp; Bank</strong> supaya muncul di sini.
        </p>
      </div>
    );
  }

  const totalMasuk = sumColumn(rows, "masuk");
  const totalKeluar = sumColumn(rows, "keluar");
  const totalSaldo = sumColumn(rows, "saldo");

  return (
    <DataTable
      columns={COLUMNS}
      rows={sorted}
      rowKey={({ account }) => account._id}
      sort={{ value: sort, options: SORT_OPTIONS, onChange: setSort }}
      loading={loading}
      footer={
        rows.length > 1 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={2} className="font-semibold text-foreground">
              Total
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums text-success">
              {formatMoney(totalMasuk)}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums text-foreground">
              {formatMoney(totalKeluar)}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums text-foreground">
              {formatMoney(totalSaldo)}
            </TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        ) : undefined
      }
    />
  );
}
