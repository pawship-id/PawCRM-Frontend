"use client";

import { Lock, Trash2 } from "lucide-react";

import { Card, FIELD_HEIGHT, SelectField } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToneBadge } from "@/features/memberships";
import { FieldBlock, Segmented } from "@/features/memberships/components/FormBits";
import { formatRupiah } from "@/features/memberships/labels";
import { variantKeyLabel } from "@/features/memberships/variantKey";
import { usePetOptions } from "@/hooks/usePetOptions";
import { cn } from "@/lib/utils";

import { CORET_KIND_LABEL, type CoretKind } from "../labels";
import {
  coretPrice,
  discountPercent,
  newCoretItem,
  type CoretItemDraft,
  type ItemFacts,
} from "../promoDraft";
import { PromoItemPicker } from "./PromoItemPicker";

const KIND_OPTIONS = (Object.keys(CORET_KIND_LABEL) as CoretKind[]).map((value) => ({
  value,
  label: CORET_KIND_LABEL[value],
}));

/** "Rp 120.000" or "Rp 95.000–180.000" across an item's variants. */
export function normalPriceText(facts: ItemFacts | null): string {
  if (!facts) return "—";
  if (!facts.variants.length) return formatRupiah(facts.normalPrice);
  const prices = facts.variants
    .map((variant) => Number(variant.normalPrice))
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);
  if (!prices.length) return "—";
  const low = formatRupiah(String(prices[0]));
  if (prices[0] === prices[prices.length - 1]) return low;
  return `${low}–${formatRupiah(String(prices[prices.length - 1])).replace(/^\D+/, "")}`;
}

/** A variant's words — its own label, or a service variant key in the tenant's words. */
export function useVariantName() {
  const { label } = usePetOptions();
  return (variant: { id: string; label: string | null }) =>
    variant.label ?? variantKeyLabel(variant.id, (type, id) => label(type, id));
}

/**
 * Item dan harga promo — one card per item (BO mockup `coretItem`).
 *
 * An item with variants chooses "Sama untuk semua varian" (one Diskon % /
 * Potongan Rp / Harga promo for all) or "Atur per varian" (a table of normal
 * and promo price per variant, with the −% each works out to). Product
 * variants are the parent's live variants; a service's are its price grid,
 * keyed like membership's (`species|size|fur`).
 *
 * `locked` (the promo has been used) and `readOnly` (it has ended) both draw
 * the same cards without any control that changes them.
 */
export function CoretItemsEditor({
  items,
  onChange,
  factsOf,
  locked,
  readOnly,
}: {
  items: CoretItemDraft[];
  onChange: (items: CoretItemDraft[]) => void;
  factsOf: (item: CoretItemDraft) => ItemFacts | null;
  locked: boolean;
  readOnly: boolean;
}) {
  const frozen = locked || readOnly;
  const taken = new Set(items.map((item) => `${item.targetType}:${item.refId}`));

  const patch = (key: string, change: Partial<CoretItemDraft>) =>
    onChange(items.map((item) => (item.key === key ? { ...item, ...change } : item)));

  return (
    <Card
      title="Item dan harga promo"
      action={<span className="text-sm text-muted tabular-nums">{items.length} item</span>}
    >
      <div className="flex flex-col gap-4">
        {locked && !readOnly && (
          <div className="flex items-start gap-2 rounded-lg bg-tint-info p-3 text-sm">
            <Lock className="mt-0.5 size-4 flex-none text-info" aria-hidden />
            <p>
              Item dan harga terkunci karena promo sudah dipakai. Nama, tanggal, kuota dan batasan
              masih bisa diubah.
            </p>
          </div>
        )}

        {items.length === 0 ? (
          <p className="rounded-lg bg-surface-hover p-4 text-sm text-muted">
            Belum ada item. Tambahkan produk atau layanan di bawah.
          </p>
        ) : (
          items.map((item) => (
            <CoretItemCard
              key={item.key}
              item={item}
              facts={factsOf(item)}
              frozen={frozen}
              onPatch={(change) => patch(item.key, change)}
              onRemove={() => onChange(items.filter((entry) => entry.key !== item.key))}
            />
          ))
        )}

        {!frozen && (
          <PromoItemPicker
            taken={taken}
            onPick={(picked) => {
              // No `withVariants` here: a coret item prices its variants itself.
              if (picked.targetType === "variant") return;
              onChange([...items, newCoretItem({ ...picked, targetType: picked.targetType })]);
            }}
          />
        )}
      </div>
    </Card>
  );
}

