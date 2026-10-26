"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { RecognitionMethod, RecognitionMode } from "@/types/membership";

/**
 * "LANGSUNG SAAT TERJUAL" ATAU "DITERIMA DI MUKA" — the one choice that decides
 * when a package's money becomes revenue (PLAN-Membership-Pengakuan-
 * Pendapatan.md). Drawn on Pengaturan › Keuangan › Membership (the tenant's
 * default) and on the package form (BO no. 1: the package decides, prefilled
 * from the tenant).
 *
 * THE COPY STATES THE CONSEQUENCE, not the accounting term alone: an owner who
 * picks "diterima di muka" must know their omzet for the month will be lower
 * than what the till took — that is the point of it, and a surprise otherwise.
 */
export const RECOGNITION_MODE_COPY: Record<RecognitionMode, { label: string; hint: string }> = {
  immediate: {
    label: "Langsung saat terjual",
    hint: "Harga paket langsung jadi pendapatan di hari terjual. Cara Buloo selama ini.",
  },
  deferred: {
    label: "Diterima di muka",
    hint: "Uang paket masuk dulu ke Pendapatan Diterima di Muka, lalu diakui sedikit demi sedikit selama masa aktif kartu.",
  },
};

export const RECOGNITION_METHOD_COPY: Record<RecognitionMethod, { label: string; hint: string }> = {
  straight_line: {
    label: "Merata per hari",
    hint: "Diakui per hari dan dicatat tiap akhir bulan, dipakai atau tidak.",
  },
  per_use: {
    label: "Per pemakaian",
    hint: "Diakui setiap jatah dipakai, sesuai harga normal layanannya. Sisa jatah diakui di hari terakhir kartu.",
  },
};

export function RecognitionModeChoice({
  idPrefix,
  value,
  onChange,
  disabled = false,
}: {
  idPrefix: string;
  value: RecognitionMode;
  onChange: (next: RecognitionMode) => void;
  disabled?: boolean;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as RecognitionMode)}
      disabled={disabled}
      aria-label="Cara pengakuan pendapatan"
      className="flex flex-col gap-3"
    >
      {(Object.keys(RECOGNITION_MODE_COPY) as RecognitionMode[]).map((mode) => (
        <div key={mode} className="flex items-start gap-2">
          <RadioGroupItem value={mode} id={`${idPrefix}-${mode}`} className="mt-0.5" />
          <Label htmlFor={`${idPrefix}-${mode}`} className="flex flex-col items-start gap-0.5">
            <span>{RECOGNITION_MODE_COPY[mode].label}</span>
            <span className="max-w-prose text-xs font-normal text-muted">
              {RECOGNITION_MODE_COPY[mode].hint}
            </span>
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

export function RecognitionMethodChoice({
  idPrefix,
  value,
  suggested,
  onChange,
  disabled = false,
}: {
  idPrefix: string;
  value: RecognitionMethod;
  /** What the package's benefits suggest — marked "disarankan". */
  suggested: RecognitionMethod;
  onChange: (next: RecognitionMethod) => void;
  disabled?: boolean;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as RecognitionMethod)}
      disabled={disabled}
      aria-label="Metode pengakuan"
      className="flex flex-col gap-3"
    >
      {(Object.keys(RECOGNITION_METHOD_COPY) as RecognitionMethod[]).map((method) => (
        <div key={method} className="flex items-start gap-2">
          <RadioGroupItem value={method} id={`${idPrefix}-${method}`} className="mt-0.5" />
          <Label htmlFor={`${idPrefix}-${method}`} className="flex flex-col items-start gap-0.5">
            <span>
              {RECOGNITION_METHOD_COPY[method].label}
              {method === suggested ? (
                <span className="ml-2 rounded-full bg-tint-brand px-2 py-0.5 text-xs font-medium text-primary">
                  Disarankan
                </span>
              ) : null}
            </span>
            <span className="max-w-prose text-xs font-normal text-muted">
              {RECOGNITION_METHOD_COPY[method].hint}
            </span>
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}

/**
 * The method a plan's benefits suggest — the server's
 * utils/membershipRecognition.js#suggestedMethod, mirrored so the form can mark
 * it. Per use only when EVERY priced benefit is a whole-life quota; a monthly
 * quota, a mix (BO no. 2) or a discount-only package (no. 5) is per day.
 */
export function suggestedMethod(
  benefits: { kind: string; quota?: { total?: number | null; perPeriod?: number | null } }[],
): RecognitionMethod {
  const priced = benefits.filter((benefit) => benefit.kind !== "perk");
  if (priced.length === 0) return "straight_line";
  return priced.every((benefit) => benefit.quota?.total && !benefit.quota?.perPeriod)
    ? "per_use"
    : "straight_line";
}
