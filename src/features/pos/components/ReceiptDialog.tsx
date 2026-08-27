"use client";

import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { Copy, Download, Printer } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { posService } from "@/services/pos.service";
import { formatMoney } from "@/utils/decimal";
import type { PosReceipt } from "@/types/api";

import {
  RECEIPT_SIZE_LABELS,
  useReceiptSize,
  type ReceiptSize,
} from "../deviceSettings";
import { ReceiptPreview } from "./ReceiptPreview";
import "../print/receipt.css";

/**
 * The receipt, after the money is taken (FR-8).
 *
 * IT OPENS BY ITSELF once a sale settles, and that is deliberate: the moment the
 * customer is still standing there is the only moment a receipt is worth
 * printing. Finding it later in a list is a different job.
 *
 * THE WHATSAPP BUTTON COPIES, IT DOES NOT SEND. FR-8 is explicit and the reason
 * is consent: sending a message to a customer's phone from a till is something
 * they agreed to with the shop, not with us. Copying puts the cashier in the
 * loop, where they can see what goes out.
 *
 * A BLOCKED CLIPBOARD IS NOT A DEAD END. Permission can be denied, and an
 * insecure origin has no clipboard API at all — so the text is shown in a
 * selectable box instead, which is the fallback FR-8 asks for.
 */
