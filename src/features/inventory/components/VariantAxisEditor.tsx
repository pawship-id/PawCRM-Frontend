"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VariantAxis } from "@/types/inventory";

/** Two axes, matching the backend cap — "Ukuran × Rasa" is the shape in use. */
const MAX_AXES = 2;
const MAX_VALUES = 20;

/**
 * The axis editor for a variant family: name the axes, list their values, and
 * the combinations follow.
 *
 * VALUES ARE CHIPS, NOT A COMMA-SEPARATED FIELD. A text field would make
 * "1kg, 3kg" and "1kg,3kg" different data, and a stray space becomes a variant
 * nobody can find. One value at a time, Enter to commit, click to remove — the
 * set is always exactly what is on screen.
 *
 * REMOVING A VALUE IS DESTRUCTIVE and the form says so. The backend accepts
 * adding a value freely but refuses removing one a live variant still sits on,
 * naming the SKUs it would strand. Surfacing that here — before the save — is
 * the difference between a considered edit and a red toast.
 */
export function VariantAxisEditor({
  axes,
  onChange,
  lockedValues,
}: {
  axes: VariantAxis[];
  onChange: (axes: VariantAxis[]) => void;
  /** Axis values that existing variants already use — removing one is refused. */
  lockedValues?: Set<string>;
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  function updateAxis(index: number, patch: Partial<VariantAxis>) {
    onChange(axes.map((axis, i) => (i === index ? { ...axis, ...patch } : axis)));
  }

  function addValue(index: number) {
    const raw = (drafts[index] ?? "").trim();
    if (!raw) return;

    const axis = axes[index];
    if (axis.values.includes(raw)) {
      setDrafts((prev) => ({ ...prev, [index]: "" }));
      return;
    }
    if (axis.values.length >= MAX_VALUES) return;

    updateAxis(index, { values: [...axis.values, raw] });
    setDrafts((prev) => ({ ...prev, [index]: "" }));
  }

  function removeValue(index: number, value: string) {
    updateAxis(index, {
      values: axes[index].values.filter((existing) => existing !== value),
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Atribut varian</p>
        <Badge variant="outline">
          maks {MAX_AXES} atribut · {MAX_VALUES} nilai
        </Badge>
        {axes.length < MAX_AXES && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => onChange([...axes, { name: "Rasa", values: [] }])}
          >
            + Atribut kedua
          </Button>
        )}
      </div>

      {axes.map((axis, index) => (
        <div key={index} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex w-44 flex-col gap-1.5">
              <Label htmlFor={`axis-${index}`}>Nama atribut {index + 1}</Label>
              <Input
                id={`axis-${index}`}
                value={axis.name}
                onChange={(event) => updateAxis(index, { name: event.target.value })}
                placeholder="mis. Ukuran"
              />
            </div>

            <div className="flex min-w-52 flex-1 flex-col gap-1.5">
              <Label htmlFor={`axis-value-${index}`}>
                Tambah nilai{" "}
                <span className="font-normal text-muted">— Enter untuk simpan</span>
              </Label>
              <Input
                id={`axis-value-${index}`}
                value={drafts[index] ?? ""}
                onChange={(event) =>
                  setDrafts((prev) => ({ ...prev, [index]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addValue(index);
                  }
                }}
                placeholder="mis. 3kg"
              />
            </div>

            {index === 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger"
                onClick={() => onChange(axes.slice(0, 1))}
              >
                Hapus atribut
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {axis.values.length === 0 && (
              <span className="text-xs text-muted">Belum ada nilai.</span>
            )}
            {axis.values.map((value) => {
              const locked = lockedValues?.has(value) ?? false;
              return (
                <span
                  key={value}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-accent px-2.5 py-1 text-xs font-medium"
                >
                  {value}
                  <button
                    type="button"
                    aria-label={`Hapus ${value}`}
                    title={
                      locked
                        ? "Nilai ini masih dipakai varian yang ada — hapus variannya dulu."
                        : undefined
                    }
                    disabled={locked}
                    onClick={() => removeValue(index, value)}
                    className="text-muted transition hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
