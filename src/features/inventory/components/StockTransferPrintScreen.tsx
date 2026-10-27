"use client";

import { useState } from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
import { Printer } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/features/purchasing";

import { useStockTransfer } from "../hooks/useStockTransfer";
import { TransferDeliveryNote } from "./TransferDeliveryNote";
// The page-isolation mechanics, shared with the till's struk and the faktur.
import "@/features/pos/print/receipt.css";

/**
 * CETAK SURAT JALAN — a page, not a dialog, for the reason Cetak Faktur is one.
 *
 * Printing is a task people come back to: the printer was out of paper, the
 * driver wants a second copy, the receiving warehouse asks for one by number.
 * A dialog cannot be linked to or opened in a second tab, and it makes people
 * find the transfer again before they can find the button.
 *
 * THE COPY THAT PRINTS IS NOT THE ONE ON SCREEN. `print/receipt.css` removes
 * every direct child of `body` except `[data-print-root]`, and on a dashboard
 * page the sheet sits deep inside the shell — so it is lifted out by a portal
 * for the length of one print. `flushSync` is load-bearing: `window.print()`
 * runs against whatever is in the DOM at that instant, and an ordinary
 * `setState` would still be queued, printing the page with no sheet on it.
 *
 * ANY STATUS PRINTS. A received transfer's note is wanted as often as an
 * in-transit one's — an auditor asks, or the receiving end lost theirs. A
 * cancelled one prints too, and says so across the top rather than being
 * refused: a driver already holding the old paper is better served by finding
 * out it is void than by a screen that will not open.
 *
 * NO OPTIONS. The note is one fixed document that shops already hold in the same
 * shape; there is nothing to choose between, so there is no options card and no
 * paper size. A control that changes nothing is worse than none. The one Cetak
 * button is at the head of the page.
 */
export function StockTransferPrintScreen({
  transferId,
}: {
  transferId: string;
}) {
  const { transfer, loading, error, notFound } = useStockTransfer(transferId);
  const [printing, setPrinting] = useState(false);

  function print() {
    if (!transfer) return;

    const previousTitle = document.title;

    flushSync(() => setPrinting(true));
    // The filename the browser proposes for Save as PDF.
    document.title = `Surat Jalan ${transfer.transferNumber}`;

    // `afterprint` rather than the line after `print()`: Chrome blocks until the
    // dialog closes, Safari does not — restoring unconditionally there would
    // tear the sheet out while the dialog was still open.
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
        <Spinner /> Memuat surat jalan…
      </div>
    );
  }

  if (notFound || !transfer) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="error">
          {error ?? "Transfer ini tidak ada, atau bukan milik toko Anda."}
        </Alert>
        <Button variant="secondary" asChild className="self-start">
          <Link href="/dashboard/inventory/transfers">
            Kembali ke daftar transfer
          </Link>
        </Button>
      </div>
    );
  }

  const sheet = <TransferDeliveryNote transfer={transfer} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading
          crumbs={[
            { label: "Inventori", href: "/dashboard/inventory" },
            {
              label: "Transfer Stok",
              href: "/dashboard/inventory/transfers",
            },
            {
              label: transfer.transferNumber,
              href: `/dashboard/inventory/transfers/${transfer._id}`,
            },
            { label: "Surat jalan" },
          ]}
          title="Cetak Surat Jalan"
        >
          {`${transfer.transferNumber} · ${transfer.fromWarehouseName ?? "—"} → ${transfer.toWarehouseName ?? "—"}`}
        </PageHeading>

        <Button type="button" onClick={print}>
          <Printer className="size-4" />
          Cetak
        </Button>
      </div>

      {/* SAID ON THE SCREEN, because the sheet itself is the shops' fixed shape
          and carries no status. Anything but "belum diterima" is something the
          person printing should know before the paper is out of the machine. */}
      {transfer.status === "cancelled" && (
        <Alert variant="warning">
          Transfer ini sudah <b>dibatalkan</b>. Surat jalan yang dicetak dari
          sini tidak lagi menggambarkan barang yang berjalan.
        </Alert>
      )}

      {transfer.items.length === 0 && (
        <Alert variant="warning">
          Transfer ini tidak punya barang untuk dicetak.
        </Alert>
      )}

      {/* THE PAPER, on a tinted frame so the edge of the sheet is visible —
          without it the white page floats on a white background. */}
      <div className="rounded-xl border border-border bg-surface-hover p-4">
        <div className="mx-auto max-w-4xl rounded-md bg-white shadow-md">
          {sheet}
        </div>
      </div>

      {/* HIDDEN ON SCREEN. The portal puts the sheet at the end of `body` so the
          print stylesheet can keep it and drop everything else — but while the
          print dialog is open the page behind it is still the SCREEN, and an
          unstyled sheet there shows up as a second "Surat Jalan" under the
          dashboard. `hidden print:block` shows it to the printer only. */}
      {printing
        ? createPortal(
            <div data-print-root className="hidden print:block">
              {sheet}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
