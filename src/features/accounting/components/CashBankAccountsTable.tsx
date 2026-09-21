"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can } from "@/features/permissions";
import { formatMoney } from "@/utils/decimal";

import {
  sumColumn,
  type CashBankAccountRow,
} from "../hooks/useCashBankAccounts";

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
 * of number in one row, which is why the caption says so rather than leaving it
 * to be worked out from the column names — and why Σ saldo is NOT Σ masuk − Σ
 * keluar plus anything on this screen: the balance carries every period before
 * this one too.
 *
 * NO TIPE AND NO CABANG COLUMN, unlike the channel table this replaces. An
 * account has neither: "Tunai / Transfer / QRIS" is how money ARRIVES and a
 * branch is who it arrived at, both properties of the channel. Asking an account
 * for them produced a column of "Semua" and a column that repeated the account's
 * own name.
 */
export function CashBankAccountsTable({
  rows,
  loading,
}: {
  rows: CashBankAccountRow[];
  loading: boolean;
}) {
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
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Akun</TableHead>
              <TableHead className="text-right">Masuk</TableHead>
              <TableHead className="text-right">Keluar</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ account, masuk, keluar, saldo }) => (
              <TableRow key={account._id}>
                {/* tabular-nums so the codes line up — ui-rules §5. */}
                <TableCell className="tabular-nums whitespace-nowrap text-muted">
                  {account.code}
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {account.name}
                </TableCell>
                <TableCell className="text-right tabular-nums text-success">
                  {formatMoney(masuk)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-foreground">
                  {formatMoney(keluar)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <b className="font-semibold text-foreground">
                    {formatMoney(saldo)}
                  </b>
                </TableCell>
                <TableCell>
                  {/* ui-rules §9: pale named tint, saturated ink, no visible
                      border — a status is not a button. */}
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
                </TableCell>
                <TableCell>
                  {/*
                    THE ACCOUNT IS EDITED WHERE ACCOUNTS ARE EDITED. A chart of
                    accounts has one form, in Pengaturan; a second one reachable
                    from a report is how two screens start disagreeing about what
                    a category means.
                  */}
                  <div className="flex items-center justify-end gap-1">
                    <Can feature="chartOfAccounts" action="update">
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          href={`/dashboard/pengaturan/daftar-akun/${account._id}/edit`}
                        >
                          <Pencil className="size-4" />
                          Ubah
                        </Link>
                      </Button>
                    </Can>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 1 && (
            <TableFooter>
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
            </TableFooter>
          )}
        </Table>
      </div>

      <p className="mt-3 text-sm text-muted">
        Masuk dan Keluar dihitung untuk periode yang dipilih. Saldo adalah posisi
        di akhir periode — termasuk semua periode sebelumnya, jadi bukan selisih
        dua kolom di sebelahnya.
      </p>
    </>
  );
}
