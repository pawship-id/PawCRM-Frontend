"use client";

import { useState } from "react";
import { Camera } from "lucide-react";

import { TextField } from "@/components";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { productService } from "@/services/product.service";
import { productBatchService } from "@/services/productBatch.service";
import type { Product, ProductBatch } from "@/types/inventory";

import { BarcodeCameraDialog, type ScanStatus } from "./BarcodeCameraDialog";

/**
 * Why a scanned product cannot go on an invoice — or null when it can.
 *
 * SAID HERE, BEFORE THE ROW EXISTS, rather than by the server after the whole
 * form is filled in. The server refuses a bundle ("cannot be invoiced yet"),
 * and a line with no price comes back as a validation error about `unitPrice`
 * that nobody at the counter can act on.
 */
function refusal(product: Product): string | null {
  if (!product.isActive) {
    return `${product.name} sudah nonaktif, jadi tidak bisa ditagih.`;
  }
  if (product.productType === "bundle") {
    return `${product.name} adalah paket (bundle) — belum bisa ditagih lewat faktur.`;
  }
  if (product.productType === "parent") {
    return `${product.name} punya varian — scan barcode variannya.`;
  }
  if (product.sellPrice === null) {
    return `${product.name} belum punya harga jual. Isi dulu di katalog.`;
  }
  return null;
}

/**
 * Why a scanned LOT cannot put its product on this invoice — or null.
 *
 * THE WAREHOUSE IS THE WHOLE POINT, the same rule the till keeps: a lot lives at
 * one warehouse, and the invoice takes its stock out of the one in its header.
 * A carton labelled at Gudang Timur billed from Gudang Pusat would cut stock
 * from a shelf it never left. So no warehouse yet is a refusal too — there is
 * nothing to compare the lot with.
 *
 * AN EXPIRED LOT IS REFUSED, because the carton being scanned IS that lot.
 * Stock is still drawn FEFO at posting; this only stops somebody billing the
 * expired goods in their hand.
 */
function lotRefusal(
  batch: ProductBatch,
  warehouseId: string,
  warehouseName: string | undefined,
): string | null {
  const home = batch.warehouseName ?? "gudang lain";

  if (!warehouseId) {
    return `Pilih gudang dulu — batch ${batch.batchCode} tersimpan di ${home}, dan stoknya harus keluar dari gudang yang sama.`;
  }
  if (batch.warehouseId !== warehouseId) {
    return `Batch ${batch.batchCode} ada di ${home}, bukan di ${warehouseName ?? "gudang faktur ini"}.`;
  }
  if (batch.expiryDate && new Date(batch.expiryDate).getTime() < Date.now()) {
    const day = new Date(batch.expiryDate).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return `Batch ${batch.batchCode} sudah kedaluwarsa (${day}) — jangan dijual.`;
  }
  return null;
}

/** A lookup that answers "not this kind of code" with null instead of a 404. */
async function orNotFound<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Scan a product's barcode OR a lot's label straight onto the bill — with a
 * counter scanner, or with the device's camera.
 *
 * ONE FIELD FOR BOTH, because the scanner cannot tell them apart: it types
 * whatever is printed. The product barcode is tried first, since that is what
 * most packaging carries; a 404 there falls through to the lot codes printed by
 * Cetak label batch. A lot names its product, and that product goes on the
 * bill — invoices carry no lot, stock is drawn FEFO when the invoice posts,
 * exactly as at the till.
 *
 * A SCANNER IS A KEYBOARD. It types the code and ends with Enter, so the field
 * needs no driver and no library. What it does need is `preventDefault` on that
 * Enter: this field sits inside the invoice's `<form>`, and an Enter there
 * would submit it.
 *
 * THE CAMERA IS THE FALLBACK for a counter without a scanner, in its own
 * dialog, and it feeds the same lookup — so both paths refuse the same things
 * with the same words.
 *
 * STRAIGHT ONTO THE BILL, not into a picker: the product is known exactly, so a
 * dialog asking somebody to tick what they just scanned would be a click with
 * nothing to decide. Decided 12 Sep 2026 on request.
 */
export function InvoiceBarcodeScan({
  onProduct,
  warehouseId,
  warehouseName,
  disabled = false,
}: {
  /** Called with a product that may be billed. Adds a row, or one more of it. */
  onProduct: (product: Product) => void;
  /** The invoice's warehouse — a scanned lot must live there. "" when unset. */
  warehouseId: string;
  /** Its name, for the refusal that says which warehouse the lot is not in. */
  warehouseName?: string;
  disabled?: boolean;
}) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<ScanStatus>(null);
  const [camera, setCamera] = useState(false);

  function accept(product: Product, message: string) {
    const refused = refusal(product);

    if (refused) {
      setStatus({ tone: "error", text: refused });
      return;
    }

    onProduct(product);
    setStatus({ tone: "success", text: message });
  }

  async function lookup(raw: string) {
    const scanned = raw.trim();
    if (!scanned) return;

    try {
      // Exact match on the server — a prefix would hand over the wrong item
      // when one code is another's prefix.
      const product = await orNotFound(productService.getByBarcode(scanned));

      if (product) {
        accept(product, `${product.name} masuk ke faktur.`);
        return;
      }

      const batch = await orNotFound(productBatchService.lookup(scanned));

      if (!batch) {
        setStatus({
          tone: "error",
          text: `Kode ${scanned} tidak cocok dengan barcode produk maupun kode batch mana pun.`,
        });
        return;
      }

      const refused = lotRefusal(batch, warehouseId, warehouseName);

      if (refused) {
        setStatus({ tone: "error", text: refused });
        return;
      }

      const lotProduct = await productService.getById(batch.productId);

      accept(
        lotProduct,
        Number(batch.qtyRemaining) > 0
          ? `${lotProduct.name} (batch ${batch.batchCode}) masuk ke faktur.`
          : // The carton is in somebody's hand, so the product still goes on —
            // and the books saying the lot is empty is worth knowing.
            `${lotProduct.name} masuk ke faktur — batch ${batch.batchCode} tercatat habis, jadi stoknya diambil dari batch lain di gudang ini.`,
      );
    } catch (error) {
      setStatus({
        tone: "error",
        text:
          error instanceof ApiError && error.status === 403
            ? `Kode ${scanned} bukan barcode produk, dan akun ini tidak punya akses membaca batch.`
            : "Kode gagal dicek. Coba scan lagi.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <TextField
            label="Scan barcode atau batch"
            name="scanBarcode"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // A scanner ends every code with Enter, and inside the invoice's
              // form that would submit it.
              event.preventDefault();
              const scanned = code;
              // Cleared at once, so the next scan types into an empty field
              // rather than onto the end of this one.
              setCode("");
              void lookup(scanned);
            }}
            placeholder="Scan barcode produk atau label batch, lalu Enter"
            autoComplete="off"
            disabled={disabled}
          />
        </div>

        <Button
          type="button"
          variant="secondary"
          className="h-11"
          onClick={() => setCamera(true)}
          disabled={disabled}
        >
          <Camera className="size-4" />
          Scan pakai kamera
        </Button>
      </div>

      {status && (
        <p
          aria-live="polite"
          className={cn(
            "text-sm",
            status.tone === "error"
              ? "font-semibold text-danger"
              : "text-success",
          )}
        >
          {status.text}
        </p>
      )}

      {camera && (
        <BarcodeCameraDialog
          onDetected={(scanned) => void lookup(scanned)}
          status={status}
          onClose={() => setCamera(false)}
        />
      )}
    </div>
  );
}
