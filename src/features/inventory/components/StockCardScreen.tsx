"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Alert,
  Breadcrumb,
  FilterSelect,
  Spinner,
  namedOptions,
} from "@/components";
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

import { useStockCardSummary } from "../hooks/useStockCardSummary";
import { useWarehouseOptions } from "../hooks/useWarehouseOptions";
import { BatchLotTable } from "./BatchLotTable";
import { StockCardFilters } from "./StockCardFilters";
import { StockLedgerTable } from "./StockLedgerTable";

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
 * THE PRODUCT IS THE ROUTE, NOT A DROPDOWN, and it is the newest thing here.
 * This screen used to ask for the product itself, from a select it filled by
 * paging the whole catalogue on mount — five requests, a 500-product ceiling,
 * and a banner apologising once a tenant grew past it. The choosing moved to the
 * index (StockProductsScreen), so what arrives here is already decided:
 * `productId` is read straight from the prop and never copied into state, which
 * is what stops a second route landing on the first product's ledger. The
 * WAREHOUSE stays switchable, because "and how much of it is in the other shop"
 * is a question people ask while already looking at a card.
 *
 * FIVE ENDPOINTS, ONE SCREEN, and they are not interchangeable:
 *
 *   warehouses             — the warehouse select (useWarehouseOptions)
 *   products/:id           — the heading, and the position tiles: on-hand, HPP,
 *                            stock value
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

/**
 * The half of the filter shape this screen still OWNS.
 *
 * `productId` and `warehouseId` are the other half, and they are not state here:
 * the first is the route, the second is a select rendered beside the heading.
 * Keeping them out of the drafted object is what makes it impossible for a stale
 * copy of either to survive a navigation.
 */
type LedgerFilters = Omit<Filters, "productId" | "warehouseId">;

const EMPTY_LEDGER_FILTERS: LedgerFilters = {
  movementType: EMPTY_FILTERS.movementType,
  from: EMPTY_FILTERS.from,
  to: EMPTY_FILTERS.to,
  search: EMPTY_FILTERS.search,
  sort: EMPTY_FILTERS.sort,
};

