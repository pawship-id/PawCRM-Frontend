"use client";

import { useEffect, useState } from "react";

import { Spinner } from "@/components";
import { posService } from "@/services/pos.service";
import type { PublicReceipt } from "@/types/api";

import { DEFAULT_RECEIPT_SIZE } from "../deviceSettings";
import { ReceiptPreview } from "./ReceiptPreview";
import "../print/receipt.css";

/**
 * The receipt as its customer sees it (FR-8).
 *
 * WHAT MAKES THIS DIFFERENT from the till's copy is who is reading it. There is
 * no shift, no permission and no session — and no way to act on the sale, which
 * is why nothing here offers one. It is a document, not a screen.
 *
 * 80 mm WHATEVER THE READER'S DEVICE. The paper size is the SHOP's printer
 * setting (`deviceSettings`), and a customer's phone has never had one — reading
 * a stranger's browser for a shop's printer would be meaningless. 80 mm is the
 * narrow layout, which is also the right one on a phone.
 *
 * NOTHING DISTINGUISHES "no such receipt" FROM "not paid for", matching what the
 * server answers: telling somebody their guess named a real sale is more than an
 * anonymous caller should learn.
 */
export function PublicReceiptScreen({ token }: { token: string }) {
  const [receipt, setReceipt] = useState<PublicReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    posService
      .publicReceipt(token)
      .then((result) => {
        if (active) setReceipt(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat struk…
        </div>
      )}

      {failed && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <h1 className="text-lg font-bold">Struk ini tidak ditemukan.</h1>
          <p className="mt-1 text-sm text-muted">
            Tautannya mungkin salah ketik atau sudah tidak berlaku. Minta lagi
            ke petshop-nya, ya.
          </p>
        </div>
      )}

      {receipt && (
        <>
          {/*
            A VOIDED SALE STILL OPENS (FR-11) — somebody holding the original
            slip may reasonably come back to it — but it must say so. A customer
            reading a cancelled sale as a valid one is worse than the link
            failing outright.
          */}
          {receipt.status === "void" && (
            <p className="rounded-xl bg-tint-danger px-4 py-3 text-sm font-medium text-danger-ink">
              Transaksi ini sudah dibatalkan.
            </p>
          )}

          <div className="overflow-hidden rounded-xl border border-border">
            <ReceiptPreview receipt={receipt} size={DEFAULT_RECEIPT_SIZE} />
          </div>

          <p className="text-center text-sm text-muted">
            Struk ini dikirim oleh {receipt.header.tenantName}. Simpan tautannya
            kalau sewaktu-waktu perlu dibuka lagi.
          </p>
        </>
      )}
    </main>
  );
}
