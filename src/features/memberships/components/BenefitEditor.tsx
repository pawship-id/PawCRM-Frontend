"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button, Card, SelectField, TextField } from "@/components";
import type { BenefitInput, BenefitKind, BenefitPeriod } from "@/types/membership";

import { BenefitScopeField } from "./BenefitScopeField";
import {
  BENEFIT_KIND_HINT,
  BENEFIT_KIND_LABEL,
  PERIOD_RESET_HINT,
} from "../labels";

/**
 * The benefit list, edited INSIDE the package form.
 *
 * THERE IS NO BENEFIT SCREEN AND NO BENEFIT ROUTE. A benefit belongs to its
 * package: it is never used outside one, never shared between two, and has to
 * freeze into a card when one is issued. Editing it anywhere else would be a
 * second place for the keys the redemption ledger points at to be written.
 *
 * ─── THE QUOTA CONTROLS ARE WHERE THIS SCREEN IS WON OR LOST ───────────────
 *
 * Three numbers — per-period, period, lifetime — and every combination of them
 * means something different. An owner filling them in from memory will get it
 * wrong, so the editor states the result back in a sentence under the row
 * (`quotaSentence`) rather than leaving them to imagine it. That sentence is
 * the single most useful thing on this component.
 *
 * `null` MEANS UNLIMITED, and the fields say so in their placeholders. An empty
 * box is not zero — a quota of zero would be a benefit that can never be spent,
 * which is not a thing anybody sets out to sell.
 */

const KIND_OPTIONS = (Object.keys(BENEFIT_KIND_LABEL) as BenefitKind[]).map(
  (kind) => ({ value: kind, label: BENEFIT_KIND_LABEL[kind] }),
);

const PERIOD_OPTIONS = [
  { value: "", label: "Tanpa periode" },
  { value: "week", label: "Per minggu" },
  { value: "month", label: "Per bulan" },
];

/**
 * "2× per bulan, maksimal 24× selama kartu berlaku."
 *
 * Composed here rather than read from the server, because the row is being
 * TYPED — there is nothing saved to ask about yet. The server composes the same
 * sentence for everything already stored (`benefit.summary`), and the two are
 * deliberately worded alike.
 */
function quotaSentence(benefit: BenefitInput): string {
  if (benefit.kind === "perk") {
    return "Fasilitas tidak memotong harga dan tidak memakai jatah.";
  }

  const perPeriod = benefit.quota?.perPeriod ?? null;
  const period = benefit.quota?.period ?? null;
  const total = benefit.quota?.total ?? null;

  const parts: string[] = [];
  if (perPeriod && period) {
    parts.push(`${perPeriod}× per ${period === "week" ? "minggu" : "bulan"}`);
  }
  if (total) {
    parts.push(
      parts.length
        ? `maksimal ${total}× selama kartu berlaku`
        : `${total}× selama kartu berlaku`,
    );
  }

  if (!parts.length) {
    return "Tanpa batas — boleh dipakai berapa kali pun selama kartu masih aktif.";
  }

  const reset = period ? ` ${PERIOD_RESET_HINT[period as BenefitPeriod]}` : "";
  return `Boleh dipakai ${parts.join(", ")}.${reset}`;
}

/** The value field's label and unit change with the kind; its absence too. */
function valueField(kind: BenefitKind): { label: string; hint: string } | null {
  if (kind === "discount_percent") {
    return { label: "Persen", hint: "0–100." };
  }
  if (kind === "discount_amount") {
    return {
      label: "Potongan (Rp)",
      hint: "Tidak pernah melebihi harga barisnya.",
    };
  }
  return null;
}

