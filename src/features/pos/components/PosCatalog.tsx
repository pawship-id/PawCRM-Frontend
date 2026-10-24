"use client";

import { useState } from "react";
import { Camera, Search } from "lucide-react";

import {
  Alert,
  BarcodeCameraDialog,
  Pagination,
  Spinner,
  type ScanStatus,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchableCode } from "@/lib/batchLabel";
import { tillCatalog } from "../offline/tillApi";
import type { PosCatalogItem } from "@/types/api";

import { usePosCatalog } from "../hooks/usePosCatalog";
import { PosCategoryPills } from "./PosCategoryPills";
import { PosProductCard } from "./PosProductCard";

/**
 * The left half of the till: search, pills, grid, pager (FR-1).
 *
 * SEARCH IS PINNED ABOVE THE PILLS rather than inside a filter bar, because it
 * is the control a cashier uses most and the one a barcode scanner types into.
 * ui-rules §8's quick-bar geometry does not apply: this is not a list being
 * narrowed, it is a shop being looked through.
 *
 * THE GRID IS EIGHT TILES BY DEFAULT and pages rather than scrolls, which is
 * FR-1's rule and the reason a pager exists at all here — a till on a small
 * screen scrolling a thousand products is how the wrong thing gets tapped.
 */
export function PosCatalog({
  onAdd,
  onExpand,
  busy = false,
}: {
  onAdd: (item: PosCatalogItem) => void;
  onExpand: (item: PosCatalogItem) => void;
  /** True while a cart write is in flight — tiles stop accepting taps. */
  busy?: boolean;
}) {
  const { items, pagination, state, matchedSearch, loading, error, setState } =
    usePosCatalog();
  const [camera, setCamera] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>(null);

  /**
   * A code the camera read (18 Oct 2026) — a packaging barcode, a SKU, a lot
   * code, or a batch label's whole QR.
   *
   * MATCHED EXACTLY by the server (`scan: true`), so one code names one
   * product, and that product goes STRAIGHT INTO THE BASKET with the camera
   * left open for the next carton — the same flow as scanning into a faktur.
   *
   * ANYTHING ELSE LANDS IN THE SEARCH BOX: no exact match, several matches, or a
   * parent whose size has to be chosen. The grid then shows the candidates and
   * the cashier picks, exactly as if they had typed the code.
   */
  async function scanned(raw: string) {
    const code = raw.trim();
    if (!code) return;

    try {
      const result = await tillCatalog({
        search: code,
        scan: true,
        limit: 2,
      });
      const only = result.pagination.total === 1 ? result.items[0] : null;

      if (only && only.kind === "product" && only.productType === "parent") {
        // A family: the size is the cashier's to choose, in the picker.
        setCamera(false);
        onExpand(only);
        return;
      }

      if (only && only.kind === "product") {
        if (only.sellable === false) {
          setScanStatus({
            tone: "error",
            text: `${only.name} stoknya habis di gudang ini — tidak bisa dijual.`,
          });
          return;
        }

        onAdd(only);
        setScanStatus({
          tone: "success",
          text: `${only.name} masuk ke keranjang.`,
        });
        return;
      }

      const term = searchableCode(code);
      setState({ search: term });
      setScanStatus({
        tone: "error",
        text:
          result.pagination.total === 0
            ? `Tidak ada produk dengan kode ${term} persis — lihat hasil pencarian di daftar.`
            : `${result.pagination.total} produk cocok dengan ${term} — pilih di daftar.`,
      });
      // The grid is where the choice is made, and the dialog covers it.
      setCamera(false);
    } catch {
      setScanStatus({
        tone: "error",
        text: "Kode gagal dicek. Coba scan lagi.",
      });
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={state.search}
            onChange={(event) => {
              setScanStatus(null);
              setState({ search: event.target.value });
            }}
            placeholder='Cari nama, SKU, kode batch, scan barcode, atau "member" untuk paket…'
            aria-label="Cari produk atau layanan"
            className="pl-9"
            autoFocus
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setScanStatus(null);
            setCamera(true);
          }}
          disabled={busy}
          aria-label="Scan pakai kamera"
          className="shrink-0"
        >
          <Camera className="size-4" />
          <span className="hidden sm:inline">Scan</span>
        </Button>
      </div>

      {scanStatus && !camera && (
        <p
          aria-live="polite"
          className={
            scanStatus.tone === "error"
              ? "text-sm font-semibold text-danger"
              : "text-sm text-success"
          }
        >
          {scanStatus.text}
        </p>
      )}

      {camera && (
        <BarcodeCameraDialog
          onDetected={(code) => void scanned(code)}
          status={scanStatus}
          onClose={() => setCamera(false)}
          description="Arahkan kamera ke barcode kemasan, SKU, atau label batch. Produk yang cocok langsung masuk ke keranjang — lanjut scan tanpa menutup ini."
        />
      )}

      <PosCategoryPills state={state} onChange={setState} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat katalog…
        </div>
      ) : items.length === 0 ? (
        /* FR-1's edge case: a message in the grid area, not an empty grid. */
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
          {state.search.trim()
            ? `Tidak ada hasil untuk "${state.search.trim()}".`
            : "Belum ada produk atau layanan yang bisa dijual. Tambah di menu Inventory atau Layanan."}
        </div>
      ) : (
        <>
          <div
            className={
              loading
                ? "grid grid-cols-2 gap-3 opacity-60 lg:grid-cols-3 xl:grid-cols-4"
                : "grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4"
            }
          >
            {items.map((item) => (
              <PosProductCard
                key={`${item.kind}-${item._id}`}
                item={item}
                search={matchedSearch}
                onAdd={onAdd}
                onExpand={onExpand}
                disabled={busy}
              />
            ))}
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="item"
            unitPlural="item"
            onPageChange={(page) => setState({ page })}
          />
        </>
      )}
    </div>
  );
}
