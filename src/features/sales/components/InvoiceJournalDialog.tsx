"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermissions } from "@/features/permissions";
import { formatMoney } from "@/utils/decimal";
import type { CustomerInvoiceDetail } from "@/types/api";

import { JournalLink } from "@/components";

/**
 * What each entry IS, in the words a shopkeeper reads.
 *
 * Keyed on source type AND whether it reverses something, because those two
 * together are the whole taxonomy an invoice can produce — and a list of numbers
 * with no labels would make somebody open all of them to find the one they want.
 * An edited invoice adds nothing new to this list: each revision posts the same
 * two kinds of entry, and the edit that replaced it posts their reversals.
 */
const JOURNAL_ROLE: Record<string, string> = {
  "invoice:false": "Penerbitan",
  "invoice_cogs:false": "HPP",
  "invoice:true": "Pembalik penerbitan",
  "invoice_cogs:true": "Pembalik HPP",
  // A till-born invoice's entries belong to the SALE — see `belongsToSale`.
  "pos:false": "Penjualan kasir",
  "pos_cogs:false": "HPP kasir",
  "pos:true": "Pembalik penjualan",
  "pos_cogs:true": "Pembalik HPP kasir",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";

  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * THE ENTRIES THIS INVOICE RAISED, behind the ⋮ on its Rincian card — the
 * mockup's "Lihat jurnal".
 *
 * A DIALOG RATHER THAN A CARD, which is what it used to be. The postings are the
 * answer to "what did this debit", asked by the one person in the shop who keeps
 * the books; drawn as a card they pushed the payment history and the work panel
 * below the fold for everybody else who opened the invoice.
 *
 * NAMED HERE BECAUSE THEY CANNOT NAME THEMSELVES. An invoice's number is
 * allocated after its entries are posted — so a failed issue burns none — which
 * means the number is not in their descriptions and the ledger's search box
 * cannot find them by it.
 *
 * THE POSTINGS, NOT ONLY THE NUMBERS. Four entry numbers answer "which entries"
 * and nothing else; the accounts are the reason the entries are interesting. The
 * number stays beside each heading, linked when the reader may open the ledger.
 */
export function InvoiceJournalDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: CustomerInvoiceDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = usePermissions();
  const mayReadLedger = can("journalEntries", "read");
  const entries = invoice.journalEntries ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Jurnal faktur</DialogTitle>
          <DialogDescription>
            {invoice.posTransactionId
              ? `${invoice.invoiceNumber} — entri buku besar dari penjualan kasir yang menerbitkan faktur ini.`
              : `${invoice.invoiceNumber} — entri buku besar yang lahir dari faktur ini.`}
          </DialogDescription>
        </DialogHeader>

        {/*
          SAID PLAINLY FOR A TILL-BORN INVOICE. Those entries cover the WHOLE sale
          — the cash part too — not just the amount left on account, so a reader
          comparing their totals against this bill would find them larger and
          reasonably conclude something was wrong.
        */}
        {invoice.posTransactionId && (
          <p className="text-sm text-muted">
            Nilainya mencakup <strong>seluruh penjualan</strong>, termasuk bagian
            yang dibayar tunai — bukan hanya sisa yang jadi piutang ini.
          </p>
        )}

        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Belum ada jurnal yang tercatat untuk faktur ini.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {entries.map((entry) => (
              <section key={entry._id}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold">
                    {JOURNAL_ROLE[`${entry.sourceType}:${entry.isReversal}`] ??
                      "Entri"}{" "}
                    ·{" "}
                    <JournalLink
                      id={entry._id}
                      number={entry.entryNumber}
                      linked={mayReadLedger}
                    />
                  </span>
                  <span className="text-muted tabular-nums">
                    {formatDate(entry.date)}
                  </span>
                </div>

                {entry.lines.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Akun</TableHead>
                          <TableHead className="text-right">Debit</TableHead>
                          <TableHead className="text-right">Kredit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entry.lines.map((line, index) => (
                          <TableRow key={`${line.accountId}-${index}`}>
                            <TableCell
                              className={
                                line.debit === "0.0000" ? "pl-6" : undefined
                              }
                            >
                              {/* An account retired since the posting still
                                  shows its figures — dropping the row would make
                                  the entry stop balancing on screen. */}
                              {line.code ? (
                                <span className="tabular-nums">{line.code} </span>
                              ) : null}
                              {line.name ?? "Akun terhapus"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {line.debit === "0.0000"
                                ? "—"
                                : formatMoney(line.debit)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {line.credit === "0.0000"
                                ? "—"
                                : formatMoney(line.credit)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}

        {/*
          NOT "no journal was posted" for a receivable's payments. Each payment
          posts its own entry, and that entry is on the payment's page — this
          dialog is the invoice's own.
        */}
        <p className="text-sm text-muted">
          Tiap pembayaran memposting jurnalnya sendiri —{" "}
          <b>Dr rekening penerima / Cr 1103 Piutang Usaha</b> — dan bisa dilihat
          di halaman pembayarannya.
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
