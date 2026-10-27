"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
/**
 * HOW A HANDHELD SCANNER IS TOLD FROM A PERSON (25 Oct 2026, BO): it types the
 * whole code in one burst, a few milliseconds a key. Nobody types four keys
 * under 50 ms apart, so a burst that long is a scan, and a pause after it is
 * its end. No Enter is needed: some scanners send none, and a batch label's QR
 * sends one per line, mid-code.
 */
const SCAN_KEY_GAP_MS = 50;
const SCAN_MIN_LENGTH = 4;
const SCAN_END_MS = 100;

type ScanSource = "camera" | "scanner";

export function PosCatalog({
  onAdd,
  onScan,
  onExpand,
  busy = false,
}: {
  onAdd: (item: PosCatalogItem) => void;
  /** A product a scan named exactly — resolves once it is in the basket. */
  onScan: (item: PosCatalogItem) => Promise<boolean>;
  onExpand: (item: PosCatalogItem) => void;
  /** True while a cart write is in flight — tiles stop accepting taps. */
  busy?: boolean;
}) {
  const { items, pagination, state, matchedSearch, loading, error, setState } =
    usePosCatalog();
  const [camera, setCamera] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>(null);
  const [queue, setQueue] = useState<Array<{ code: string; source: ScanSource }>>(
    [],
  );
  const working = useRef(false);
  const burst = useRef({ text: "", last: 0 });
  const burstEnd = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (burstEnd.current) clearTimeout(burstEnd.current);
    },
    [],
  );

  function enqueue(code: string, source: ScanSource) {
    setQueue((current) => [...current, { code, source }]);
  }

  /** Tells a scanner's burst from typing — see SCAN_KEY_GAP_MS. */
  function trackKey(event: KeyboardEvent<HTMLInputElement>) {
    // Shift, Enter and the rest: not part of the code, not a break in it.
    if (event.key.length !== 1) return;

    const now = performance.now();
    const current = burst.current;
    burst.current =
      now - current.last <= SCAN_KEY_GAP_MS
        ? { text: current.text + event.key, last: now }
        : { text: event.key, last: now };

    if (burstEnd.current) clearTimeout(burstEnd.current);
    burstEnd.current = setTimeout(() => {
      const { text } = burst.current;
      burst.current = { text: "", last: 0 };
      if (text.trim().length >= SCAN_MIN_LENGTH) enqueue(text, "scanner");
    }, SCAN_END_MS);
  }

  /**
   * A code the camera read (18 Oct 2026) or a handheld scanner typed (25 Oct
   * 2026) — a packaging barcode, a SKU, a lot code, or a batch label's QR.
   *
   * MATCHED EXACTLY by the server (`scan: true`), so one code names one
   * product, and that product goes STRAIGHT INTO THE BASKET — from the lot on
   * the label, when it named one. The camera stays open for the next carton;
   * the scanner's search box is EMPTIED, ready for the next code.
   *
   * ANYTHING ELSE LANDS IN THE SEARCH BOX: no exact match, several matches, or a
   * parent whose size has to be chosen. The grid then shows the candidates and
   * the cashier picks, exactly as if they had typed the code.
   */
  async function scanned(raw: string, source: ScanSource) {
    const code = raw.trim();
    if (!code) return;
    const reset = () => {
      if (source === "scanner") setState({ search: "" });
    };

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
        reset();
        onExpand(only);
        return;
      }

      if (only && only.kind === "product") {
        reset();

        if (only.sellable === false) {
          setScanStatus({
            tone: "error",
            text: `${only.name} stoknya habis di gudang ini — tidak bisa dijual.`,
          });
          return;
        }

        const lot = only.scannedLot;
        if (lot?.expiryDate && lot.expiryDate.slice(0, 10) < todayIso()) {
          setScanStatus({
            tone: "error",
            text: `Batch ${lot.batchCode} sudah kedaluwarsa — tidak bisa dijual.`,
          });
          return;
        }

        const ok = await onScan(only);
        setScanStatus(
          ok
            ? { tone: "success", text: `${only.name} masuk ke keranjang.` }
            : {
                tone: "error",
                text: `${only.name} tidak bisa ditambahkan — lihat keterangan di keranjang.`,
              },
        );
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

  /*
    SCANS GO IN ONE AT A TIME. Every cart write sends the whole basket, so a
    second scan written before the first has landed would be built without
    its line. The next one starts only after a render that holds the last
    write — which is what `onScan` from THIS render's props is.
  */
  useEffect(() => {
    if (working.current || busy || queue.length === 0) return;
    working.current = true;
    const [next] = queue;
    void scanned(next.code, next.source).finally(() => {
      working.current = false;
      setQueue((current) => current.slice(1));
    });
  });

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
            onKeyDown={trackKey}
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
          onDetected={(code) => enqueue(code, "camera")}
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
            : "Belum ada produk atau layanan yang bisa dijual. Tambah di menu Inventori atau Layanan."}
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

/** Today on the till's own calendar, as `YYYY-MM-DD` — a lot expiring today still sells. */
function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