export function BenefitEditor({
  benefits,
  onChange,
  errors = {},
}: {
  benefits: BenefitInput[];
  onChange: (next: BenefitInput[]) => void;
  /** Server-side field errors, keyed `benefits[0].scope` as the API sends them. */
  errors?: Record<string, string>;
}) {
  const patch = (index: number, changes: Partial<BenefitInput>) => {
    onChange(
      benefits.map((benefit, i) =>
        i === index ? { ...benefit, ...changes } : benefit,
      ),
    );
  };

  const patchQuota = (index: number, changes: Partial<BenefitInput["quota"]>) => {
    patch(index, { quota: { ...benefits[index].quota, ...changes } });
  };

  const add = () => {
    onChange([
      ...benefits,
      {
        label: "",
        kind: "free_item",
        scope: { target: "service", serviceKinds: [] },
        quota: { total: null, perPeriod: null, period: null },
        maxPerTransaction: 1,
      },
    ]);
  };

  /*
    REMOVING A SAVED BENEFIT IS ALLOWED, and the warning under the list says what
    it does and does not do. Cards already issued keep their own frozen copy and
    go on honouring it — which is the correct outcome, and is not obvious, so it
    is written on the screen rather than left to be discovered.
  */
  const remove = (index: number) => {
    onChange(benefits.filter((_, i) => i !== index));
  };

  return (
    <Card
      title="Benefit"
      description="Apa yang didapat pemilik hewan selama kartu berlaku."
      action={
        <Button type="button" variant="secondary" onClick={add}>
          <Plus className="size-4" aria-hidden />
          Tambah benefit
        </Button>
      }
    >
      {benefits.length === 0 ? (
        <p className="text-sm text-muted">
          Belum ada benefit. Paket tanpa benefit tetap bisa disimpan dan dijual,
          tapi kartunya tidak memberi potongan apa pun —{" "}
          <button
            type="button"
            onClick={add}
            className="font-medium text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            tambah yang pertama →
          </button>
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {benefits.map((benefit, index) => {
            const value = valueField(benefit.kind);

            return (
              <li
                key={benefit.id ?? `new-${index}`}
                className="rounded-lg border border-border p-4"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    Benefit {index + 1}
                    {/*
                      ONLY THE "BARU" BADGE. This used to print the benefit's
                      handle beside the number, which was worth reading while it
                      was a slug (`gratis-full-grooming`) and is noise now that
                      it is a 24-character id (29 September 2026). What a reader
                      needs from this line is whether the row is saved yet.
                    */}
                    {!benefit.id && (
                      <span className="ml-2 rounded bg-info/15 px-1.5 py-0.5 text-xs font-normal text-foreground">
                        Baru
                      </span>
                    )}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => remove(index)}
                    aria-label={`Hapus benefit ${index + 1}`}
                    className="size-9"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Nama benefit"
                    required
                    value={benefit.label}
                    placeholder="Gratis full grooming"
                    onChange={(event) =>
                      patch(index, { label: event.target.value })
                    }
                    error={errors[`benefits[${index}].label`]}
                    hint="Kalimat yang dibaca pemilik hewan."
                  />

                  <SelectField
                    label="Jenis"
                    required
                    value={benefit.kind}
                    onChange={(next) =>
                      patch(index, {
                        kind: next as BenefitKind,
                        // A kind change makes the old number meaningless —
                        // a percentage left behind on a `free_item` would be
                        // sent and refused, naming a field nobody can see.
                        value: null,
                      })
                    }
                    options={KIND_OPTIONS}
                    hint={BENEFIT_KIND_HINT[benefit.kind]}
                    error={errors[`benefits[${index}].kind`]}
                  />

                  {value && (
                    <TextField
                      label={value.label}
                      required
                      inputMode="decimal"
                      value={String(benefit.value ?? "")}
                      onChange={(event) =>
                        patch(index, { value: event.target.value })
                      }
                      hint={value.hint}
                      error={errors[`benefits[${index}].value`]}
                    />
                  )}

                  <TextField
                    label="Maksimal baris per transaksi"
                    type="number"
                    min={1}
                    value={String(benefit.maxPerTransaction ?? 1)}
                    onChange={(event) =>
                      patch(index, {
                        maxPerTransaction: Number(event.target.value) || 1,
                      })
                    }
                    hint="Berapa baris dalam satu struk boleh memakai benefit ini."
                    error={errors[`benefits[${index}].maxPerTransaction`]}
                  />
                </div>

                <fieldset className="mt-4 rounded-md bg-surface-hover p-3">
                  <legend className="px-1 text-sm font-medium text-foreground">
                    Jatah pemakaian
                  </legend>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <TextField
                      label="Berapa kali"
                      type="number"
                      min={1}
                      placeholder="Tanpa batas"
                      value={String(benefit.quota?.perPeriod ?? "")}
                      onChange={(event) =>
                        patchQuota(index, {
                          perPeriod: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                      disabled={benefit.kind === "perk"}
                    />

                    <SelectField
                      label="Per periode"
                      value={benefit.quota?.period ?? ""}
                      onChange={(next) =>
                        patchQuota(index, {
                          period: (next || null) as BenefitPeriod | null,
                          // The two travel together; the API refuses one
                          // without the other, so clearing the period clears
                          // the count rather than sending half a sentence.
                          perPeriod: next ? benefit.quota?.perPeriod ?? 1 : null,
                        })
                      }
                      options={PERIOD_OPTIONS}
                      placeholder="Tanpa periode"
                      disabled={benefit.kind === "perk"}
                    />

                    <TextField
                      label="Total selama kartu berlaku"
                      type="number"
                      min={1}
                      placeholder="Tanpa batas"
                      value={String(benefit.quota?.total ?? "")}
                      onChange={(event) =>
                        patchQuota(index, {
                          total: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                      disabled={benefit.kind === "perk"}
                    />
                  </div>

                  {/*
                    THE SENTENCE IS THE POINT OF THIS FIELDSET. Three numbers
                    describe a rule nobody can hold in their head; saying it
                    back is what stops "2× seminggu" being typed into the
                    lifetime box.
                  */}
                  <p className="mt-3 text-sm text-foreground" aria-live="polite">
                    {quotaSentence(benefit)}
                  </p>
                  {errors[`benefits[${index}].quota`] && (
                    <p role="alert" className="mt-1 text-sm text-danger">
                      {errors[`benefits[${index}].quota`]}
                    </p>
                  )}
                </fieldset>

                <BenefitScopeField
                  benefit={benefit}
                  onChange={(scope) =>
                    patch(index, { scope: { ...benefit.scope, ...scope } })
                  }
                  error={errors[`benefits[${index}].scope`]}
                />
              </li>
            );
          })}
        </ul>
      )}

      {benefits.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          Mengubah atau menghapus benefit di sini hanya berlaku untuk kartu yang
          dijual setelahnya. Kartu yang sudah terbit memegang salinannya sendiri
          dan tetap dihormati sampai masa berlakunya habis.
        </p>
      )}
    </Card>
  );
}
