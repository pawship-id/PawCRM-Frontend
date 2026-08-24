"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

import { Alert, Button, Card, Spinner } from "@/components";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { productBatchService } from "@/services/productBatch.service";
import { ApiError } from "@/services/api-error";
import type { ProductBatch } from "@/types/inventory";
import { formatQty } from "@/utils/decimal";

/**
 * The printable label sheet — what turns a generated batch code into something
 * stuck on a carton.
 *
 * WHY IT EXISTS AT ALL. Lot codes became unique across the tenant so that they
 * could be scanned: a till reads the label, resolves it to exactly one lot, and
 * deducts from that lot instead of guessing by FEFO. A code nothing can print is
 * a code nothing can scan, so this page is the other half of that decision.
 *
 * BOTH SYMBOLOGIES, on every label. Code128 is what an ordinary counter scanner
 * reads without being configured for anything; a QR is what a phone reads, and
 * it survives a label that gets scuffed. They encode the SAME string — the
 * internal code, verbatim — so it does not matter which one somebody points at.
 *
 * THE HUMAN LINE MATTERS AS MUCH AS THE SYMBOL. A scanner that will not read a
 * damaged label leaves somebody typing the code, so it is printed underneath in
 * tabular figures, along with the product, the expiry and the supplier's own
 * batch number — the last being what a recall notice will name.
 *
 * WHY IT TAKES A LIST OF IDS rather than one. A transfer re-creates every lot it
 * moves under a NEW code at the destination (codes are unique, so the arriving
 * row cannot carry the source's), which means a five-line transfer needs five
 * labels reprinted in one go. Receiving a delivery is the same shape.
 */

/** Rendered at this width so a 60-character code still has quiet zones. */
const BARCODE_WIDTH = 1.6;
const BARCODE_HEIGHT = 44;

/** More than a shelf's worth is a mis-typed number, not an intention. */
const MAX_COPIES = 50;

/**
 * One Code128 barcode, drawn onto a canvas.
 *
 * A CANVAS RATHER THAN AN `<img>` OF A DATA URI, because a barcode has to print
 * at the printer's resolution: a rasterised image scaled by the browser is what
 * turns a crisp code into bars a scanner reads as a different number, or as
 * nothing.
 *
 * CODE128 SPECIFICALLY. It encodes the full ASCII range, so it can carry any
 * code this system has ever written — including the legacy ones with `:` and `/`
 * in them, which is exactly the set somebody is most likely to be reprinting.
 */
function Barcode({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        width: BARCODE_WIDTH,
        height: BARCODE_HEIGHT,
        // The code is printed under the symbol by this component, in the app's
        // own typeface and with the rest of the lot's details — so the library's
        // own caption would be a second, differently-styled copy of it.
        displayValue: false,
        margin: 0,
      });
    } catch {
      // A code Code128 cannot encode is not a reason to lose the label: the QR
      // and the printed line still identify the lot. Leaving the canvas blank
      // says that plainly.
    }
  }, [value]);

  return <canvas ref={ref} className="h-11 w-full" />;
}

/** The same string as a QR, for a phone camera. */
function QrCode({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;

    // Medium correction: enough to survive a scuffed label without making the
    // modules so small that a phone struggles at arm's length.
    void QRCode.toCanvas(ref.current, value, {
      width: 96,
      margin: 0,
      errorCorrectionLevel: "M",
    }).catch(() => {
      // Same reasoning as the barcode's: the printed line still names the lot.
    });
  }, [value]);

  return <canvas ref={ref} className="size-24" />;
}

function BatchLabel({ batch }: { batch: ProductBatch }) {
  return (
    <div className="flex break-inside-avoid gap-3 rounded-md border border-border bg-surface p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-sm font-bold">
          {batch.productName ?? "—"}
        </p>
        <p className="truncate text-xs text-muted tabular-nums">
          {batch.productSku ?? "—"}
          {batch.warehouseName && ` · ${batch.warehouseName}`}
        </p>
        <Barcode value={batch.batchCode} />
        {/* THE CODE IN PLAIN FIGURES, because a scanner that will not read a
            scuffed label leaves somebody typing it. */}
        <p className="text-sm font-semibold tabular-nums">{batch.batchCode}</p>
        <p className="text-xs text-muted tabular-nums">
          {batch.expiryDate
            ? `exp ${batch.expiryDate.slice(0, 10)}`
            : "tanpa tanggal kedaluwarsa"}
          {` · ${formatQty(batch.initialQty)}`}
        </p>
        {/* THEIRS, because a recall notice names the factory batch and not our
            row. A label without it cannot be matched to the notice. */}
        {batch.supplierBatchCode && (
          <p className="text-xs text-muted tabular-nums">
            supplier: {batch.supplierBatchCode}
          </p>
        )}
      </div>
      <QrCode value={batch.batchCode} />
    </div>
  );
}

