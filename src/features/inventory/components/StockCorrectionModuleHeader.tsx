"use client";

import type { ReactNode } from "react";

import {
  Breadcrumb,
  PageTabs,
  PendingStatTile,
  StatTile,
  type PageTab,
} from "@/components";
import { usePermissions } from "@/features/permissions";

import { useCorrectionCounts } from "../hooks/useCorrectionCounts";

/**
 * The head of the Koreksi Stok module, shared by both its tabs.
 *
 * WHY THESE TWO ARE ONE SCREEN, in the mockup's own words: "Opname menghasilkan
 * koreksi. Keduanya dokumen yang sama, cuma cara membuatnya beda." A count sheet
 * and a hand-typed adjustment both end as the same correction in the ledger —
 * one arrives by walking the shelves, the other by somebody typing what broke.
 * Listing them a menu row apart made them look like two subjects.
 *
 * NO ACTION IN THE HEADER, unlike the Pelanggan and Produk & Varian modules, and
 * that is the two tabs disagreeing rather than an omission. Opname's way in is
 * `OpnameStartCard` — a card with a warehouse and a category to pick, because a
 * count has to be scoped before it can start — and Penyesuaian's button lives on
 * `StockEntriesScreen`, which also serves Stok Awal and would need a prop to
 * decide whose header the button belongs to. Both sit one screen down, in view.
 */
export function StockCorrectionModuleHeader({
  /** Kept for symmetry with the other module headers; neither tab passes one. */
  action,
}: {
  action?: ReactNode;
}) {
  const { can } = usePermissions();
  const mayReadOpnames = can("stockOpnames", "read");
  /**
   * READ, not create — and this is a deliberate change from what the rail used
   * to do. The Penyesuaian Stok ROW was gated on `stockMovements:create`,
   * because a menu row is an invitation and that screen's one action is a write.
   * The row is "Koreksi Stok" now, and this is a tab inside a module the reader
   * has already opened: gating it on create would mean somebody who may read the
   * list (the page allows it, and the stock card is full of rows it explains)
   * could open /adjustments by URL and find a tab bar with nothing marked
   * current. The create button inside is still gated on create.
   */
  const mayReadAdjustments = can("stockMovements", "read");

  const counts = useCorrectionCounts(mayReadOpnames, mayReadAdjustments);

  const tabs: PageTab[] = [
    ...(mayReadOpnames
      ? [{ label: "Opname", href: "/dashboard/inventory/opname" }]
      : []),
    ...(mayReadAdjustments
      ? [{ label: "Penyesuaian", href: "/dashboard/inventory/adjustments" }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Breadcrumb
            items={[
              { label: "Inventori", href: "/dashboard/inventory" },
              { label: "Koreksi Stok" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Koreksi Stok
          </h1>
        </div>
        {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
      </div>

      <PageTabs tabs={tabs} ariaLabel="Bagian koreksi stok" />

      <section
        aria-label="Ringkasan koreksi stok"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {mayReadOpnames && (
          <>
            <StatTile
              label="Opname bulan ini"
              value={NUMBER.format(counts.opnames.total)}
              caption="dihitung dari tanggal opname"
              loading={counts.opnames.loading}
              error={counts.opnames.error}
            />
            {/*
              THE MOCKUP'S "Menunggu persetujuan", answered with the thing this
              system actually has. There is no approval step — an opname is
              `draft` or `submitted` — but the question behind that tile is real
              and this is it: a count somebody started and never finished moves
              no stock, so the shelves stay wrong while the sheet says otherwise.

              NOT LIMITED TO THIS MONTH, unlike its neighbour. An August sheet
              still open in September is exactly the one worth surfacing, and a
              monthly window would hide it the moment it began to matter.
            */}
            <StatTile
              label="Opname belum selesai"
              value={NUMBER.format(counts.drafts.total)}
              caption="draft, belum disubmit"
              loading={counts.drafts.loading}
              error={counts.drafts.error}
            />
          </>
        )}
        {mayReadAdjustments && (
          <StatTile
            label="Penyesuaian bulan ini"
            value={NUMBER.format(counts.adjustments.total)}
            caption="dokumen, bukan baris produk"
            loading={counts.adjustments.loading}
            error={counts.adjustments.error}
          />
        )}

        {/*
          THE MOCKUP'S "Selisih nilai". Both endpoints carry the figure per
          document — an opname row has `totalDiffValue` — but neither sums it,
          so the only way to total a month is to page every document and add
          them up in the browser. That is a report, not a tile.

          The mockup's fourth card, "Opname terjadwal", is left off rather than
          badged beside this one: there is no scheduling anywhere in the system,
          so it is not a number waiting on an endpoint — it is a feature nobody
          has specified.
        */}
        <PendingStatTile
          label="Selisih nilai"
          blockedBy="Belum ada endpoint yang menjumlahkan selisih per periode"
        />
      </section>
    </div>
  );
}

const NUMBER = new Intl.NumberFormat("id-ID");
