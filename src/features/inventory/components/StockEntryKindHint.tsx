"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { StockEntryKind } from "@/types/inventory";

/**
 * The note each hand-typed stock document carries about the OTHER one.
 *
 * WHY IT EXISTS. Stok Awal and Penyesuaian are the pair somebody chooses between
 * and the wrong choice is invisible until a P&L is read: opening stock credits
 * Modal / Saldo Awal, an adjustment credits Kerugian Persediaan. What used to
 * make the choice legible was the rail — the two rows sat one above the other —
 * and that adjacency is gone now that Penyesuaian is a tab of Koreksi Stok while
 * Stok Awal keeps its own row. Nothing else in either form mentioned the other.
 *
 * SO IT SITS ON THE FORM, not in the menu. The menu is where somebody chooses a
 * screen; the form is where they are still choosing what they are doing, and it
 * is the last place the choice is free to change.
 *
 * THE TWO NOTES ARE NOT MIRROR IMAGES, because the two mistakes are not
 * symmetrical. Typing an opening balance as an adjustment SAVES — it books a
 * shop's day-one inventory as a loss and nothing refuses it. The other way round
 * cannot: `POST /products/opening-stock` rejects a product that has already
 * moved in that warehouse, and the picker never offers one. So that note answers
 * the question the refusal raises — "why is my product not in the list?" —
 * rather than warning about a booking that cannot happen.
 */
const COPY: Record<
  StockEntryKind,
  { title: string; body: string; href: string; action: string }
> = {
  adjustment: {
    title: "Baru pertama kali mengisi stok di gudang ini?",
    body: "Stok pembuka dicatat lewat Stok Awal, yang menambah Persediaan dan Modal. Penyesuaian membukukan nilainya sebagai kerugian persediaan — laba rugi ikut turun, padahal tidak ada yang hilang.",
    href: "/dashboard/inventory/opening-stock/new",
    action: "Buka Stok Awal",
  },
  opening_balance: {
    title: "Produknya tidak muncul di daftar?",
    body: "Halaman ini hanya menerima produk yang belum pernah punya pergerakan di gudang ini. Kalau stoknya sudah pernah tercatat dan jumlahnya cuma perlu dikoreksi — rusak, hilang, atau salah hitung — itu penyesuaian, bukan stok awal.",
    href: "/dashboard/inventory/adjustments/new",
    action: "Buka Penyesuaian",
  },
};

export function StockEntryKindHint({ kind }: { kind: StockEntryKind }) {
  const copy = COPY[kind];

  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <p className="text-sm font-semibold text-foreground">{copy.title}</p>
      <p className="mt-1 max-w-prose text-sm text-muted">{copy.body}</p>
      <Link
        href={copy.href}
        className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-md text-sm font-semibold text-primary transition-colors hover:text-primary-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {copy.action}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