function CoretItemCard({
  item,
  facts,
  frozen,
  onPatch,
  onRemove,
}: {
  item: CoretItemDraft;
  facts: ItemFacts | null;
  frozen: boolean;
  onPatch: (change: Partial<CoretItemDraft>) => void;
  onRemove: () => void;
}) {
  const variantName = useVariantName();
  const variants = facts?.variants ?? [];
  const showModes = variants.length > 1 || item.priceMode === "variant";
  const perVariant = item.priceMode === "variant";

  return (
    <section
      aria-label={item.name}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-foreground">{item.name}</h4>
          <p className="text-sm text-muted tabular-nums">
            {item.targetType === "service" ? "Layanan" : "Produk"} · normal {normalPriceText(facts)}
          </p>
        </div>
        {!frozen && (
          <Button
            type="button"
            variant="ghost"
            className="ml-auto size-9"
            aria-label={`Hapus ${item.name}`}
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      {showModes && (
        <Segmented
          ariaLabel={`Harga varian ${item.name}`}
          value={item.priceMode}
          options={[
            { value: "same", label: "Sama untuk semua varian", disabled: frozen },
            { value: "variant", label: "Atur per varian", disabled: frozen },
          ]}
          onChange={(priceMode) => onPatch({ priceMode })}
        />
      )}

      {perVariant ? (
        variants.length === 0 ? (
          <p className="text-sm text-muted">Memuat varian…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table aria-label={`Harga promo per varian ${item.name}`}>
              <TableHeader>
                <TableRow>
                  <TableHead>Varian</TableHead>
                  <TableHead className="text-right">Harga normal</TableHead>
                  <TableHead className="text-right">Harga promo</TableHead>
                  <TableHead className="text-right">Diskon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((variant) => {
                  const name = variantName(variant);
                  const price = coretPrice(item, variant.normalPrice, variant.id);
                  const off = discountPercent(variant.normalPrice, price);
                  return (
                    <TableRow key={variant.id}>
                      <TableCell>{name}</TableCell>
                      <TableCell className="text-right text-muted tabular-nums">
                        {formatRupiah(variant.normalPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          inputMode="decimal"
                          value={item.variantPrices[variant.id] ?? ""}
                          placeholder="Tidak ikut"
                          disabled={frozen}
                          aria-label={`Harga promo ${name}`}
                          onChange={(event) =>
                            onPatch({
                              variantPrices: { ...item.variantPrices, [variant.id]: event.target.value },
                            })
                          }
                          className="ml-auto max-w-40 text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {off > 0 ? (
                          <ToneBadge tone="danger" label={`−${off}%`} />
                        ) : (
                          <span className="text-sm text-muted">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <p className="border-t border-border px-3 py-2 text-xs text-muted">
              Kosongkan harga promo varian yang tidak ikut promo.
            </p>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid items-start gap-3 sm:grid-cols-2">
            {/*
              A DROPDOWN, not three segment buttons (BO, 10 November 2026): the
              segments wrapped onto two lines on a narrow card, and a short
              closed list that needs no searching is SelectField's job (§16).
            */}
            <SelectField
              label="Potongan"
              value={item.kind}
              options={KIND_OPTIONS}
              disabled={frozen}
              onChange={(kind) => onPatch({ kind: kind as CoretKind })}
            />
            <FieldBlock
              label={
                item.kind === "discount_percent"
                  ? "Diskon (%)"
                  : item.kind === "discount_amount"
                    ? "Potongan (Rp)"
                    : "Harga promo (Rp)"
              }
            >
              <Input
                inputMode="decimal"
                value={item.value}
                disabled={frozen}
                placeholder={item.kind === "discount_percent" ? "mis. 10" : "mis. 15.000"}
                aria-label={`Nilai potongan ${item.name}`}
                onChange={(event) => onPatch({ value: event.target.value })}
                className={cn(FIELD_HEIGHT, "tabular-nums")}
              />
            </FieldBlock>
          </div>
          {variants.length > 1 && item.kind === "special_price" && (
            <p className="text-xs text-muted">
              Varian yang harga normalnya di bawah harga promo tidak ikut promo.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