export function ReceiptDialog({
  saleId,
  onOpenChange,
}: {
  saleId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  /*
    THE DEVICE'S SIZE, READ ONLY (FR-8).

    It used to be `useState("80")` with three buttons under the header, which
    meant the cashier chose it again on every single receipt — the dialog closed
    and took the answer with it.

    THE BUTTONS ARE GONE RATHER THAN MADE TO STICK. Paper size follows the
    PRINTER plugged into this device; it does not change from one customer to the
    next, so offering it here was configuration in the wrong place — and once
    both this and Pengaturan Kasir wrote the same value, the settings dialog had
    no job of its own. One value, one place to change it.
  */
  const [size] = useReceiptSize();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
    THE SIZE BEING PRINTED RIGHT NOW, or null when nothing is.

    While this is set, the receipt is ALSO rendered into a node at the top level
    of the page (see the portal at the bottom of this component) and that copy is
    the one that prints — see `print/receipt.css` for why printing from inside
    the dialog could not be made to work.
  */
  const [printing, setPrinting] = useState<ReceiptSize | null>(null);
  const [copied, setCopied] = useState(false);
  const [manualText, setManualText] = useState<string | null>(null);

  useEffect(() => {
    if (!saleId) return;

    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    setCopied(false);
    setManualText(null);

    posService
      .receipt(saleId)
      .then((result) => {
        if (active) setReceipt(result);
      })
      .catch(() => {
        if (active) setError("Struk gagal dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [saleId]);

  /**
   * The link a customer opens their own receipt with (FR-8).
   *
   * BUILT FROM `window.location.origin` rather than from a configured base URL,
   * because the till and the receipt page are the same app: whatever host the
   * cashier is on is the host the customer must be sent to. A configured value
   * would be one more thing to get wrong per deployment, and getting it wrong
   * means every link sent that day leads nowhere.
   *
   * Null on a sale settled before 27 Agt, which has no token — those fall back
   * to the text below.
   */
  function linkFor(source: PosReceipt): string | null {
    if (!source.receiptToken) return null;

    return `${window.location.origin}/struk/${source.receiptToken}`;
  }

  /**
   * The receipt as plain text, for a chat window.
   *
   * STILL HERE, as the fallback for a sale that predates links. It was what the
   * button always copied, so nothing is lost for those — and a cashier reading a
   * message they can send by hand is better than a button that refuses.
   */
  function asText(source: PosReceipt): string {
    const lines = [
      source.header.tenantName,
      source.header.branchName,
      "",
      `No: ${source.transactionNumber ?? "-"}`,
      /*
        THE SAME CASHIER THE PAPER NAMES (FR-8). Two shapes of one receipt that
        disagree about who served the customer is worse than neither naming
        them — the customer would have a slip and a message with different
        answers to the same question.
      */
      source.cashierName ? `Kasir: ${source.cashierName}` : null,
      "",
      ...source.items.map(
        (item) => `${item.name} — ${formatMoney(item.lineTotal)}`,
      ),
      "",
      `Total: ${formatMoney(source.totals?.grandTotal ?? "0")}`,
      "",
      // The same closing line the paper prints — the server resolves the shop's
      // words or the standard ones, so this cannot drift from the slip.
      // The `||` stays as a guard against an older API, not as a fallback.
      source.header.receiptFooter || null,
    ];

    return lines.filter((line) => line !== null).join("\n");
  }

  /**
   * Print the receipt at one particular size (FR-8).
   *
   * THE COPY THAT PRINTS IS NOT THE ONE ON SCREEN. Setting `printing` renders a
   * second `ReceiptPreview` into a node attached straight to `document.body`,
   * and the stylesheet removes everything else on the page. The dialog's own
   * preview stays exactly as it is — see `print/receipt.css` for the two ways
   * printing from INSIDE the dialog went wrong before this.
   *
   * `flushSync` is load-bearing. `window.print()` runs synchronously against
   * whatever is in the DOM at that instant; an ordinary `setState` would still
   * be queued and the page would print with no receipt on it at all.
   *
   * THE FILENAME IS `document.title` — that is where every browser takes the
   * default from when somebody saves rather than prints — so it is swapped for
   * the length of the dialog and put back.
   */
  function printAt(target: ReceiptSize) {
    if (!receipt) return;

    const previousTitle = document.title;

    flushSync(() => setPrinting(target));
    document.title = `Struk ${receipt.transactionNumber ?? ""}`.trim();

    /*
      `afterprint` rather than the line after `print()`. Chrome blocks until the
      dialog closes, but Safari does not — restoring unconditionally there would
      tear the receipt back out of the page while the dialog was still open.
    */
    window.addEventListener(
      "afterprint",
      () => {
        document.title = previousTitle;
        setPrinting(null);
      },
      { once: true },
    );

    window.print();
  }

  async function copy() {
    if (!receipt) return;

    /*
      THE LINK IF THERE IS ONE, the text if there is not (FR-8 asks for the
      link). A link is the better thing to send: it stays readable in a chat
      window, it shows the shop's own header, and it keeps showing what is still
      owed on a credit sale — none of which a pasted block of text does.
    */
    const text = linkFor(receipt) ?? asText(receipt);

    try {
      // Absent entirely on an insecure origin, and rejectable even where it
      // exists — so both are handled the same way rather than only the throw.
      if (!navigator.clipboard) {
        throw new Error("no clipboard");
      }

      await navigator.clipboard.writeText(text);
      setCopied(true);
      setManualText(null);
    } catch {
      setManualText(text);
    }
  }

  return (
    <Dialog open={saleId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Struk</DialogTitle>
          <DialogDescription>
            {receipt?.transactionNumber ?? "Transaksi tersimpan."}
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="error">{error}</Alert>}

        {loading || !receipt ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Memuat struk…
          </div>
        ) : (
          <>
            <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
              <ReceiptPreview receipt={receipt} size={size} />
            </div>

            {/*
              WHERE THE SIZE WENT. Taking the three buttons away without saying
              so would leave a cashier looking at a receipt laid out wrong with
              nowhere obvious to go. A sentence, not a control — the fixing
              happens once, in the place that is about setting the till up.
            */}
            <p className="text-sm text-muted">
              Ukuran kertas: {RECEIPT_SIZE_LABELS[size]} · ubah di Pengaturan
              Kasir.
            </p>

            {copied && (
              <p className="text-sm text-success">
                {linkFor(receipt)
                  ? "Tautan struk sudah disalin. Tinggal tempel di WhatsApp."
                  : "Struk sudah disalin. Tinggal tempel di WhatsApp."}
              </p>
            )}

            {manualText && (
              <div className="space-y-1">
                <p className="text-sm text-muted">
                  Browsernya tidak mengizinkan salin otomatis. Blok teks di
                  bawah lalu salin sendiri.
                </p>
                <textarea
                  readOnly
                  value={manualText}
                  aria-label="Teks struk"
                  className="h-32 w-full rounded-lg border border-border bg-surface p-2 text-xs tabular-nums"
                />
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void copy()}
            disabled={!receipt}
          >
            <Copy className="size-4" />
            {/*
              NAMED FOR WHAT IT COPIES. It said "Salin untuk WhatsApp" while it
              copied a block of text, and a cashier pasting a link where they
              expected a receipt would think it had failed.
            */}
            {receipt?.receiptToken ? "Salin Link WA" : "Salin untuk WhatsApp"}
          </Button>
          {/*
            SAVE, not print. Same dialog underneath — the browser has no other
            door to a PDF — but a different destination, a different layout and a
            different name, which is what stops it being Cetak twice.
          */}
          {/*
            ALWAYS A4, whatever the till's printer is set to. A PDF is filed,
            e-mailed and read on a screen, and a 48 mm strip is the wrong shape
            for all three — which is also what stops this being Cetak twice.
          */}
          <Button
            type="button"
            variant="secondary"
            onClick={() => printAt("a4")}
            disabled={!receipt}
          >
            <Download className="size-4" />
            Unduh PDF
          </Button>
          {/* The printer actually plugged into this till. */}
          <Button
            type="button"
            onClick={() => printAt(size)}
            disabled={!receipt}
          >
            <Printer className="size-4" />
            Cetak
          </Button>
        </DialogFooter>
      </DialogContent>

      {/*
        WHAT ACTUALLY PRINTS (FR-8).

        A direct child of `body`, so it has no positioned, transformed or
        scrolling ancestor between it and the paper — which is the whole reason
        it exists rather than the stylesheet simply pointing at the preview
        above. `print/receipt.css` carries the two failures that led here.

        Present only while printing: an extra copy of the receipt sitting in the
        DOM the rest of the time would be read out by a screen reader as a second
        receipt.
      */}
      {printing && receipt
        ? createPortal(
            <div data-print-root>
              <ReceiptPreview receipt={receipt} size={printing} />
            </div>,
            document.body,
          )
        : null}
    </Dialog>
  );
}
