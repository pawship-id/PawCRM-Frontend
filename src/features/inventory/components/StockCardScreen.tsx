"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Alert, Card, Spinner } from "@/components";
import { usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { stockMovementService } from "@/services/stockMovement.service";
import {
  absDecimal,
  formatMoney,
  formatQty,
  multiplyDecimals,
  toMinor,
} from "@/utils/decimal";

import { useProductBatches } from "../hooks/useProductBatches";
import { useProductStock } from "../hooks/useProductStock";
import {
  EMPTY_FILTERS,
  useStockCard,
  type StockCardFilters as Filters,
} from "../hooks/useStockCard";
import { csvToXlsx, saveBlob } from "@/utils/xlsx";

import { useStockCardLookups } from "../hooks/useStockCardLookups";
import { useStockCardSummary } from "../hooks/useStockCardSummary";
import { BatchLotTable } from "./BatchLotTable";
import { StockCardFilters } from "./StockCardFilters";
import { StockLedgerTable } from "./StockLedgerTable";
import { WarehouseProductPicker } from "./WarehouseProductPicker";

type Tab = "ledger" | "batches";

/**
 * The stock card and the lot list for one product at one warehouse.
 *
 * TWO VIEWS OF ONE TRUTH, which is why they share a screen rather than sitting
 * on separate pages. The ledger says what happened; the lots say what is on the
 * shelf right now. Both are ultimately derived from the same movements, so a
 * discrepancy between the two tabs is itself the useful signal, and putting them
 * a click apart is what lets anyone notice one.
 *
 * FIVE ENDPOINTS, ONE SCREEN, and they are not interchangeable:
 *
 *   products + warehouses  — the pickers (useStockCardLookups), once on mount
 *   products/:id           — the position tiles: on-hand, HPP, stock value
 *   stock-movements        — the ledger, one page at a time
 *   .../summary            — the period tiles: what moved in the filtered range
 *   product-batches        — the lot tab
 *
 * ONE REFRESH KEY DRIVES THE LAST FOUR TOGETHER. A user who hits "muat ulang"
 * because a number looks wrong must not get a fresh ledger beside stale tiles.
 *
 * TWO KINDS OF NUMBER SIT IN THE SAME TILE ROW, and the labels have to earn
 * their keep: the first two describe the POSITION right now, the last two
 * describe the PERIOD the filters select. Mixing them silently would let a user
 * read "keluar 40" as a current shortage.
 *
 * EVERY SECTION FAILS SEPARATELY AND SAYS SO. `stockMovements:read`,
 * `products:read`, `warehouses:read` and `productBatches:read` are four distinct
 * grants, and a role can hold some of them. A missing grant produces a named
 * error where its data would be, never an empty table that reads as "no stock
 * movements ever happened here".
 */
/**
 * How the exported columns are typed, keyed by the Indonesian header the SERVER
 * writes (see `EXPORT_COLUMNS` in its stockMovement controller).
 *
 * BY HEADER NAME, never by position: the server owns the column list, so one
 * added there flows through as text and nothing breaks. A positional map would
 * silently retype every column after the new one.
 *
 * "Waktu" is deliberately absent. The server writes a full ISO timestamp, and
 * this module's date type reads only the date half — typing it would quietly
 * throw the time away, and a stock card read to settle a dispute is exactly
 * where the time matters. Left as text, it is complete.
 */
const STOCK_CARD_EXPORT_TYPES = {
  Kedaluwarsa: "date",
  "Masuk/keluar": "number",
  Saldo: "number",
  "HPP saat itu": "number",
} as const;

/**
 * The four read hooks here take a refresh key, and nothing on this screen turns
 * it any more.
 *
 * It existed for a "Muat ulang" button, now gone: it asked the screen to
 * re-fetch what every filter change already re-fetches, on a ledger nobody else
 * can write to while you are reading it. The parameter stays on the hooks
 * because `useProductStock` has a second caller — the adjustment form, which
 * posts movements and genuinely needs to re-read after one. A constant says
 * "this screen never signals a refresh" more plainly than a piece of state that
 * is only ever read.
 */
const NO_REFRESH = 0;

export function StockCardScreen() {
  const lookups = useStockCardLookups();
  const { can } = usePermissions();
  const mayReadBatches = can("productBatches", "read");

  /**
   * The URL seeds the first view, so a product detail can link straight here.
   *
   * A `useState` INITIALISER, not an effect: the pair arrives with the first
   * render, and seeding it afterwards would show one product's ledger for a
   * frame before swapping to another's — and would fight the default-selection
   * effect below, which exists to fill an EMPTY selection.
   *
   * The URL is read ONCE and then ignored. After this the filters are the user's
   * to change, and rewriting the address bar on every dropdown would put a
   * dozen entries in their back button for one screen.
   */
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    productId: searchParams.get("productId") ?? EMPTY_FILTERS.productId,
    warehouseId: searchParams.get("warehouseId") ?? EMPTY_FILTERS.warehouseId,
  }));
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Tab>("ledger");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // The first warehouse and product become the default view once the lists
  // arrive. Not a fetch, so no cleanup: it runs once, when an empty selection
  // can be filled.
  useEffect(() => {
    if (filters.warehouseId || lookups.warehouses.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters((prev) => ({
      ...prev,
      warehouseId: lookups.warehouses[0]._id,
      productId: prev.productId || (lookups.products[0]?._id ?? ""),
    }));
  }, [lookups.warehouses, lookups.products, filters.warehouseId]);

  const { product, qtyOnHand, error: stockError } = useProductStock(
    filters.productId,
    filters.warehouseId,
    NO_REFRESH,
  );

  const ledger = useStockCard(filters, page, NO_REFRESH);
  const period = useStockCardSummary(filters, NO_REFRESH);

  const batches = useProductBatches(
    mayReadBatches ? filters.productId : "",
    mayReadBatches ? filters.warehouseId : "",
    NO_REFRESH,
    filters.search,
  );

  /** Any filter change is a new question, so it starts at page 1. */
  const patchFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  /**
   * Saves the ledger as a typed `.xlsx`.
   *
   * THE SERVER STILL STREAMS CSV and that has not changed — the endpoint is
   * unchanged, and it remains the escape hatch for anyone hitting it directly.
   * What changed is the file the BUTTON produces: a CSV carries no types, so
   * every quantity and date in it is text the recipient's Excel re-guesses on
   * open, differently depending on their locale. `csvToXlsx` re-types the
   * columns by header name on the way through.
   *
   * FETCHED, NOT LINKED TO, so a 403 arrives as an error the screen can show. An
   * anchor pointing at the endpoint would be shorter and would silently save a
   * file containing an error envelope.
   */
  const exportXlsx = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const { blob } = await stockMovementService.export({
        productId: filters.productId,
        warehouseId: filters.warehouseId,
        movementType: filters.movementType || undefined,
        from: filters.from ? `${filters.from}T00:00:00.000Z` : undefined,
        to: filters.to ? `${filters.to}T23:59:59.999Z` : undefined,
      });

      const workbook = await csvToXlsx(await blob.text(), {
        types: STOCK_CARD_EXPORT_TYPES,
        sheetName: "Kartu Stok",
      });

      saveBlob(workbook, "kartu-stok.xlsx");
    } catch (err) {
      setExportError(
        err instanceof ApiError ? err.message : "Export gagal. Coba lagi.",
      );
    } finally {
      setExporting(false);
    }
  }, [filters]);

  const stockValue =
    qtyOnHand && product?.hppAvg
      ? multiplyDecimals(qtyOnHand, product.hppAvg)
      : null;
  const low =
    qtyOnHand !== null &&
    product !== null &&
    (toMinor(qtyOnHand) ?? 0n) <= BigInt(product.minStock) * 10_000n;

  const filtered =
    filters.movementType !== "" || filters.from !== "" || filters.to !== "";
  const nothingSelected = !filters.productId || !filters.warehouseId;

  if (lookups.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat daftar produk dan gudang…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {lookups.error && <Alert variant="error">{lookups.error}</Alert>}

      {lookups.truncated && (
        <Alert variant="info">
          Daftar produk dipotong karena katalog terlalu besar. Produk yang tidak
          muncul di pemilih belum bisa dibuka kartu stoknya.
        </Alert>
      )}

      {/*
        The requirement is stated HERE, on the picker, rather than only in the
        empty state below it. The empty state is what somebody sees when they
        have not chosen — but it disappears the moment they do, which is exactly
        when a reader wonders what the two boxes are for. A card that names its
        own precondition answers that without needing to be empty first.
      */}
      <Card
        title="Pilih Gudang dan Produk"
        description="Pilih gudang dan produk dulu untuk melihat kartu stok dan daftar batch-nya."
      >
        <div className="flex flex-col gap-4">
          <WarehouseProductPicker
            warehouses={lookups.warehouses}
            products={lookups.products}
            warehouseId={filters.warehouseId}
            productId={filters.productId}
            onWarehouseChange={(warehouseId) => patchFilters({ warehouseId })}
            onProductChange={(productId) => patchFilters({ productId })}
            includeInactiveWarehouses
            productPlaceholder="Pilih produk"
          />

          <StockCardFilters
            filters={filters}
            disabled={nothingSelected}
            exporting={exporting}
            onChange={patchFilters}
            onExport={exportXlsx}
          />
        </div>
      </Card>

      {nothingSelected ? (
        <div className="rounded-xl border border-dashed border-border bg-surface py-16 text-center">
          {/*
            No longer "Pilih gudang dan produk dulu" — the card above now says
            that, and the same instruction twice on one screen reads as two
            instructions that happen to agree. What is left is the half the card
            does not carry: WHY the pair is required.
          */}
          <p className="font-medium text-foreground">Belum ada yang dibaca</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Kartu stok selalu dibaca untuk satu produk di satu gudang — itulah
            yang membuat saldonya bisa dicocokkan.
          </p>
        </div>
      ) : (
        <>
          {/* Separate from the ledger's own error: a role may hold
              stockMovements:read without products:read, and the ledger still
              renders — with the position tiles missing, which this says out loud
              rather than showing as empty cells. */}
          {stockError && <Alert variant="error">{stockError}</Alert>}
          {exportError && <Alert variant="error">{exportError}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Stok di gudang ini"
              value={
                qtyOnHand === null
                  ? "—"
                  : `${formatQty(qtyOnHand)} ${product?.unit ?? ""}`.trim()
              }
              tone={low ? "danger" : "default"}
              note={
                product
                  ? low
                    ? `di bawah minimum (${product.minStock})`
                    : `minimum ${product.minStock}`
                  : undefined
              }
            />
            <Stat
              label="Nilai persediaan"
              value={stockValue ? formatMoney(stockValue) : "—"}
              note={
                product?.hppAvg
                  ? `HPP ${formatMoney(product.hppAvg)} / ${product.unit}`
                  : "belum ada penerimaan bernilai"
              }
            />
            <Stat
              label="Masuk periode ini"
              value={
                period.summary
                  ? `+${formatQty(period.summary.totalIn)}`
                  : period.loading
                    ? "…"
                    : "—"
              }
              tone="success"
              note={periodNote(filtered)}
            />
            <Stat
              label="Keluar periode ini"
              value={
                period.summary
                  ? // The API returns this negative, as the ledger stores it.
                    // Shown as a magnitude under a label that already says
                    // "keluar" — two negatives in one tile read as a double
                    // negative, not as emphasis.
                    `−${formatQty(absDecimal(period.summary.totalOut))}`
                  : period.loading
                    ? "…"
                    : "—"
              }
              tone="danger"
              note={
                period.summary
                  ? `${period.summary.movementCount} pergerakan, nett ${formatQty(period.summary.net)}`
                  : periodNote(filtered)
              }
            />
          </div>

          {period.error && <Alert variant="error">{period.error}</Alert>}

          <div>
            <div className="flex gap-1 border-b border-border">
              {(
                [
                  ["ledger", `Kartu stok (${ledger.pagination.total})`],
                  ...(mayReadBatches
                    ? ([["batches", `Batch / FEFO (${batches.total})`]] as const)
                    : []),
                ] as ReadonlyArray<readonly [Tab, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={cn(
                    "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition",
                    tab === value
                      ? "border-primary text-primary-hover"
                      : "border-transparent text-muted hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-4 pt-4">
              {tab === "ledger" ? (
                <>
                  {ledger.error && <Alert variant="error">{ledger.error}</Alert>}
                  {ledger.loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
                      <Spinner /> Memuat kartu stok…
                    </div>
                  ) : (
                    <StockLedgerTable
                      movements={ledger.movements}
                      unit={product?.unit ?? ""}
                      openingBalance={ledger.openingBalance}
                      page={ledger.pagination.page}
                      totalPages={ledger.pagination.totalPages}
                      total={ledger.pagination.total}
                      filtered={filtered}
                      onPageChange={setPage}
                    />
                  )}
                </>
              ) : (
                <>
                  {batches.error && (
                    <Alert variant="error">{batches.error}</Alert>
                  )}
                  {batches.loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
                      <Spinner /> Memuat batch…
                    </div>
                  ) : (
                    <BatchLotTable
                      batches={batches.batches}
                      total={batches.total}
                      hasExpiry={product?.hasExpiry ?? false}
                      search={filters.search}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Says which period the tile is talking about — the filters decide it. */
function periodNote(filtered: boolean): string {
  return filtered ? "sesuai filter" : "sepanjang riwayat";
}

function Stat({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "default" | "danger" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-surface p-4",
        tone === "danger" ? "border-danger/40 bg-danger/5" : "border-border",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 tabular-nums text-xl font-semibold",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}
