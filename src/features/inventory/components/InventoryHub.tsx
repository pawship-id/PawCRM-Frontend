"use client";

import { SkuText } from "@/components/SkuText";
import { useState, type ReactNode } from "react";
import Link from "next/link";

import { Store, Warehouse } from "lucide-react";

import {
  Alert,
  Card,
  FilterSelect,
  PendingStatTile,
  ScopeCard,
  ScopeField,
  Spinner,
  StatTile,
  namedOptions,
  withAll,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import { useTenant } from "@/features/tenant";
import { formatMoney, formatQty, multiplyDecimals } from "@/utils/decimal";

import { useBranchOptions } from "../hooks/useBranchOptions";
import { warehousesUnder } from "../hooks/useBranchScope";
import { useExpiringAlert } from "../hooks/useExpiringAlert";
import type { SkuCounts } from "../hooks/useSkuCounts";
import type { WarehouseValue } from "../hooks/useStockValuation";
import { useLowStockAlert } from "../hooks/useLowStockAlert";
import { useNegativeStockAlert } from "../hooks/useNegativeStockAlert";
import {
  IDLE_DAY_OPTIONS,
  TOP_SELLER_DAYS,
  useProductMovement,
} from "../hooks/useProductMovement";
import { useSkuCounts } from "../hooks/useSkuCounts";
import { useStockValuation } from "../hooks/useStockValuation";
import { useWarehouseOptions } from "../hooks/useWarehouseOptions";
import { ExpiryBadge } from "./ExpiryBadge";

/**
 * The Inventori › Ringkasan tab — the module's landing page, rebuilt to the
 * mockup (`buloo-navigation-v3`, inv-ring) on 29 September 2026.
 *
 * A PAGE OF WARNINGS, NOT A MENU. It used to open with eight cards linking to
 * every screen in the module, above the alert lists. The rail already expands to
 * all eight, always visible, and the mockup draws none of them — so the cards
 * were a second navigation of the same screens, taking the top of the page from
 * the five things somebody opens this tab to find out. Its own subtitle now says
 * where the management screens are.
 *
 * FIVE WORKLISTS, IN THE MOCKUP'S ORDER, and each answers a different kind of
 * question:
 *
 *   Stok minus        — the BOOKS are wrong. It leads because nothing below it
 *                       can be trusted until it is cleared: goods were sold that
 *                       the system never recorded arriving, so every figure
 *                       derived from that balance — the valuation above
 *                       included — is wrong with it.
 *   SKU mau habis     — the SHELF is running out.
 *   Batch mau expired — the shelf is about to be worth nothing.
 *   SKU paling laris  — what to keep in stock, with what is left beside it.
 *   SKU tidak laku    — what to stop buying, over a window the reader picks.
 *
 * STOK MINUS IS THE PRICE OF LETTING A TILL OVERSELL. `settings.allowNegativeStock`
 * is true by default, so a cashier can sell an empty shelf and the balance goes
 * negative rather than the sale being refused — the honest trade, but only while
 * somebody can SEE what it produced.
 *
 * EVERY FIGURE IS THE SERVER'S. Each list shows the most urgent five and reports
 * the true total beside it; the ranking is netted of voids and the idle list is
 * subtracted from the sold set in the database. A landing page answers "is there
 * anything to do", and a number that counted only the rows on screen is worse
 * than no number because it looks like a total.
 *
 * EACH SECTION IS GATED ON ITS OWN GRANT, and a section a user cannot read is
 * not requested at all — firing anyway would paint a 403 across a page instead
 * of simply not offering the section.
 *
 * ONE WAREHOUSE FILTER NARROWS EVERYTHING, because the question this page asks
 * is asked from somewhere: a person standing in one shop is not asking what the
 * warehouse across town needs. It stands alone rather than behind a Filter
 * button (§8) — one field is not a panel.
 *
 * THE LISTS DO NOT NARROW ALIKE, and the low-stock one says so. A lot is
 * physically in one warehouse, so filtering the expiry list only changes which
 * rows are counted. `minStock` is a per-PRODUCT threshold, so filtering the
 * restock list compares one location's shelf against the whole product's
 * minimum — the right question for one shop, and a misreading waiting to happen
 * if nobody says which comparison is on screen.
 */
export function InventoryHub() {
  const { can } = usePermissions();

  const mayReadProducts = can("products", "read");
  const mayReadBatches = can("productBatches", "read");

  /** Empty = every gudang / every cabang — the repo's unset convention. */
  const [warehouseId, setWarehouseId] = useState("");
  const [branchId, setBranchId] = useState("");
  /*
    THE IDLE LIST'S OWN WINDOW, and the only control on this page besides the
    warehouse. 60 days by default, as the mockup opens: 30 catches a seasonal
    lull and 90 is already a catalogue decision rather than a buying one.
  */
  const [idleDays, setIdleDays] = useState<number>(60);

  // Only fetched where there is a list for it to narrow — see the hook.
  const warehouses = useWarehouseOptions(mayReadProducts || mayReadBatches);
  const branches = useBranchOptions(mayReadProducts || mayReadBatches);
  const lowStock = useLowStockAlert(mayReadProducts, warehouseId, branchId);
  const negative = useNegativeStockAlert(
    mayReadProducts,
    warehouseId,
    branchId,
  );
  const expiring = useExpiringAlert(mayReadBatches, warehouseId, branchId);
  const movement = useProductMovement(
    mayReadProducts,
    warehouseId,
    branchId,
    idleDays,
  );
  const valuation = useStockValuation(
    mayReadProducts,
    warehouseId,
    branchId,
    warehouses.warehouses,
  );
  const skus = useSkuCounts(mayReadProducts, can("services", "read"));

  /*
    WHETHER THE SHOP LETS A TILL OVERSELL — asked only where the account may ask
    it. `tenants:read` is a different grant from `products:read`, and a
    storekeeper need not hold it; firing the request anyway would paint a 403
    across a page that wanted a yes/no answer. Off, `tenant` stays null, which
    the rule below reads as "unknown".
  */
  const { tenant } = useTenant(can("tenants", "read"));
  const oversellAllowed =
    tenant === null ? null : tenant.settings.allowNegativeStock !== false;

  /**
   * WHEN THE NEGATIVE-STOCK SECTION IS ON SCREEN AT ALL.
   *
   * ALWAYS, WHERE THE SHOP ALLOWS OVERSELLING — including with nothing to show.
   * The empty state is the point there: a setting that produces discrepancies
   * silently needs a place that says "none right now", or nobody learns the
   * place exists until the day it matters.
   *
   * AND WHENEVER THERE IS ONE ANYWAY. Turning the setting off does not restate
   * history — balances already below zero stay there until a receipt or an
   * opname puts them right — so a shop that has just tightened the rule is
   * exactly the one that still has holes to clear. Hiding them with the setting
   * would hide the work.
   *
   * The `null` case (an account that may not read the tenant) therefore falls
   * back to "show it if there is something to show", which is the honest answer
   * without the setting in hand.
   */
  const showNegative = oversellAllowed === true || negative.total > 0;

  /**
   * The chosen warehouse's name, for the captions.
   *
   * Undefined while the lookup is still in flight, and also for an id the list
   * does not contain — the trigger keeps showing the raw id in that case
   * (FilterSelect does this deliberately), and a caption inventing a name for it
   * would be the one place on screen claiming the filter is something else.
   */
  const warehouseName = warehouses.warehouses.find(
    (warehouse) => warehouse._id === warehouseId,
  )?.name;

  /** " di Gudang Pusat", or nothing at all. Appended, never sentence-leading. */
  const scope = warehouseName ? ` di ${warehouseName}` : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">
            Inventori — Ringkasan
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Halaman peringatan: apa yang salah, apa yang menipis, dan apa yang
            tidak bergerak. Untuk mengelola produk, stok, atau transfer, buka
            menunya masing-masing di rail kiri.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* The two acts a reader starts FROM this page, as the mockup draws
              them. Everything else in the module is a rail row. */}
          <Can feature="stockOpnames" action="read">
            <Button asChild variant="secondary">
              <Link href="/dashboard/inventory/opname">Opname</Link>
            </Button>
          </Can>
          <Can feature="products" action="create">
            <Button asChild>
              <Link href="/dashboard/inventory/products/new">+ Produk</Link>
            </Button>
          </Can>
        </div>
      </div>

      {/* Hidden until the lookup answers: an empty dropdown that fills in a
          moment later is a control people click twice. */}
      {/*
        THE SAME SCOPE ROW THE RINGKASAN TABS WEAR (29 September 2026, on
        request) — two fields instead of their cabang-and-periode, because a
        stock page has no period: every figure on it is a balance as of now.

        CABANG NARROWS THE GUDANG LIST as well as the data. A gudang belongs to a
        cabang by soft default (PCR-019), so picking a shop and then being
        offered the warehouse across town would be two controls contradicting
        each other. A gudang already chosen that falls outside the new cabang is
        cleared rather than left narrowing the page to nothing.
      */}
      <ScopeCard>
        <ScopeField icon={<Store className="size-4" />} label="Cabang">
          <FilterSelect
            layout="bar"
            label="Cabang"
            ariaLabel="Cabang"
            value={branchId}
            options={withAll(namedOptions(branches.branches), "Semua cabang")}
            onChange={(next) => {
              setBranchId(next);
              if (
                warehouseId &&
                !warehousesUnder(next, warehouses.warehouses).some(
                  (warehouse) => warehouse._id === warehouseId,
                )
              ) {
                setWarehouseId("");
              }
            }}
            /* A scope, not a filter applied on top of one — navy here would
               announce something the reader did not set. */
            active={false}
          />
        </ScopeField>

        <ScopeField icon={<Warehouse className="size-4" />} label="Gudang">
          <FilterSelect
            layout="bar"
            label="Gudang"
            ariaLabel="Gudang"
            value={warehouseId}
            options={withAll(
              namedOptions(
                warehousesUnder(branchId, warehouses.warehouses),
                (warehouse) =>
                  warehouse.isActive
                    ? warehouse.name
                    : `${warehouse.name} (nonaktif)`,
              ),
              "Semua gudang",
            )}
            onChange={setWarehouseId}
            active={false}
          />
        </ScopeField>
      </ScopeCard>

      {/* Separate from each list's own error: the picker can fail to load while
          every alert renders perfectly well, unfiltered. */}
      {warehouses.error && <Alert variant="error">{warehouses.error}</Alert>}

      <section
        aria-label="Ringkasan persediaan"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        {mayReadProducts ? (
          <StatTile
            label="Jumlah persediaan saat ini"
            value={formatMoney(valuation.totals?.value ?? null)}
            caption={
              valuation.totals
                ? `${formatQty(valuation.totals.qty)} unit · ${valuation.totals.productCount} produk${scope}`
                : ""
            }
            loading={valuation.loading && !valuation.totals}
            error={Boolean(valuation.error)}
          />
        ) : (
          <PendingStatTile
            label="Jumlah persediaan saat ini"
            blockedBy="Peran ini tidak punya akses ke data produk."
          />
        )}
        <StatTile
          label="Jumlah SKU"
          value={skuTotal(skus)}
          caption={skuSplit(skus)}
          loading={skus.loading}
          error={skus.error}
        />
      </section>

      {/*
        ONE PANEL FOR THE FIVE LISTS, as the mockup draws it — heading, the scope
        it covers on the right, and the worklists stacked inside.

        IT IS WHAT THIS TAB IS. Five separately floating boxes read as five
        widgets that happen to share a page; under one heading they read as one
        question — "what has to be done about the stock" — asked five ways. The
        panel also gives the scope somewhere to be said ONCE rather than as a
        caption repeated on every list.
      */}
      <section
        aria-label="Perlu tindakan"
        className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-foreground">Perlu tindakan</h2>
          <span className="text-xs text-muted sm:ml-auto">
            {warehouseName ?? "Gudang dalam akses kamu"}
          </span>
        </div>

        <div className="flex flex-col gap-4">
          {showNegative && (
            <AlertSection
              title="Stok minus"
              tone="danger"
              total={negative.total}
              shown={negative.items.length}
              loading={negative.loading}
              error={negative.error}
              allowed={mayReadProducts}
              /*
            WHAT A NEGATIVE BALANCE IS, said once above the rows. Nobody reads
            "−3" as "a sale was recorded for goods the book did not have" on
            their own, and the wrong reading — "the system is broken" — sends
            somebody looking for a bug instead of for a delivery note.

            THE MONEY IS SAID HERE TOO, because it is the whole hole and the rows
            only carry five of them.
          */
              note={
                <>
                  Barang terjual saat stok tercatat habis, jadi saldonya jadi
                  minus. Biasanya karena penerimaan barang belum dicatat — catat
                  penerimaannya, atau perbaiki lewat{" "}
                  <Link
                    href="/dashboard/inventory/opname"
                    className="font-medium text-primary hover:text-primary-hover"
                  >
                    opname
                  </Link>
                  .
                  {negative.total > 0 && negative.shortfall && (
                    <>
                      {" "}
                      Total nilai minus{scope}:{" "}
                      <strong className="tabular-nums text-danger">
                        {formatMoney(negative.shortfall)}
                      </strong>
                      .
                    </>
                  )}
                </>
              }
              empty={`Tidak ada stok minus${scope}.`}
              moreLabel="baris lain juga minus"
              /*
            THE WAY OUT OF THE CARD. Five rows answer "is something wrong"; a
            shop clearing a backlog works down a list, and guessing at the rest
            is not something a landing page should ask of anybody.
          */
              seeAll={{
                href: "/dashboard/inventory/negative-stock",
                label: "Lihat semua stok minus",
              }}
            >
              {negative.items.map((row) => (
                <li
                  key={`${row.productId}-${row.warehouseId}`}
                  className="flex items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/inventory/products/${row.productId}`}
                      className="truncate text-sm font-medium hover:text-primary-hover"
                    >
                      {row.name}
                    </Link>
                    {/* THE PLACE, not just the product: a shortfall is at a shelf,
                    and the same product can be fine in the next building. */}
                    <p className="truncate tabular-nums text-xs text-muted">
                      <SkuText value={row.sku} fallback="—" />
                      {row.warehouseName && ` · ${row.warehouseName}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums text-sm font-semibold text-danger">
                      {formatQty(row.qty)} {row.unit ?? ""}
                    </p>
                    {/*
                  WHAT THE HOLE IS WORTH, at the average the goods were sold at —
                  which selling into the negative leaves exactly where it was.
                  Negative, and shown as such: this is cost the shop has already
                  expensed for goods it does not hold.
                */}
                    <p className="tabular-nums text-[11px] text-muted">
                      {formatMoney(row.value)}
                    </p>
                  </div>
                </li>
              ))}
            </AlertSection>
          )}

          {/*
        ONE LIST PER ROW, full width (29 September 2026, on request). They used
        to sit two abreast; a row carrying a product name, its SKU, a quantity
        and a threshold truncates the NAME first in half a screen — and the name
        is the only part somebody can act on.
      */}
          <AlertSection
            title="Perlu restock"
            tone="warning"
            total={lowStock.total}
            shown={lowStock.items.length}
            loading={lowStock.loading}
            error={lowStock.error}
            allowed={mayReadProducts}
            // The one thing a reader cannot work out from the rows: the number
            // after the slash is the PRODUCT's minimum, while the number before
            // it is now one gudang's shelf. Said only while the filter is on —
            // unfiltered, both sides describe the same thing and the line would
            // be a standing sentence people stop reading.
            note={
              warehouseId
                ? "Batas minimum berlaku per produk, bukan per gudang — angka di layar ini membandingkan stok satu gudang dengan batas produk."
                : undefined
            }
            empty={`Semua stok${scope} di atas batas minimum.`}
            moreLabel="produk lain juga di bawah batas minimum"
          >
            {lowStock.items.map((product) => (
              <li
                key={product._id}
                className="flex items-center gap-3 px-5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/inventory/products/${product._id}`}
                    className="truncate text-sm font-medium hover:text-primary-hover"
                  >
                    {product.name}
                  </Link>
                  <p className="truncate tabular-nums text-xs text-muted">
                    <SkuText value={product.sku} fallback="—" />
                  </p>
                </div>
                <span className="tabular-nums text-sm font-semibold text-danger">
                  {formatQty(product.qtyOnHand)}
                </span>
                <span className="whitespace-nowrap text-xs text-muted">
                  / {product.minStock} {product.unit}
                </span>
              </li>
            ))}
          </AlertSection>

          <AlertSection
            title="Mendekati kedaluwarsa"
            tone="warning"
            /* The window, not the gudang: the panel's own heading says where. */
            caption={`dalam ${expiring.withinDays} hari`}
            total={expiring.total}
            shown={expiring.items.length}
            loading={expiring.loading}
            error={expiring.error}
            allowed={mayReadBatches}
            empty={`Tidak ada lot${scope} yang kedaluwarsa dalam ${expiring.withinDays} hari.`}
            moreLabel="batch lain juga di dalam rentang ini"
            seeAll={{
              href: "/dashboard/inventory/batches",
              label: "Lihat semua batch",
            }}
          >
            {expiring.items.map((batch) => (
              <li key={batch._id} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  {/* Resolved by the API — this screen never joins the catalogue
                    itself. Null only where the product row has since gone. */}
                  <p className="truncate text-sm font-medium">
                    {batch.productName ?? "—"}
                  </p>
                  {/* THEIRS BESIDE OURS, on one line. This is a glance widget —
                    the row is two lines already — so the pair is joined rather
                    than stacked, and the full codes are one click away on the
                    batch list. */}
                  <p className="truncate tabular-nums text-xs text-muted">
                    {batch.batchCode}
                    {batch.supplierBatchCode &&
                      ` · supplier ${batch.supplierBatchCode}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular-nums text-sm">
                    {formatQty(batch.qtyRemaining)}
                  </p>
                  <p className="tabular-nums text-[11px] text-muted">
                    {formatMoney(
                      multiplyDecimals(batch.qtyRemaining, batch.costPerUnit),
                    )}
                  </p>
                </div>
                {/* A lot without a date cannot be in this list at all — the
                  endpoint only returns lots that expire. */}
                {batch.expiryDate && <ExpiryBadge date={batch.expiryDate} />}
              </li>
            ))}
          </AlertSection>

          {mayReadProducts && (
            <>
              <AlertSection
                title={`SKU paling laris (${TOP_SELLER_DAYS} hari)`}
                total={movement.data?.topSellers.length ?? 0}
                shown={movement.data?.topSellers.length ?? 0}
                loading={movement.loading}
                error={movement.error}
                allowed
                /*
              THE WINDOW IS FIXED AT 30 DAYS and says so in the title — a ranking
              is only comparable against itself, and a leaderboard whose window
              moved with a control would be five products in no particular order.
            */
                note="Diurutkan dari unit terjual, dihitung dari pergerakan stok (penjualan kasir dan faktur, dikurangi yang dibatalkan)."
                empty={`Belum ada penjualan ${TOP_SELLER_DAYS} hari terakhir${scope}.`}
                moreLabel=""
              >
                {(movement.data?.topSellers ?? []).map((row) => (
                  <li
                    key={row.productId}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/inventory/products/${row.productId}`}
                        className="truncate text-sm font-medium hover:text-primary-hover"
                      >
                        {row.name}
                      </Link>
                      <p className="truncate tabular-nums text-xs text-muted">
                        <SkuText value={row.sku} fallback="—" />
                        {/* WHAT IS LEFT, beside what went — the pair is what makes
                        the row worth acting on rather than a leaderboard. */}
                        {` · sisa ${formatQty(row.qtyOnHand)}`}
                        {runsOutIn(row.unitsSold, row.qtyOnHand)}
                      </p>
                    </div>
                    <span className="whitespace-nowrap tabular-nums text-sm font-semibold">
                      {formatQty(row.unitsSold)} terjual
                    </span>
                  </li>
                ))}
              </AlertSection>

              <AlertSection
                title="SKU tidak laku"
                total={movement.data?.idle.length ?? 0}
                shown={movement.data?.idle.length ?? 0}
                loading={movement.loading}
                error={movement.error}
                allowed
                note="Masih ada stoknya tapi tidak terjual sama sekali dalam rentang ini — kandidat diskon, bundling, atau stop beli."
                empty={`Semua barang bergerak dalam ${idleDays} hari terakhir${scope}.`}
                moreLabel=""
                /* The one control a list on this page owns: the window IS the
               question here, unlike the ranking beside it. */
                control={
                  <FilterSelect
                    layout="bar"
                    label="Rentang"
                    ariaLabel="Rentang SKU tidak laku"
                    value={idleDays}
                    options={IDLE_DAY_OPTIONS.map((days) => ({
                      value: days,
                      label: `${days} hari`,
                    }))}
                    onChange={setIdleDays}
                    active={false}
                    unsetValue={-1}
                  />
                }
              >
                {(movement.data?.idle ?? []).map((row) => (
                  <li
                    key={row.productId}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/inventory/products/${row.productId}`}
                        className="truncate text-sm font-medium hover:text-primary-hover"
                      >
                        {row.name}
                      </Link>
                      <p className="truncate tabular-nums text-xs text-muted">
                        <SkuText value={row.sku} fallback="—" />
                      </p>
                    </div>
                    <span className="whitespace-nowrap tabular-nums text-sm">
                      {formatQty(row.qtyOnHand)} tersisa
                    </span>
                  </li>
                ))}
              </AlertSection>
            </>
          )}
        </div>
      </section>

      {/*
        WHERE THE VALUE SITS, as the mockup's closing panel. Drawn only for the
        unfiltered view: with one gudang chosen the headline card above already
        IS that gudang's, and a one-bar chart under it says nothing twice.
      */}
      {mayReadProducts && !warehouseId && valuation.perWarehouse.length > 0 && (
        <Card
          title={<h2 className="text-lg font-bold">Nilai stok per gudang</h2>}
        >
          <ul className="divide-y divide-border rounded-lg border border-border px-4">
            {valuation.perWarehouse.map((row) => (
              <li
                key={row.warehouseId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm"
              >
                <span className="min-w-0 flex-1 font-semibold text-foreground">
                  {row.name}
                  <span className="ml-1.5 text-xs font-normal text-muted tabular-nums">
                    {formatQty(row.qty)} unit
                  </span>
                </span>
                <span
                  className="h-1.5 w-28 overflow-hidden rounded-full bg-tint-neutral"
                  aria-hidden
                >
                  <span
                    className="block h-full rounded-full bg-chart-gross"
                    style={{
                      width: `${shareOf(row.value, valuation.perWarehouse)}%`,
                    }}
                  />
                </span>
                <span className="w-40 text-right text-muted tabular-nums">
                  {formatMoney(row.value)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

/**
 * "248", or a dash — the SKU card's headline.
 *
 * THE TWO HALVES ARE ADDED ONLY WHERE BOTH WERE ASKED FOR. A role holding one
 * grant sees the half it may read; a total that silently left the other out
 * would be a number quoted as the catalogue's size.
 */
function skuTotal(skus: SkuCounts): string {
  const parts = [skus.goods, skus.services].filter(
    (value): value is number => value !== null,
  );
  if (parts.length === 0) return "—";

  return NUMBER.format(parts.reduce((sum, value) => sum + value, 0));
}

/** "214 barang · 34 jasa", naming only the halves that answered. */
function skuSplit(skus: SkuCounts): string {
  const parts: string[] = [];
  if (skus.goods !== null) parts.push(`${NUMBER.format(skus.goods)} barang`);
  if (skus.services !== null)
    parts.push(`${NUMBER.format(skus.services)} jasa`);

  return parts.join(" · ");
}

/**
 * " · habis ~12 hari lagi", or nothing at all.
 *
 * A RATE, NOT A PROMISE: today's stock divided by the average daily sale over
 * the window. Silent where the shelf is empty or the sales are zero — the first
 * is the restock list's business and the second cannot be divided by.
 */
function runsOutIn(unitsSold: string, qtyOnHand: string): string {
  const sold = Number(unitsSold);
  const left = Number(qtyOnHand);
  if (
    !Number.isFinite(sold) ||
    sold <= 0 ||
    !Number.isFinite(left) ||
    left <= 0
  )
    return "";

  const days = Math.round(left / (sold / TOP_SELLER_DAYS));
  return ` · habis ~${NUMBER.format(days)} hari lagi`;
}

/** A warehouse's bar, as a percentage of the largest one. */
function shareOf(value: string, rows: WarehouseValue[]): number {
  const largest = Number(rows[0]?.value ?? 0) || 1;
  return Math.max(Math.min((Number(value) / largest) * 100, 100), 0);
}

const NUMBER = new Intl.NumberFormat("id-ID");

/**
 * One alert list, and every state it can be in.
 *
 * THE COUNT IS THE SERVER'S TOTAL, not `children.length`. The list is the five
 * most urgent rows; the badge is how many there are. Showing "5" next to five
 * rows out of forty would tell somebody the job is nearly done.
 *
 * A ZERO IS NEVER SHOWN WHILE THE ANSWER IS IN FLIGHT, for the same reason the
 * batch tiles do not: "0 perlu restock" that changes its mind a second later has
 * already told somebody there was nothing to do.
 *
 * `note` SITS ABOVE EVERY STATE, including the empty and error ones. It explains
 * what the numbers in this section MEAN, and "0 produk perlu restock" under a
 * filter that changed the comparison needs that sentence exactly as much as a
 * full list does.
 */
function AlertSection({
  title,
  caption,
  tone = "plain",
  control,
  note,
  total,
  shown,
  loading,
  error,
  allowed,
  empty,
  moreLabel,
  seeAll,
  children,
}: {
  title: string;
  caption?: string;
  /**
   * HOW URGENT THIS LIST IS, as a tinted frame — the mockup's own `.na bad` and
   * `.na warn`.
   *
   * "danger" is the books being wrong (stok minus); "warning" is the shelves
   * running out or about to be worth nothing. The two movement lists stay plain:
   * what sells and what does not is worth KNOWING, and tinting everything on a
   * page would leave the reader with no cue at all.
   *
   * IT IS A FILL WITH ORDINARY INK (ui-rules §4), and the count beside the
   * heading says in a number what the colour says at a glance — nothing here
   * depends on seeing the colour.
   */
  tone?: "plain" | "danger" | "warning";
  /**
   * A control in the header — the idle list's window. Only one list has one:
   * where the window IS the question, it belongs beside the heading rather than
   * on a filter bar that would appear to narrow the other four.
   */
  control?: ReactNode;
  /** A line under the header explaining how to read the figures. */
  note?: ReactNode;
  total: number;
  shown: number;
  loading: boolean;
  error: string | null;
  allowed: boolean;
  empty: string;
  /** Copy for the "…and N more" line under a truncated list. */
  moreLabel: string;
  seeAll?: { href: string; label: string };
  children: ReactNode;
}) {
  const remaining = total - shown;

  return (
    <section
      className={cn(
        "rounded-xl border",
        tone === "danger"
          ? "border-danger/40 bg-tint-danger"
          : tone === "warning"
            ? "border-warning/40 bg-tint-warning"
            : "border-border bg-surface",
      )}
    >
      {/* The rules INSIDE a tinted panel follow its frame rather than the
          page's, or a grey hairline cuts across a coloured field. */}
      <header
        className={cn(
          "flex items-center gap-2 border-b px-5 py-3",
          tone === "danger"
            ? "border-danger/25"
            : tone === "warning"
              ? "border-warning/25"
              : "border-border",
        )}
      >
        <h2 className="font-bold">{title}</h2>
        {caption && <span className="text-xs text-muted">{caption}</span>}
        {control}
        <Badge variant="outline" className="ml-auto tabular-nums">
          {allowed ? (loading ? "…" : total) : "—"}
        </Badge>
      </header>

      {note && (
        <p
          className={cn(
            "border-b px-5 py-2.5 text-xs text-muted",
            tone === "danger"
              ? "border-danger/25"
              : tone === "warning"
                ? "border-warning/25"
                : "border-border",
          )}
        >
          {note}
        </p>
      )}

      {!allowed ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          Role Anda tidak punya akses ke data ini.
        </p>
      ) : error ? (
        <div className="px-5 py-4">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
          <Spinner /> Memuat…
        </div>
      ) : shown === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">{empty}</p>
      ) : (
        <>
          <ul className="divide-y divide-border/60">{children}</ul>
          {(remaining > 0 || seeAll) && (
            <div className="flex items-center gap-3 border-t border-border px-5 py-2.5 text-xs text-muted">
              {remaining > 0 && (
                <span>
                  +{remaining} {moreLabel}
                </span>
              )}
              {seeAll && (
                <Link
                  href={seeAll.href}
                  className="ml-auto font-medium text-primary hover:text-primary-hover"
                >
                  {seeAll.label} →
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