export function StockCardScreen({
  productId,
  warehouseId: initialWarehouseId,
}: {
  /** Which product's card. From the route segment — never state. */
  productId: string;
  /** Which warehouse to open on. From `?warehouseId=`, seeded once. */
  warehouseId?: string;
}) {
  const warehouses = useWarehouseOptions();
  const { can } = usePermissions();
  const mayReadBatches = can("productBatches", "read");

  /**
   * The warehouse is SEEDED from the prop and then owned here — the one value on
   * this screen that is both linked-to and switchable.
   *
   * A `useState` initialiser, not an effect: the id arrives with the first
   * render, and seeding it afterwards would read one shelf's ledger for a frame
   * before swapping to another's. The address bar is deliberately NOT rewritten
   * when the select changes, so a session of comparing four warehouses leaves
   * one entry in the back button rather than four — which is also why the route
   * remounts this component when a NEW link names a different pair.
   */
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId ?? "");
  const [ledgerFilters, setLedgerFilters] =
    useState<LedgerFilters>(EMPTY_LEDGER_FILTERS);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<Tab>("ledger");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { product, qtyOnHand, error: stockError } = useProductStock(
    productId,
    warehouseId,
    NO_REFRESH,
  );

  /**
   * WHICH SHELF TO OPEN ON when the link named none — from the index's "semua
   * gudang" view, from the nav, or from a hand-typed URL.
   *
   * THE ONE HOLDING THE MOST OF THIS PRODUCT, not the first in the list. The
   * index row that sent them here was showing a total across locations, and no
   * card can show that total — a running balance summed across warehouses claims
   * stock is somewhere it is not. The largest holding is the closest single
   * answer to the number they clicked, and it is the shelf somebody asking about
   * a product almost always means.
   *
   * It WAITS for the product, so the choice is made once rather than defaulting
   * to the first warehouse and jumping a moment later. If the product cannot be
   * read at all — `products:read` is its own grant — it falls back to the first
   * warehouse, because a ledger for some shelf beats a screen that never loads.
   *
   * Not a fetch, so no cleanup: it runs once, when an empty selection can be
   * filled.
   */
  useEffect(() => {
    if (warehouseId || warehouses.warehouses.length === 0) return;
    if (!product && !stockError) return;

    // Only among warehouses the select can name, and compared as MINOR UNITS
    // rather than as numbers: these are decimal strings the backend sent
    // precisely so they never touch a float.
    const known = new Set(warehouses.warehouses.map((w) => w._id));
    const largest = (product?.stockByWarehouse ?? [])
      .filter((row) => known.has(row.warehouseId))
      .reduce<{ warehouseId: string; qty: string } | null>(
        (best, row) =>
          best === null || (toMinor(row.qty) ?? 0n) > (toMinor(best.qty) ?? 0n)
            ? row
            : best,
        null,
      );

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWarehouseId(largest?.warehouseId ?? warehouses.warehouses[0]._id);
  }, [warehouses.warehouses, warehouseId, product, stockError]);

  /**
   * What every hook below is asked about: the route's product, the chosen
   * warehouse, and the filters the toolbar drives.
   *
   * Composed rather than held in state, so the pair on screen cannot drift from
   * the pair in the URL. Every hook below destructures it and keys its effect on
   * the primitives, never on this object's identity — the `useMemo` is for the
   * export callback, which does depend on the whole thing.
   */
  const filters: Filters = useMemo(
    () => ({ ...ledgerFilters, productId, warehouseId }),
    [ledgerFilters, productId, warehouseId],
  );

  const ledger = useStockCard(filters, page, NO_REFRESH);
  const period = useStockCardSummary(filters, NO_REFRESH);

  const batches = useProductBatches(
    mayReadBatches ? productId : "",
    mayReadBatches ? warehouseId : "",
    NO_REFRESH,
    filters.search,
  );

  /** Any filter change is a new question, so it starts at page 1. */
  const patchFilters = useCallback((patch: Partial<LedgerFilters>) => {
    setLedgerFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  /** So is a new warehouse: the ledger it pages through is a different one. */
  const changeWarehouse = useCallback((id: string) => {
    setWarehouseId(id);
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
  // `minStock > 0` IS A GUARD, not a formality: zero means "no threshold set",
  // and without it every product that has none and holds none reads as being
  // below its minimum — in danger red, under a note saying "di bawah minimum
  // (0)". The catalogue table has always had this; this tile was missing it.
  const low =
    qtyOnHand !== null &&
    product !== null &&
    product.minStock > 0 &&
    (toMinor(qtyOnHand) ?? 0n) <= BigInt(product.minStock) * 10_000n;

  const filtered =
    filters.movementType !== "" || filters.from !== "" || filters.to !== "";
  // The product can no longer be missing — it is the route. Only the warehouse
  // can still be unset, and only until the list arrives.
  const noWarehouse = !warehouseId;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventory", href: "/dashboard/inventory" },
              { label: "Kartu stok", href: "/dashboard/inventory/stock-card" },
              { label: product?.name ?? "Detail" },
            ]}
          />
          {/*
            THE PRODUCT NAMES THE PAGE, and until it arrives the page is named
            after what it is. Never the id: an ObjectId in a heading tells a
            reader less than the generic word does.
          */}
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            {product?.name ?? "Kartu stok"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {product ? (
              <>
                <span className="tabular-nums">{product.sku ?? "—"}</span> ·
                satuan {product.unit} · riwayat setiap pergerakan dan urutan lot
                mana yang keluar duluan.
              </>
            ) : (
              "Riwayat setiap pergerakan barang, dan urutan lot mana yang keluar duluan. Keduanya berasal dari catatan yang sama."
            )}
          </p>
        </div>

        {/*
          The warehouse, and it is a required INPUT rather than a filter —
          `active={false}` keeps the trigger from going navy as though something
          were narrowed. Nothing here is narrowed: a card is read for one shelf,
          and this says which. Hidden until the list answers, so it is never an
          empty dropdown that fills in a moment later.

          INACTIVE WAREHOUSES ARE OFFERED. A closed location still owns
          everything it ever held, and a history nobody can open is an audit
          hole. The forms leave them out; this is a read.
        */}
        {warehouses.warehouses.length > 0 && (
          <FilterSelect
            label="Gudang"
            ariaLabel="Gudang"
            value={warehouseId}
            options={namedOptions(warehouses.warehouses, (warehouse) =>
              warehouse.isActive
                ? warehouse.name
                : `${warehouse.name} (nonaktif)`,
            )}
            active={false}
            align="end"
            onChange={changeWarehouse}
          />
        )}
      </div>

      {warehouses.error && <Alert variant="error">{warehouses.error}</Alert>}

      <StockCardFilters
        filters={filters}
        disabled={noWarehouse}
        exporting={exporting}
        onChange={patchFilters}
        onExport={exportXlsx}
      />

      {noWarehouse ? (
        warehouses.loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Spinner /> Memuat gudang…
          </div>
        ) : (
          /*
            Only reachable when the warehouse list is empty or failed — the
            select above fills itself from the first entry otherwise. What it
            explains is WHY nothing can be read without one.
          */
          <div className="rounded-xl border border-dashed border-border bg-surface py-16 text-center">
            <p className="font-medium text-foreground">Belum ada yang dibaca</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              Kartu stok selalu dibaca untuk satu produk di satu gudang — itulah
              yang membuat saldonya bisa dicocokkan.
            </p>
          </div>
        )
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
