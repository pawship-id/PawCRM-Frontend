"use client";

import { Card, TextField } from "@/components";
import { Switch } from "@/components/ui/switch";
import { FieldBlock } from "@/features/memberships/components/FormBits";
import { cn } from "@/lib/utils";

import { WEEKDAYS } from "../labels";
import type { PromoDraft } from "../promoDraft";

/**
 * Info promo — Nama, Mulai, Selesai, Hari berlaku, Simpan sebagai draft
 * (BO mockup `periodePanel`). Shared by every promo type when they arrive.
 */
export function PromoInfoPanel({
  draft,
  onChange,
  errors,
  readOnly,
  /** A promo already used cannot go back to draft (the server refuses it). */
  draftLocked,
}: {
  draft: PromoDraft;
  onChange: (patch: Partial<PromoDraft>) => void;
  errors: Record<string, string>;
  readOnly: boolean;
  draftLocked: boolean;
}) {
  const toggleDay = (day: number) =>
    onChange({
      weekdays: draft.weekdays.includes(day)
        ? draft.weekdays.filter((entry) => entry !== day)
        : [...draft.weekdays, day],
    });

  return (
    <Card title="Info promo">
      <div className="grid gap-4">
        <TextField
          label="Nama promo"
          required
          value={draft.name}
          placeholder="mis. Flash Sale Royal Canin"
          disabled={readOnly}
          onChange={(event) => onChange({ name: event.target.value })}
          error={errors.name}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Mulai"
            type="date"
            required
            value={draft.startDate}
            disabled={readOnly}
            onChange={(event) => onChange({ startDate: event.target.value })}
            error={errors["restrictions.startDate"]}
          />
          <TextField
            label="Selesai"
            type="date"
            value={draft.endDate}
            min={draft.startDate || undefined}
            disabled={readOnly}
            onChange={(event) => onChange({ endDate: event.target.value })}
            hint="Kosongkan kalau tanpa tanggal selesai."
            error={errors["restrictions.endDate"]}
          />
        </div>

        <FieldBlock
          label="Hari berlaku"
          hint="Untuk promo hari tertentu, mis. Senin Grooming Hemat."
          error={errors["restrictions.weekdays"]}
        >
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map(({ day, short }) => {
              const on = draft.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  disabled={readOnly}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "h-11 min-w-11 rounded-lg border px-3 text-sm font-medium transition",
                    "focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-foreground hover:bg-surface-hover",
                  )}
                >
                  {short}
                </button>
              );
            })}
          </div>
        </FieldBlock>

        <FieldBlock
          label="Status"
          hint={
            draftLocked
              ? "Promo yang sudah dipakai tidak bisa dijadikan draft. Pakai Hentikan kalau tidak ingin dipakai lagi."
              : undefined
          }
        >
          <label className="flex w-fit cursor-pointer items-center gap-3">
            <Switch
              aria-label="Simpan sebagai draft"
              checked={draft.draft}
              disabled={readOnly || draftLocked}
              onCheckedChange={(checked) => onChange({ draft: checked })}
            />
            <span className="text-sm">
              Simpan sebagai draft
              <span className="block text-muted">
                {draft.draft
                  ? "Belum berlaku di mana pun sampai draft dimatikan."
                  : "Promo berlaku otomatis sesuai tanggal dan hari di atas."}
              </span>
            </span>
          </label>
        </FieldBlock>
      </div>
    </Card>
  );
}
