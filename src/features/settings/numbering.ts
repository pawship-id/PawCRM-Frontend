import type { DocumentNumberSeries, DocumentNumberReset } from "@/types/api";

/**
 * Pengaturan › Nomor dokumen — the words for each series, and the preview the
 * form redraws while somebody is still typing (23 September 2026).
 *
 * THE SHAPES THEMSELVES COME FROM THE SERVER (`GET /tenants/me/numbering`). What
 * is here is UI copy and one pure function: a second copy of the registry would
 * drift the day a series is added, and the form would offer a shape the server
 * does not use.
 */

/** What each series is called on screen, and the document it numbers. */
export const SERIES_LABELS: Record<string, { label: string; hint: string }> = {
  customerInvoice: {
    label: "Faktur penjualan",
    hint: "Tagihan ke pelanggan, termasuk yang terbit otomatis dari kasir.",
  },
  booking: { label: "Booking", hint: "Grooming, hotel, dan antar-jemput." },
  goodsReceipt: {
    label: "Penerimaan barang",
    hint: "Satu pengiriman dari satu supplier masuk ke satu gudang.",
  },
  purchaseReturn: {
    label: "Retur ke supplier",
    hint: "Barang yang dikembalikan ke supplier.",
  },
  stockOpname: { label: "Opname", hint: "Lembar hitung stok fisik." },
  stockAdjustment: {
    label: "Koreksi stok",
    hint: "Penyesuaian yang diketik tangan, di luar opname.",
  },
  journalEntry: { label: "Jurnal", hint: "Entri buku besar." },
  posTransaction: { label: "Transaksi kasir", hint: "Struk di meja kasir." },
  posShift: { label: "Shift kasir", hint: "Satu shift dibuka sampai ditutup." },
  posReturn: { label: "Retur kasir", hint: "Barang yang dikembalikan pelanggan." },
  openingStock: { label: "Stok awal", hint: "Angka pembuka, diisi sekali." },
  customerPayment: {
    label: "Pembayaran (lama)",
    hint: "Seri lama. Tidak dipakai lagi; digantikan bukti kas & bank.",
  },
  cashReceipt: { label: "Bukti Kas Masuk", hint: "Uang masuk ke laci kas." },
  cashDisbursement: { label: "Bukti Kas Keluar", hint: "Uang keluar dari laci kas." },
  bankReceipt: { label: "Bukti Bank Masuk", hint: "Uang masuk ke rekening." },
  bankDisbursement: {
    label: "Bukti Bank Keluar",
    hint: "Uang keluar dari rekening.",
  },
};

/** A series the labels above have not caught up with reads as its own key. */
export function seriesLabel(key: string): { label: string; hint: string } {
  return SERIES_LABELS[key] ?? { label: key, hint: "" };
}

export const RESET_LABELS: Record<DocumentNumberReset, string> = {
  never: "Tidak pernah",
  yearly: "Tiap tahun",
  monthly: "Tiap bulan",
  daily: "Tiap hari",
};

/**
 * The period segment a number carries, for `reset` on `date` — the client half
 * of the server's `scopeFor`, and UTC for the same reason: the bucket is read
 * off the stored instant, not off where the reader happens to be sitting.
 */
function scopeFor(
  reset: DocumentNumberReset,
  scopeStyle: "long" | "short",
  date: Date,
): string {
  if (reset === "never") return "";

  const year = String(date.getUTCFullYear());
  if (reset === "yearly") return year;

  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  if (reset === "monthly") {
    return scopeStyle === "short" ? `${year.slice(-2)}${month}` : `${year}-${month}`;
  }

  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year.slice(-2)}${month}${day}`;
}

/**
 * What the next number would look like under the shape being typed.
 *
 * A PREVIEW OF A SHAPE, always sequence 1, matching the example the server
 * serves — it is not a peek at the counter, and the form says "contoh" rather
 * than "berikutnya" so nobody reads it as the number they are about to get.
 *
 * THE BRANCH SEGMENT IS LEFT OUT, as the server's own example leaves it out: an
 * invoice reads `INV/2609/0001` until the branch issuing it has a code, and a
 * preview that invented one would show a number no branch of this tenant uses.
 */
export function previewNumber(
  series: Pick<DocumentNumberSeries, "separator" | "scopeStyle">,
  shape: { prefix: string; reset: DocumentNumberReset; padding: number },
  now: Date = new Date(),
): string {
  const scope = scopeFor(shape.reset, series.scopeStyle, now);
  const sequence = "1".padStart(shape.padding, "0");

  return [shape.prefix, scope, sequence].filter(Boolean).join(series.separator);
}
