"use client";

import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
import { Printer } from "lucide-react";

import { Alert, Card, CheckRow, SelectField, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/features/purchasing";
import { useTenant } from "@/features/tenant";
import {
  RECEIPT_SIZES,
  RECEIPT_SIZE_LABELS,
  type ReceiptSize,
} from "@/features/pos/deviceSettings";

import { SALES_CRUMBS } from "../crumbs";
import { useCustomerInvoice } from "../hooks/useCustomerInvoice";
import { InvoiceSheet } from "./InvoiceSheet";
// The page-isolation mechanics, shared with the till's struk and the kwitansi.
import "@/features/pos/print/receipt.css";

/**
 * CETAK FAKTUR — a page, not a dialog. Follows `Layout/07e-invoice-print.html`.
 *
 * WHY IT HAS A URL. Printing is a task people come back to: the printer was out
 * of paper, the customer wants another copy, somebody else has to send it. A
 * dialog cannot be linked to, opened in a second tab, or handed to a colleague —
 * and it makes them find the invoice again before they can find the button.
 *
 * THE COPY THAT PRINTS IS STILL NOT THE ONE ON SCREEN, even though there is no
 * dialog to escape from now. `print/receipt.css` removes every direct child of
 * `body` except `[data-print-root]`, and on a dashboard page the sheet sits deep
 * inside the shell — so it needs lifting out either way. The portal is also what
 * keeps the sidebar, the heading and this page's own options off the paper.
 *
 * `flushSync` IS LOAD-BEARING. `window.print()` runs synchronously against
 * whatever is in the DOM at that instant; an ordinary `setState` would still be
 * queued and the page would print with no sheet on it at all.
 *
 * ALL THREE PAPERS. A4 for the copy a customer is sent, 80 mm and 58 mm for the
 * shop that prints it at the counter. The till's own struk does not cover this:
 * an invoice raised BY HAND has no sale behind it and therefore no receipt at
 * all, so a shop with only a thermal printer could not print an invoice.
 *
 * WHAT THE MOCKUP HAS THAT THIS DOES NOT, and why — stated rather than quietly
 * dropped:
 *
 *   BAHASA (Indonesia / English). The whole product is Bahasa by rule
 *   (docs/ui-rules.md §12). An English invoice is a real thing a B2B shop may
 *   want, but it is a decision about the DOCUMENT, not a toggle on a print
 *   screen — every label on the sheet would need a second copy nobody has
 *   written.
 *
 *   "INFO REKENING" as a toggle. The bank line comes from the shop's own footer
 *   note in Setelan Toko and already prints only when it is set. A second switch
 *   over it would be two places deciding one thing.
 */
export function InvoicePrintScreen({ invoiceId }: { invoiceId: string }) {
  const { invoice, loading, error, notFound } = useCustomerInvoice(invoiceId);
  const { tenant } = useTenant();

  const [printing, setPrinting] = useState(false);
  /*
    THE TWO OPTIONS THAT MAP TO SOMETHING REALLY ON THE SHEET. Both default ON,
    because both are what a customer usually wants to see; turning one off is the
    exception, and an option that starts off is one nobody discovers.
  */
  const [showPayments, setShowPayments] = useState(true);
  const [showSignature, setShowSignature] = useState(true);
  /*
    A4 BY DEFAULT, and NOT the till's stored paper size.

    An invoice is the copy a customer is sent, and A4 is the layout that carries
    the full table. Reusing the till's per-device preference would couple two
    printers that are usually different machines — a thermal head at the counter
    and an A4 printer in the office — so changing what a receipt prints on would
    silently change what an invoice prints on.

    Per print rather than remembered, for the same reason: the shop that needs
    thermal picks it, which is one click, and nothing about that choice should
    outlive the sheet it was made for.
  */
  const [size, setSize] = useState<ReceiptSize>("a4");

  function print() {
    if (!invoice) return;

    const previousTitle = document.title;

    flushSync(() => setPrinting(true));
    document.title = `Faktur ${invoice.invoiceNumber}`;

    /*
      `afterprint` rather than the line after `print()`. Chrome blocks until the
      dialog closes, Safari does not — restoring unconditionally there would tear
      the sheet out of the page while the dialog was still open.
    */
    window.addEventListener(
      "afterprint",
      () => {
        document.title = previousTitle;
        setPrinting(false);
      },
      { once: true },
    );

    window.print();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat faktur…
      </div>
    );
  }

  if (notFound || !invoice) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="error">
          {error ?? "Faktur ini tidak ada, atau bukan milik toko Anda."}
        </Alert>
        <Button variant="secondary" asChild className="self-start">
          <Link href="/dashboard/sales">Kembali ke daftar faktur</Link>
        </Button>
      </div>
    );
  }

  const sheet = (
    <InvoiceSheet
      invoice={invoice}
      tenant={tenant}
      showPayments={showPayments}
      showSignature={showSignature}
      size={size}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          crumbs={[
            ...SALES_CRUMBS,
            { label: invoice.invoiceNumber, href: `/dashboard/sales/${invoiceId}` },
            { label: "Cetak" },
          ]}
          title="Cetak Faktur"
        >
          {`${invoice.invoiceNumber} · ${invoice.customerName ?? "Pelanggan terhapus"}`}
        </PageHeading>

        {/*
          THE PRINT BUTTON AT THE HEAD as well as in the options card. Somebody
          who came here to print and change nothing should not have to read down
          the page to find the one thing they came for.
        */}
        <Button type="button" onClick={print}>
          <Printer className="size-4" />
          Cetak
        </Button>
      </div>

      {error && <Alert variant="warning">{error}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px] lg:items-start">
        {/*
          THE PAPER, on a tinted frame so the edge of the sheet is visible. The
          mockup does the same: without it the white page floats on a white
          background and nobody can tell where the margin is.
        */}
        <div className="rounded-xl border border-border bg-surface-hover p-4">
          {/*
            THE PREVIEW IS THE SHAPE OF THE PAPER. A thermal sheet shown at full
            page width looks like a badly-formatted A4 and tells nobody whether
            it will fit the roll — which is the one thing this preview is for.
            The widths mirror `print/receipt.css`: 48 mm and 72 mm of printable
            area, at roughly 3.8px per mm on screen.
          */}
          <div
            className="mx-auto rounded-md bg-surface shadow-md"
            style={
              size === "a4"
                ? undefined
                : { width: size === "58" ? 260 : 340 }
            }
          >
            {sheet}
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-20">
          <Card title="Opsi cetak">
            <div className="flex flex-col gap-4">
              {/*
                A SHORT CLOSED LIST that needs no searching — `SelectField`, not
                the searchable picker (ui-rules §16).
              */}
              <SelectField
                label="Format"
                value={size}
                onChange={(value) => setSize(value as ReceiptSize)}
                options={RECEIPT_SIZES.map((value) => ({
                  value,
                  label:
                    value === "a4"
                      ? "A4 — faktur penagihan"
                      : `Thermal ${RECEIPT_SIZE_LABELS[value]}`,
                }))}
                hint={
                  size === "a4"
                    ? "Lembar penuh dengan tabel barang — untuk dikirim ke pelanggan."
                    : "Struk gulungan. Barisnya ditumpuk karena tabel tidak muat selebar ini."
                }
              />

              <div className="flex flex-col gap-2">
                <CheckRow
                  label="Riwayat pembayaran"
                  description="Setiap pembayaran yang sudah masuk, satu baris masing-masing."
                  checked={showPayments}
                  onCheckedChange={setShowPayments}
                />
                {/*
                  DISABLED ON A ROLL rather than quietly doing nothing. Nobody
                  signs a thermal slip, and a ruled line across 48 mm is wasted
                  paper — so the switch says why instead of being a control that
                  changes nothing when clicked.
                */}
                <CheckRow
                  label="Kolom tanda tangan"
                  description={
                    size === "a4"
                      ? "Ruang tanda tangan dan stempel di kaki lembar."
                      : "Hanya untuk A4 — struk gulungan tidak ditandatangani."
                  }
                  checked={size === "a4" && showSignature}
                  onCheckedChange={setShowSignature}
                  disabled={size !== "a4"}
                />
              </div>

              <Button type="button" onClick={print} className="w-full">
                <Printer className="size-4" />
                Cetak
              </Button>

              {/*
                SAID HERE RATHER THAN AS A BUTTON. Every browser's print dialog
                already offers Save as PDF, and the filename it proposes is
                `document.title` — which is why the title becomes the invoice
                number for the length of the print.
              */}
              <p className="text-xs text-muted">
                Untuk PDF, pilih <strong>Save as PDF</strong> di dialog cetak
                browser. Nama berkasnya sudah diisi nomor faktur ini.
              </p>
            </div>
          </Card>

          {/*
            THE ONE THING SOMEBODY REPRINTING NEEDS TO KNOW, and the mockup says
            it too: the sheet carries what is owed TODAY, not the figure frozen
            when the invoice was raised. An invoice paid in instalments and
            reprinted must show today's balance, or the customer is handed a
            number that was true last month.
          */}
          <Alert variant="info">
            Sisa tagihan dicetak dari nilai <strong>terkini</strong>. Faktur yang
            sudah dicicil lalu dicetak ulang menampilkan sisa hari ini, bukan
            angka saat faktur terbit.
          </Alert>
        </div>
      </div>

      {/*
        WHAT ACTUALLY PRINTS. A direct child of `body`, so nothing positioned,
        transformed or scrolling sits between it and the paper — and so the
        sidebar, the heading and the options card stay off the page.
      */}
      {printing
        ? createPortal(<div data-print-root>{sheet}</div>, document.body)
        : null}
    </div>
  );
}
