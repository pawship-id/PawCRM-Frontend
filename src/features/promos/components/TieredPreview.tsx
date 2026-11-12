"use client";

import { Card } from "@/components";
import { formatDate, formatRupiah } from "@/features/memberships/labels";

import { weekdaysText } from "../labels";
import { tierFor, type GroupMemberDraft, type ItemFacts, type PromoDraft } from "../promoDraft";

/**
 * Pratinjau Diskon bertingkat — the sticky right column (BO mockup
 * `tingkatPreview`): the tiers as a customer reads them, then an example
 * basket — two of the group's first item and one of its second — with the
 * tier it reaches and the total.
 *
 * AN ESTIMATE from the catalogue as it is now (a product with variants is
 * priced at its first variant); the till asks the server.
 */
export function TieredPreview({
  draft,
  factsOf,
}: {
  draft: PromoDraft;
  factsOf: (member: GroupMemberDraft) => ItemFacts | null;
}) {
  const days = weekdaysText(draft.weekdays);
  const tiers = [...draft.tiers]
    .map((tier) => ({ key: tier.key, min: Number(tier.min), value: Number(tier.value.replace(",", ".")) }))
    .filter((tier) => tier.min > 0 && tier.value > 0)
    .sort((a, b) => a.min - b.min);

  const sample = draft.group.slice(0, 2).map((member, index) => {
    const facts = factsOf(member);
    const price = Number(facts?.normalPrice ?? facts?.variants[0]?.normalPrice ?? 0) || 0;
    return { member, qty: index === 0 ? 2 : 1, price };
  });
  const qty = sample.reduce((sum, row) => sum + row.qty, 0);
  const subtotal = sample.reduce((sum, row) => sum + row.qty * row.price, 0);
  const tier = tierFor(draft.tiers, qty);
  const off = tier ? Math.round((subtotal * tier.value) / 100) : 0;

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
          Yang dilihat pelanggan
        </h2>

        {tiers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
            Isi tingkat diskon untuk melihat pratinjau.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {tiers.map((row) => (
              <li key={row.key} className="py-2 first:pt-0">
                Beli <b className="text-foreground">{row.min} item</b> atau lebih →{" "}
                <b className="text-foreground">diskon {row.value}%</b>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold tracking-widest text-muted uppercase">
            Contoh keranjang
          </h3>
          {sample.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
              Tambahkan item ke kelompok untuk melihat contoh.
            </p>
          ) : (
            <div className="flex flex-col text-sm">
              {sample.map((row) => (
                <div
                  key={row.member.key}
                  className="flex items-start justify-between gap-3 border-b border-border py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{row.member.name}</p>
                    <p className="text-muted tabular-nums">
                      {row.qty} × {row.price ? formatRupiah(String(row.price)) : "—"}
                    </p>
                  </div>
                  <span className="flex-none text-foreground tabular-nums">
                    {row.price ? formatRupiah(String(row.qty * row.price)) : "—"}
                  </span>
                </div>
              ))}
              <div className="flex justify-between gap-3 pt-2 text-muted tabular-nums">
                <span>{qty} item dari kelompok</span>
                <span>{formatRupiah(String(subtotal))}</span>
              </div>
              <div className="flex justify-between gap-3 py-1 tabular-nums">
                <span className="text-muted">{tier ? `Diskon ${tier.value}%` : "Belum capai tingkat"}</span>
                <span className="font-semibold text-success">−{formatRupiah(String(off))}</span>
              </div>
              <div className="flex justify-between gap-3 border-t border-border pt-2 text-base font-bold text-foreground tabular-nums">
                <span>Total</span>
                <span>{formatRupiah(String(subtotal - off))}</span>
              </div>
            </div>
          )}
        </div>

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
