"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/services/api-error";
import { productService } from "@/services/product.service";
import type { Product } from "@/types/inventory";

import { useStockTransfer } from "../hooks/useStockTransfer";
import { StockTransferForm } from "./StockTransferForm";

/**
 * Ubah transfer — the form, opened on a transfer that has not been received.
 *
 * THIS SCREEN DECIDES WHETHER THERE IS A FORM AT ALL. Only an in-transit
 * transfer can be corrected; a received one is immutable and a cancelled one is
 * over. A link to this route can outlive that — a bookmark, a tab left open
 * while somebody else pressed Terima — so the status is checked here, on a
 * fresh read, and the form is never rendered for a transfer the server would
 * refuse. The server refuses too (a 409), and that is the authority; this is
 * the same answer given before the person has retyped anything.
 *
 * THE PRODUCTS ARE LOADED BEFORE THE FORM OPENS. A line holds an id, and the row
 * beside it has to print a name and be checked against what the source shelf
 * holds — which on a new transfer the picker supplies. Here the lines start
 * filled in, so the catalogue rows come from this screen, one read each (a
 * transfer carries at most fifty).
 */
export function StockTransferEditScreen({
  transferId,
}: {
  transferId: string;
}) {
  const { transfer, loading, error, notFound } = useStockTransfer(transferId);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);

  const inTransit = transfer?.status === "in_transit";
  // Keyed on the document's id, not the object: `setTransfer` replaces it.
  const productIds = transfer ? transfer.items.map((i) => i.productId) : [];
  const key = productIds.join(",");

  useEffect(() => {
    if (!inTransit || key === "") return;

    let active = true;

    Promise.all(key.split(",").map((id) => productService.getById(id)))
      .then((rows) => {
        if (active) setProducts(rows);
      })
      .catch((err) => {
        if (!active) return;
        setProductsError(
          err instanceof ApiError ? err.message : "Produk gagal dimuat.",
        );
      });

    return () => {
      active = false;
    };
  }, [inTransit, key]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat transfer…
      </div>
    );
  }

  if (error || productsError) {
    return <Alert variant="error">{error ?? productsError}</Alert>;
  }

  if (notFound || !transfer) {
    return (
      <Alert variant="error">
        Transfer ini tidak ditemukan, atau bukan milik toko Anda.
      </Alert>
    );
  }

  if (!inTransit) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="warning">
          {transfer.transferNumber}{" "}
          {transfer.status === "received"
            ? "sudah diterima, jadi tidak bisa diubah. Kalau ada yang keliru, koreksi dengan transfer balik."
            : "sudah dibatalkan, jadi tidak bisa diubah."}
        </Alert>
        <Button variant="secondary" asChild className="self-start">
          <Link href={`/dashboard/inventory/transfers/${transfer._id}`}>
            Kembali ke transfer
          </Link>
        </Button>
      </div>
    );
  }

  if (products === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat produk…
      </div>
    );
  }

  return <StockTransferForm transfer={transfer} products={products} />;
}
