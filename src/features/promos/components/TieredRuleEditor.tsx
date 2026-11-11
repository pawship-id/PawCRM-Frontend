"use client";

import { Lock, Plus, Trash2, X } from "lucide-react";

import { Card, FIELD_HEIGHT } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldBlock, Segmented } from "@/features/memberships/components/FormBits";
import { cn } from "@/lib/utils";

import { itemKey, nextTier, type GroupMemberDraft, type TierDraft } from "../promoDraft";
import { PromoItemPicker } from "./PromoItemPicker";

/** Most tiers a promo holds — the server's MAX_TIERS. */
const MAX_TIERS = 5;

const MEMBER_HINT: Record<GroupMemberDraft["targetType"], string> = {
  product: "semua varian",
  variant: "varian ini saja",
  service: "layanan",
};

/**
 * DISKON BERTINGKAT — the SYARAT and the tiers (BO mockup `tingkatForm`,
 * 10 November 2026).
 *
 * Two cards, as the mockup draws them:
 *   · Syarat — the group (products with every variant, one variant, or a
 *     service) and what it counts (Jumlah item; Nilai belanja "menyusul").
 *   · Tingkatan diskon — "Beli minimal n item → diskon x%" rows, and who the
 *     discount lands on (every item in the group; the other two "menyusul",
 *     reserved for Beli X gratis Y and Beli A dapat B).
 *
 * The rules the rows must meet (whole numbers ≥ 2, both columns climbing) are
 * `tieredProblem` in promoDraft.ts, said on the action bar.
 *
 * `locked` (used) and `readOnly` (ended) draw the same thing without controls.
 */
export function TieredRuleEditor({
  group,
  tiers,
  onChange,
  locked,
  readOnly,
}: {
  group: GroupMemberDraft[];
  tiers: TierDraft[];
  onChange: (patch: { group?: GroupMemberDraft[]; tiers?: TierDraft[] }) => void;
  locked: boolean;
  readOnly: boolean;
}) {
  const frozen = locked || readOnly;
  const taken = new Set(group.map((member) => `${member.targetType}:${member.refId}`));

  const patchTier = (key: string, change: Partial<TierDraft>) =>
    onChange({ tiers: tiers.map((tier) => (tier.key === key ? { ...tier, ...change } : tier)) });

  return (
    <>
      <Card
        title="Syarat"
        action={<span className="text-sm text-muted tabular-nums">{group.length} item</span>}
      >
        <div className="flex flex-col gap-4">
          {locked && !readOnly && (
            <div className="flex items-start gap-2 rounded-lg bg-tint-info p-3 text-sm">
              <Lock className="mt-0.5 size-4 flex-none text-info" aria-hidden />
              <p>
                Kelompok dan tingkat diskon terkunci karena promo sudah dipakai. Nama, tanggal, kuota
                dan batasan masih bisa diubah.
              </p>
            </div>
          )}

          <FieldBlock
            label="Kelompok item"
            tooltip="Pembeli boleh mencampur item mana pun dari kelompok ini untuk mencapai jumlah minimal. Pilih produk (semua varian ikut) atau varian tertentu saja."
          >
            {group.length === 0 ? (
              <p className="rounded-lg bg-surface-hover p-4 text-sm text-muted">
                Belum ada item. Tambahkan produk, varian, atau layanan di bawah.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {group.map((member) => (
                  <li
                    key={member.key}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-navy-100 py-1 pr-1 pl-3 text-sm font-medium text-primary"
                  >
                    <span className="truncate">{member.name}</span>
                    <span className="flex-none text-xs text-muted">· {MEMBER_HINT[member.targetType]}</span>
                    {!frozen && (
                      <button
                        type="button"
                        aria-label={`Hapus ${member.name} dari kelompok`}
                        onClick={() =>
                          onChange({ group: group.filter((entry) => entry.key !== member.key) })
                        }
                        className="flex size-7 flex-none cursor-pointer items-center justify-center rounded-full text-primary transition hover:bg-primary hover:text-primary-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </FieldBlock>

          {!frozen && (
            <PromoItemPicker
              withVariants
              taken={taken}
              onPick={(picked) =>
                onChange({ group: [...group, { key: itemKey(), ...picked }] })
              }
            />
          )}

          <FieldBlock label="Dihitung dari">
            <Segmented
              ariaLabel="Dihitung dari"
              value="qty"
              options={[
                { value: "qty", label: "Jumlah item", disabled: frozen },
                { value: "amount", label: "Nilai belanja (menyusul)", disabled: true },
              ]}
              onChange={() => {}}
            />
          </FieldBlock>
        </div>
      </Card>

      <Card
        title="Tingkatan diskon"
        action={<span className="text-sm text-muted tabular-nums">{tiers.length} tingkat</span>}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] gap-3 text-xs font-semibold text-muted sm:grid">
              <span>Beli minimal</span>
              <span>Diskon</span>
              <span />
            </div>
            {tiers.map((tier, index) => (
              <div
                key={tier.key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem] items-center gap-3"
              >
                <SuffixInput
                  value={tier.min}
                  suffix="item"
                  ariaLabel={`Beli minimal tingkat ${index + 1}`}
                  inputMode="numeric"
                  disabled={frozen}
                  onChange={(min) => patchTier(tier.key, { min: min.replace(/[^\d]/g, "") })}
                />
                <SuffixInput
                  value={tier.value}
                  suffix="%"
                  ariaLabel={`Diskon tingkat ${index + 1}`}
                  inputMode="decimal"
                  disabled={frozen}
                  onChange={(value) => patchTier(tier.key, { value })}
                />
                {!frozen && tiers.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`Hapus tingkat ${index + 1}`}
                    onClick={() => onChange({ tiers: tiers.filter((entry) => entry.key !== tier.key) })}
                  >
                    <Trash2 className="size-4 text-danger" aria-hidden />
                  </Button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>

          {!frozen && tiers.length < MAX_TIERS && (
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={() => onChange({ tiers: [...tiers, nextTier(tiers)] })}
            >
              <Plus className="size-4" aria-hidden />
              Tambah tingkat
            </Button>
          )}

          <FieldBlock
            label="Diskon berlaku untuk"
            hint="Dua pilihan lain disiapkan untuk Beli X gratis Y dan Beli A dapat B."
          >
            <Segmented
              ariaLabel="Diskon berlaku untuk"
              value="all"
              options={[
                { value: "all", label: "Semua item di kelompok", disabled: frozen },
                { value: "cheapest", label: "Item termurah saja (menyusul)", disabled: true },
                { value: "other", label: "Item lain (menyusul)", disabled: true },
              ]}
              onChange={() => {}}
            />
          </FieldBlock>
        </div>
      </Card>
    </>
  );
}

/** A 44 px input with its unit drawn inside on the right ("item", "%"). */
function SuffixInput({
  value,
  suffix,
  ariaLabel,
  inputMode,
  disabled,
  onChange,
}: {
  value: string;
  suffix: string;
  ariaLabel: string;
  inputMode: "numeric" | "decimal";
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <Input
        value={value}
        inputMode={inputMode}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(FIELD_HEIGHT, "pr-12 text-right tabular-nums")}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">
        {suffix}
      </span>
    </div>
  );
}
