"use client";

import { Card } from "@/components";
import { formatDate, formatRupiah } from "@/features/memberships/labels";

import { weekdaysText } from "../labels";
import {
  coretPrice,
  discountPercent,
  type CoretItemDraft,
  type ItemFacts,
  type PromoDraft,
} from "../promoDraft";
import { useVariantName } from "./CoretItemsEditor";

/**
 * Pratinjau di kasir & website — the sticky right column (BO mockup
 * `coretPreview`). Each item as a till tile reads it: promo price, the normal
 * price struck through, and the −% badge. A per-variant item shows a row per
 * variant in the promo.
 *
 * AN ESTIMATE from the catalogue as it is now; the till asks the server.
 */
export function PromoPreview({
  draft,
  factsOf,
}: {
  draft: PromoDraft;
  factsOf: (item: CoretItemDraft) => ItemFacts | null;
}) {
  const days = weekdaysText(draft.weekdays);

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
          Pratinjau di kasir &amp; website
        </h2>

        {draft.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
            Tambahkan item untuk melihat pratinjau.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {draft.items.map((item) => (
              <PreviewItem key={item.key} item={item} facts={factsOf(item)} />
            ))}
          </ul>
        )}

        <div className="text-sm">
          <p className="font-semibold text-foreground">{draft.name.trim() || "Promo tanpa nama"}</p>
          <p className="text-foreground tabular-nums">
            {draft.startDate ? formatDate(draft.startDate) : "—"} –{" "}
            {draft.endDate ? formatDate(draft.endDate) : "tanpa batas"}
          </p>
          {days && <p className="text-muted">Hanya hari {days}</p>}
          {draft.draft && <p className="mt-1 text-muted">Masih draft — belum tampil di kasir.</p>}
        </div>
      </div>
    </Card>
  );
}

interface PreviewRow {
  key: string;
  label: string | null;
  normal: string | null;
}

function PreviewItem({ item, facts }: { item: CoretItemDraft; facts: ItemFacts | null }) {
  const variantName = useVariantName();

  const rows: PreviewRow[] = !facts
    ? [{ key: "x", label: null, normal: null }]
    : facts.variants.length === 0
      ? [{ key: "x", label: null, normal: facts.normalPrice }]
      : facts.variants.map((variant) => ({
          key: variant.id,
          label: variantName(variant),
          normal: variant.normalPrice,
        }));

  /* A per-variant promo lists the variants in it; "same" lists them all, since
     each can work out differently (a cheap variant may fall out of a fixed price). */
  const shown =
    item.priceMode === "variant"
      ? rows.filter((row) => coretPrice(item, row.normal, row.key) !== null)
      : rows;

  if (shown.length === 0) {
    return (
      <li className="rounded-lg border border-border px-3 py-2.5">
        <p className="text-sm font-semibold text-foreground">{item.name}</p>
        <p className="text-sm text-muted">Belum ada varian dengan harga promo.</p>
      </li>
    );
  }

  /* One tile per row, the way the till draws each variant. */
  return (
    <>
      {shown.map((row) => {
        const price = coretPrice(item, row.normal, row.key);
        const off = discountPercent(row.normal, price);
        return (
          <li key={row.key} className="rounded-xl border border-border p-4">
            <p className="text-sm font-semibold text-foreground">
              {item.name}
              {row.label && (
                <span className="font-normal text-muted"> · {row.label}</span>
              )}
            </p>
            {price !== null ? (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm tabular-nums">
                <span className="font-semibold text-danger">{formatRupiah(String(price))}</span>
                <s className="text-muted">{formatRupiah(row.normal)}</s>
                {off > 0 && (
                  <span className="rounded-md bg-danger px-1.5 py-0.5 text-xs font-semibold text-danger-foreground">
                    −{off}%
                  </span>
                )}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-muted tabular-nums">
                {formatRupiah(row.normal)}
                {row.normal && item.value.trim() ? " · tidak ikut promo" : ""}
              </p>
            )}
          </li>
        );
      })}
    </>
  );
}