export function BatchLabelSheet({ ids }: { ids: string[] }) {
  const [loaded, setLoaded] = useState<ProductBatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copies, setCopies] = useState("1");

  /**
   * DERIVED, not a state the effect has to write. "No ids" is a property of the
   * props, so answering it with a `setBatches([])` inside the effect would be a
   * render's worth of "still loading" for a page that already knows it has
   * nothing to load.
   */
  const batches = useMemo(
    () => (ids.length === 0 ? [] : loaded),
    [ids.length, loaded],
  );

  /**
   * Depended on as a STRING. `ids` is built fresh by the page on every render,
   * so an array in the dependency list is a new value each time and the effect
   * would refetch forever.
   */
  const key = ids.join(",");

  useEffect(() => {
    let alive = true;

    if (key === "") {
      return;
    }

    const lotIds = key.split(",");

    // ONE REQUEST PER LOT, and no bulk endpoint to replace them: the API reads
    // lots by id one at a time, and a print sheet is a handful of them opened
    // deliberately rather than a list somebody pages through. `allSettled`, so
    // one lot deleted since the link was made costs its own label rather than
    // the whole sheet.
    void Promise.allSettled(lotIds.map((id) => productBatchService.getById(id)))
      .then((results) => {
        if (!alive) return;

        const found = results
          .filter(
            (result): result is PromiseFulfilledResult<ProductBatch> =>
              result.status === "fulfilled",
          )
          .map((result) => result.value);

        setLoaded(found);
        setError(
          found.length === lotIds.length
            ? null
            : `${lotIds.length - found.length} batch tidak bisa dibuka — mungkin sudah dihapus.`,
        );
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Gagal memuat batch untuk dicetak.",
        );
        setLoaded([]);
      });

    return () => {
      alive = false;
    };
  }, [key]);

  /**
   * The sheet as it will print: each lot repeated `copies` times.
   *
   * COPIES ARE PER LOT rather than per sheet, because the number somebody wants
   * is "one per carton" and every lot on this sheet came off the same delivery
   * or the same transfer.
   */
  const sheet = useMemo(() => {
    const count = Math.min(
      Math.max(Number.parseInt(copies, 10) || 1, 1),
      MAX_COPIES,
    );

    return (batches ?? []).flatMap((batch) =>
      Array.from({ length: count }, (_unused, index) => ({
        batch,
        key: `${batch._id}-${index}`,
      })),
    );
  }, [batches, copies]);

  if (batches === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Menyiapkan label…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="error">{error}</Alert>}

      {/* Hidden from the print itself — a control on a label sheet is paper
          wasted, and `print:hidden` is how the rest of the app does it. */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="copies">Jumlah per batch</Label>
          <Input
            id="copies"
            inputMode="numeric"
            value={copies}
            onChange={(event) => setCopies(event.target.value)}
            className="w-28 tabular-nums"
          />
        </div>
        <Button onClick={() => window.print()} disabled={sheet.length === 0}>
          Cetak
        </Button>
        <Link
          href="/dashboard/inventory/batches"
          className="text-sm font-medium underline"
        >
          Kembali ke daftar batch
        </Link>
      </div>

      {sheet.length === 0 ? (
        <Card>
          <p className="py-6 text-sm text-muted">
            Belum ada batch yang dipilih.{" "}
            <Link
              href="/dashboard/inventory/batches"
              className="font-medium underline"
            >
              Pilih dari daftar batch →
            </Link>
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
          {sheet.map(({ batch, key }) => (
            <BatchLabel key={key} batch={batch} />
          ))}
        </div>
      )}
    </div>
  );
}
