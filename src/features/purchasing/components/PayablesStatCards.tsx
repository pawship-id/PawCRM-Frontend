"use client";

import { PendingStatTile, StatTile } from "@/components";
import { formatMoney } from "@/utils/decimal";

/** The default, before the real figures (and their own `horizonDays`) have loaded. */
const DEFAULT_HORIZON_DAYS = 7;

/**
 * The two real aggregates this strip draws from — already summed server-side,
 * by whichever scope the caller asked for.
 */
export interface PayablesStatFigures {
  outstanding: { amount: string; invoiceCount: number };
  dueSoon: { amount: string; invoiceCount: number; horizonDays: number };
  /**
   * Bills raised inside the period. Optional: only `/summary` answers it —
   * Faktur's `/outstanding` knows no period — so that tab leaves it off and the
   * card stays "Segera" there.
   */
  invoiced?: { amount: string; invoiceCount: number };
}

/**
 * The mockup's four-card strip (`buloo-navigation-v3`, Pembelian tab),
 * promoted to a shared component 2 October 2026 on request — it sat on the
 * Faktur tab alone until Ringkasan was asked for the same row, the standing
 * rule for promoting a feature component (ui-rules §14, "a second caller").
 *
 * THREE OF THE FOUR CARDS CAN BE REAL. "Utang belum lunas" and "Jatuh tempo ≤N
 * hari" are `outstanding` and `dueSoon` off `/purchase-invoices/summary` (or its
 * `/outstanding` sibling, which answers the same two questions unscoped) — see
 * `PayablesStatFigures`. "Pembelian periode" is `invoiced` off `/summary` only
 * (3 October 2026): the sum of invoice VALUE by invoice date inside the tab's
 * period, which `/outstanding` cannot answer — so a caller without it (Faktur)
 * gets the "Segera" tile instead of a number from the wrong scope.
 *
 * "BARANG BELUM DITERIMA" IS A `PendingStatTile`, NOT INVENTED. It has no backing
 * concept at all: a purchase invoice's `goodsReceiptId` is required and
 * one-to-one (see the backend model), so every invoice in this schema is already
 * created FROM a completed receipt — there is no partial or pending receiving
 * state to count. Badging it "Segera" says so rather than quietly dropping it or
 * faking a number.
 *
 * NO HOOK IN HERE, DELIBERATELY. `PayablesScreen` and `PurchasingHub` scope the
 * same two aggregates differently ON PURPOSE — Faktur's figures are the whole
 * book, unfiltered; Ringkasan's follow the cabang its own `PayablesScopeCard`
 * sets (the period does not touch either figure — see that card's own doc). A
 * fetch owned here would have to pick one scope and get the other screen wrong,
 * so each caller fetches its own and hands this component the result.
 *
 * `onDueSoonClick` IS OPTIONAL, and Ringkasan does not pass one: that tab has no
 * invoice table of its own to drill into, unlike Faktur's. When given, this
 * component still withholds it while there is nothing to drill into
 * (`dueSoon.invoiceCount === 0`) — the caller only needs to know whether
 * clicking would land somewhere NEW (its own view/filter is already on that
 * bucket or not), not whether the bucket is empty.
 *
 * REPLACED RINGKASAN'S OWN THREE-CARD ROW (2 October 2026, on request), which
 * ALSO DROPPED "HUTANG TERBAYAR PERIODE INI" — the one figure among the three
 * with no equivalent among these four. It is still fetched (`summary.paid`),
 * just no longer drawn anywhere; the period control on `PayablesScopeCard` now
 * narrows nothing visible on this tab, only the cabang does. Nobody has asked
 * either to be resolved yet.
 */
export function PayablesStatCards({
  figures,
  loading,
  failed,
  onDueSoonClick,
  periodScoped = false,
}: {
  /** Null while loading or after the request failed. */
  figures: PayablesStatFigures | null;
  loading: boolean;
  failed: boolean;
  /** Faktur drills into its own list; Ringkasan has none to offer. */
  onDueSoonClick?: () => void;
  /**
   * The figures came from `/summary`, which carries `invoiced`. An explicit flag
   * rather than "`figures.invoiced` exists", so the card does not flip from a
   * "Segera" tile to a loading one when the request lands.
   */
  periodScoped?: boolean;
}) {
  const horizonDays = figures?.dueSoon.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const dueSoonCount = figures?.dueSoon.invoiceCount ?? 0;

  return (
    <section
      aria-label="Ringkasan faktur pembelian"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {periodScoped ? (
        <StatTile
          label="Pembelian periode"
          value={figures?.invoiced ? formatMoney(figures.invoiced.amount) : "—"}
          caption={
            figures?.invoiced
              ? `${figures.invoiced.invoiceCount} faktur`
              : undefined
          }
          loading={loading}
          error={failed}
        />
      ) : (
        <PendingStatTile
          label="Pembelian periode"
          blockedBy="Total nilai faktur yang diterbitkan periode ini belum dihitung di ringkasan ini."
        />
      )}
      <StatTile
        label="Utang belum lunas"
        value={figures ? formatMoney(figures.outstanding.amount) : "—"}
        caption={
          figures ? `${figures.outstanding.invoiceCount} faktur` : undefined
        }
        loading={loading}
        error={failed}
      />
      <StatTile
        label={`Jatuh tempo ≤ ${horizonDays} hari`}
        value={figures ? `${dueSoonCount} faktur` : "—"}
        caption={figures ? formatMoney(figures.dueSoon.amount) : undefined}
        loading={loading}
        error={failed}
        // Drills into the same bucket, when there is one to drill into and a
        // caller offered a way — see this component's own doc and
        // `StatTile`'s, on the mockup's `.mcard.click`.
        onClick={dueSoonCount > 0 ? onDueSoonClick : undefined}
      />
      <PendingStatTile
        label="Barang belum diterima"
        blockedBy="Setiap faktur pembelian dibuat dari penerimaan yang sudah lengkap — belum ada status barang belum diterima."
      />
    </section>
  );
}
