"use client";

import { useEffect, useState } from "react";
import { Copy, Printer } from "lucide-react";

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

import { ReceiptPreview, type ReceiptSize } from "./ReceiptPreview";
import "../print/receipt.css";

const SIZES: { value: ReceiptSize; label: string }[] = [
  { value: "58", label: "58 mm" },
  { value: "80", label: "80 mm" },
  { value: "a4", label: "A4" },
];

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
  const [size, setSize] = useState<ReceiptSize>("80");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  /** The receipt as plain text, for a chat window. */
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
      "Terima kasih sudah mampir.",
    ];

    return lines.filter((line) => line !== null).join("\n");
  }

  async function copy() {
    if (!receipt) return;

    const text = asText(receipt);

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
            <div className="flex gap-2" role="group" aria-label="Ukuran kertas">
              {SIZES.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={size === option.value ? "default" : "secondary"}
                  aria-pressed={size === option.value}
                  onClick={() => setSize(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
              <ReceiptPreview receipt={receipt} size={size} />
            </div>

            {copied && (
              <p className="text-sm text-success">
                Struk sudah disalin. Tinggal tempel di WhatsApp.
              </p>
            )}

            {manualText && (
              <div className="space-y-1">
                <p className="text-sm text-muted">
                  Browsernya tidak mengizinkan salin otomatis. Blok teks di bawah
                  lalu salin sendiri.
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
            Salin untuk WhatsApp
          </Button>
          <Button
            type="button"
            onClick={() => window.print()}
            disabled={!receipt}
          >
            <Printer className="size-4" />
            Cetak
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
