"use client";

import Link from "next/link";

import { Alert, Card } from "@/components";
import { Badge } from "@/components/ui/badge";
// The shadcn button rather than the project wrapper: only this one takes
// `asChild`, which is what lets a Link be styled as a button without nesting an
// <a> inside a <button>.
import { Button } from "@/components/ui/button";
import type { ImportResult } from "@/types/productImport";

/**
 * Step 3: what actually landed.
 *
 * A REPORT, NOT A SUCCESS SCREEN, and the distinction is the reason this
 * component is not three lines long. An import can finish having created
 * everything, having created some things, and having created products whose
 * stock did not post — three outcomes that a green tick would render
 * identically.
 *
 * The two panels below exist for the two outcomes a green tick would hide:
 *
 *   failed[]                   — something raced the import. Everything
 *                                predictable was refused before any write, so
 *                                these are collisions that happened DURING it.
 *   openingStockPosted: false  — the product exists and its stock does not. The
 *                                backend deliberately does not fail a create
 *                                when the ledger refuses the opening balance,
 *                                and over five hundred rows this is invisible
 *                                unless it is put on screen.
 */
export function ImportResultPanel({
  result,
  onReset,
}: {
  result: ImportResult;
  onReset: () => void;
}) {
  const unposted = result.created.filter(
    (entry) => entry.openingStockPosted === false,
  );

  /**
   * THREE OUTCOMES, NOT TWO, and collapsing them was a real bug rather than a
   * simplification: a run where nothing failed but some stock did not post was
   * reported as "selesai sebagian … 0 gagal", which contradicts itself and
   * points the user at a failure that never happened.
   *
   *   failed    — some products were not created. The serious one.
   *   unposted  — every product exists; some opening balances did not post.
   *   clean     — everything landed.
   */
  const outcome =
    result.failed.length > 0
      ? "failed"
      : unposted.length > 0
        ? "unposted"
        : "clean";

  return (
    <div className="flex flex-col gap-4">
      {/*
        ONE <p>, ALWAYS. `AlertDescription` is a `grid gap-1`, so every element
        child becomes its own grid ROW — a bare <strong> in this slot renders on
        a line of its own and the sentence comes apart. Wrapping the whole
        message in a single block keeps it a sentence.
      */}
      <Alert variant={outcome === "clean" ? "success" : "error"}>
        {outcome === "clean" && (
          <p>
            Selesai. <strong>{result.summary.createdCount}</strong> entri produk
            dibuat
            {result.warehouseName ? (
              <>
                , stok awal masuk ke <strong>{result.warehouseName}</strong>
              </>
            ) : null}
            .
          </p>
        )}

        {outcome === "unposted" && (
          <p>
            Produk berhasil dibuat —{" "}
            <strong>{result.summary.createdCount}</strong> entri. Tapi stok awal{" "}
            <strong>{unposted.length}</strong> di antaranya belum tercatat di
            buku. Lihat rinciannya di bawah.
          </p>
        )}

        {outcome === "failed" && (
          <p>
            Import selesai sebagian.{" "}
            <strong>{result.summary.createdCount}</strong> entri dibuat,{" "}
            <strong>{result.summary.failedCount}</strong> gagal. Yang sudah
            masuk tetap ada — baca rinciannya di bawah sebelum mengulang.
          </p>
        )}
      </Alert>

      {result.failed.length > 0 && (
        <Card
          title="Gagal dibuat"
          description="Baris ini ditolak saat penyimpanan — kemungkinan besar ada orang lain yang memakai SKU-nya barusan. Perbaiki di file, lalu unggah ulang baris ini saja."
        >
          <ul className="flex flex-col gap-2 text-sm">
            {result.failed.map((entry) => (
              <li key={entry.sku} className="flex flex-col gap-0.5">
                <span className="tabular-nums text-xs">
                  {entry.sku}{" "}
                  <span className="text-muted">
                    (baris {entry.rowNumbers.join(", ")})
                  </span>
                </span>
                <span className="text-destructive">{entry.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {unposted.length > 0 && (
        <Card
          title="Produk dibuat, stok awal belum tercatat"
          description="Produknya ada di katalog, tapi jumlah awalnya tidak masuk ke buku. Jangan diimpor ulang — SKU-nya sudah terpakai dan akan ditolak."
        >
          <ul className="flex flex-col gap-2 text-sm">
            {unposted.map((entry) => (
              <li key={entry.productId} className="flex flex-col gap-0.5">
                <span className="tabular-nums text-xs">{entry.sku}</span>
                <span className="text-destructive">
                  {entry.openingStockError}
                </span>
              </li>
            ))}
          </ul>

          {/*
            TWO WAYS OUT, AND THEY ARE NOT INTERCHANGEABLE — which is why the
            missing-account case is called out rather than left to the generic
            advice below it.

            A manual adjustment credits 4901 Pendapatan Lain-lain: it books the
            goods as a GAIN. That is right for stock found in a count and wrong
            for stock the owner already had on day one, which is capital and
            belongs against 3101. So when the ledger refused because an account is
            missing, adding the account and posting a proper opening balance is
            the correct repair; reaching for the adjustment screen would file the
            tenant's entire starting inventory as profit.
          */}
          {unposted.some((entry) =>
            /missing account/i.test(entry.openingStockError ?? ""),
          ) && (
            <p className="mt-4 text-sm text-muted">
              Pesan di atas menyebut akun yang belum ada di Chart of Accounts.
              Lengkapi dulu akunnya — mencatat lewat Penyesuaian Stok akan
              membukukan barang ini sebagai{" "}
              <strong>pendapatan lain-lain</strong>, padahal barang yang sudah
              Anda miliki sejak awal itu <strong>modal</strong>.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" asChild>
              <Link href="/dashboard/keuangan/chart-of-accounts">
                Cek Chart of Accounts
              </Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/dashboard/inventory/opening-stock">
                Isi Stok Awal
              </Link>
            </Button>
          </div>
        </Card>
      )}

      <Card title="Yang dibuat">
        <ul className="flex flex-col gap-2 text-sm">
          {result.created.map((entry) => (
            <li key={entry.productId} className="flex items-center gap-2">
              <Badge variant="outline">
                {entry.kind === "family" ? "Varian" : "Produk"}
              </Badge>
              <Link
                href={`/dashboard/inventory/products/${entry.productId}`}
                className="font-medium hover:underline"
              >
                {entry.name}
              </Link>
              <span className="tabular-nums text-xs text-muted">
                {entry.sku}
              </span>
              {entry.variantCount > 0 && (
                <span className="text-xs text-muted">
                  {entry.variantCount} varian
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex gap-2">
        <Button asChild>
          <Link href="/dashboard/inventory/products">Lihat katalog</Link>
        </Button>
        <Button variant="secondary" onClick={onReset}>
          Import file lain
        </Button>
      </div>
    </div>
  );
}
