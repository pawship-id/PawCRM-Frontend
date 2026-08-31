"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

import {
  Alert,
  FilterSelect,
  Spinner,
  namedOptions,
  withAll,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/features/permissions";
import { useTenant } from "@/features/tenant";
import type { Action, Feature } from "@/features/permissions";
import { formatMoney, formatQty, multiplyDecimals } from "@/utils/decimal";

import { useExpiringAlert } from "../hooks/useExpiringAlert";
import { useLowStockAlert } from "../hooks/useLowStockAlert";
import { useNegativeStockAlert } from "../hooks/useNegativeStockAlert";
import { useWarehouseOptions } from "../hooks/useWarehouseOptions";
import { ExpiryBadge } from "./ExpiryBadge";

/**
 * The Inventory landing screen: what needs attention, and the way in to every
 * screen in the module.
 *
 * THE ALERT LISTS ARE CHOSEN RATHER THAN EXHAUSTIVE. A shop owner opening this
 * page is asking one of three questions — "what is the book wrong about", "what
 * do I need to reorder" and "what is about to go bad" — and all three are
 * answers you act on the same day. Everything else (full stock value, movement
 * history) is a click away on the stock card and the batch report, where there is
 * room to read it properly.
 *
 * STOK MINUS LEADS, ACROSS THE FULL WIDTH, and it is the only list here that is
 * about the BOOKS rather than about the shelves. The other two say the shop is
 * running out of something real; this one says a number on this screen is
 * already wrong — goods were sold that the system never recorded arriving — and
 * every figure derived from it, the stock value on a report included, is wrong
 * with it. It earns the top because nothing below it can be trusted until it is
 * cleared.
 *
 * IT IS THE PRICE OF LETTING A TILL OVERSELL. `settings.allowNegativeStock` is
 * true by default, so a cashier can sell an empty shelf and the balance goes
 * negative rather than the sale being refused — which is the honest trade, but
 * only while somebody can SEE what it produced. Without this section the setting
 * would quietly accumulate discrepancies nobody is shown.
 *
 * BOTH LISTS ARE THE SERVER'S ANSWER, not a client-side scan. This screen used
 * to be a prototype over an in-memory store and computed both itself; each was
 * wrong in a way nobody would notice:
 *
 *   perlu restock — it compared ONE WAREHOUSE's shelf against `minStock`, which
 *                   is a per-PRODUCT threshold, and listed the same product once
 *                   per warehouse. `GET /products/low-stock` sums the product's
 *                   stock across warehouses, which is what the threshold means.
 *   kedaluwarsa   — it could only ever see the lots it happened to hold, so the
 *                   count was the count of the fixtures.
 *
 * Each list shows the most urgent FIVE and reports the true total beside it: a
 * landing page answers "is there anything to do", and a number that only counted
 * the rows on screen is worse than no number because it looks like a total.
 *
 * EACH SECTION IS GATED ON ITS OWN GRANT, and a section a user cannot read is
 * not requested at all. The seeded Staff role holds both, but a narrower custom
 * role need not — and firing the request anyway would paint a 403 across the
 * landing page instead of simply not offering the section.
 *
 * ONE WAREHOUSE FILTER SITS ABOVE BOTH LISTS, because the question this page
 * answers is asked from somewhere: a person standing in one shop is not asking
 * what the warehouse across town needs. It stands alone rather than behind a
 * Filter button, so it applies on click and shows its own value (§8) — one
 * field is not a panel.
 *
 * IT NARROWS THE TWO LISTS AND NOTHING ELSE. The cards below are navigation,
 * and a screen you have not opened yet has no warehouse. Each destination
 * carries its own filter where the choice means something there.
 *
 * THE TWO LISTS DO NOT NARROW ALIKE, and the low-stock one says so. A lot is
 * physically in one warehouse, so filtering the expiry list only changes which
 * rows are counted. `minStock` is a per-PRODUCT threshold, so filtering the
 * restock list compares one location's shelf against the whole product's
 * minimum — the right question for one shop, and a misreading waiting to happen
 * if nobody says which comparison is on screen.
 */
const ACTIONS: Array<{
  href: string;
  title: string;
  description: string;
  /** Mirrors the sidebar's gate for the same screen — see features/dashboard/nav.ts. */
  feature: Feature;
  action: Action;
}> = [
  {
    href: "/dashboard/inventory/products",
    title: "Produk & Varian",
    description:
      "Katalog: produk satuan, keluarga varian dua tingkat, dan bundle.",
    feature: "products",
    action: "read",
  },
  {
    href: "/dashboard/inventory/categories",
    title: "Kategori",
    description:
      "Rak arsip katalog. Setiap produk harus punya satu sebelum bisa dibuat.",
    feature: "categories",
    action: "read",
  },
  {
    href: "/dashboard/inventory/stock-card",
    title: "Kartu Stok",
    description:
      "Riwayat pergerakan satu produk di satu gudang, dengan saldo berjalan.",
    feature: "stockMovements",
    action: "read",
  },
  {
    href: "/dashboard/inventory/batches",
    title: "Batch & Expired",
    description:
      "Semua batch, diurutkan dari yang paling dekat kedaluwarsa. Urutan FEFO.",
    feature: "productBatches",
    action: "read",
  },
  {
    href: "/dashboard/inventory/opname",
    title: "Stok Opname",
    description:
      "Hitung fisik, cocokkan dengan sistem, selisihnya jadi penyesuaian dan jurnal.",
    feature: "stockOpnames",
    action: "read",
  },
  {
    href: "/dashboard/inventory/transfers",
    title: "Transfer Stok",
    description:
      "Riwayat perpindahan barang antar gudang, dan tempat mencatat yang baru. Batch beserta tanggal kedaluwarsanya ikut pindah.",
    feature: "stockMovements",
    action: "create",
  },
  {
    href: "/dashboard/inventory/opening-stock",
    title: "Stok Awal",
    description:
      "Isi stok pertama produk yang sudah terdaftar tapi belum pernah punya stok. Tercatat sebagai modal, bukan kerugian.",
    feature: "products",
    action: "create",
  },
  {
    href: "/dashboard/inventory/adjustments",
    title: "Penyesuaian cepat",
    description:
      "Koreksi satu barang di luar opname — rusak, hilang, atau terpakai sendiri.",
    feature: "stockMovements",
    action: "create",
  },
];

export function InventoryHub() {
  const { can } = usePermissions();

  const mayReadProducts = can("products", "read");
  const mayReadBatches = can("productBatches", "read");

  /** Empty = every gudang, the repo's unset convention for a filter. */
  const [warehouseId, setWarehouseId] = useState("");

  // Only fetched where there is a list for it to narrow — see the hook.
  const warehouses = useWarehouseOptions(mayReadProducts || mayReadBatches);
  const lowStock = useLowStockAlert(mayReadProducts, warehouseId);
  const negative = useNegativeStockAlert(mayReadProducts, warehouseId);
  const expiring = useExpiringAlert(mayReadBatches, warehouseId);

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

  const actions = ACTIONS.filter((action) =>
    can(action.feature, action.action),
  );

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
          <h1 className="text-2xl font-extrabold text-foreground">Inventory</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Stok dihitung dari buku besar pergerakan — bukan angka yang disimpan
            terpisah. Setiap saldo di layar ini bisa dihitung ulang dari nol.
          </p>
        </div>

        {/* Hidden outright where there is no list to narrow — the cards below
            are links, and a filter that changes nothing on screen is worse than
            no filter. Also hidden until the lookup answers: an empty dropdown
            that fills in a moment later is a control people click twice. */}
        {warehouses.warehouses.length > 0 && (
          <FilterSelect
            label="Gudang"
            ariaLabel="Filter gudang"
            value={warehouseId}
            options={withAll(
              namedOptions(warehouses.warehouses, (warehouse) =>
                warehouse.isActive
                  ? warehouse.name
                  : `${warehouse.name} (nonaktif)`,
              ),
              "Semua gudang",
            )}
            align="end"
            onChange={setWarehouseId}
          />
        )}
      </div>

      {/* Separate from each list's own error: the picker can fail to load while
          both alerts render perfectly well, unfiltered. */}
      {warehouses.error && <Alert variant="error">{warehouses.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group rounded-xl border border-border bg-surface p-5 transition hover:border-primary hover:shadow-sm"
          >
            <p className="font-semibold text-foreground group-hover:text-primary-hover">
              {action.title}
            </p>
            <p className="mt-1.5 text-sm text-muted">{action.description}</p>
          </Link>
        ))}
      </div>

      {showNegative && (
        <AlertSection
          title="Stok minus"
          caption={warehouseName}
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
              Barang terjual saat stok tercatat habis, jadi saldonya jadi minus.
              Biasanya karena penerimaan barang belum dicatat — catat
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
            NO "LIHAT SEMUA", deliberately: nothing lists every negative row yet.
            A link to the stock card would land somebody on a screen that asks
            WHICH product before it can show anything — which is the question
            they came here to have answered.
          */
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
                  {row.sku ?? "—"}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <AlertSection
          title="Perlu restock"
          caption={warehouseName}
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
            <li key={product._id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/inventory/products/${product._id}`}
                  className="truncate text-sm font-medium hover:text-primary-hover"
                >
                  {product.name}
                </Link>
                <p className="truncate tabular-nums text-xs text-muted">
                  {product.sku ?? "—"}
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
          caption={`dalam ${expiring.withinDays} hari${
            warehouseName ? ` · ${warehouseName}` : ""
          }`}
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
      </div>
    </div>
  );
}

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
    <section className="rounded-xl border border-border bg-surface">
      <header className="flex items-center gap-2 border-b border-border px-5 py-3">
        <h2 className="font-bold">{title}</h2>
        {caption && <span className="text-xs text-muted">{caption}</span>}
        <Badge variant="outline" className="ml-auto tabular-nums">
          {allowed ? (loading ? "…" : total) : "—"}
        </Badge>
      </header>

      {note && (
        <p className="border-b border-border px-5 py-2.5 text-xs text-muted">
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
