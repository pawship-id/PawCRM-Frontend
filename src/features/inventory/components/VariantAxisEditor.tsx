"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VariantAxis } from "@/types/inventory";

/**
 * The backend's caps, mirrored — `MAX_VARIANT_AXES` and `MAX_AXIS_VALUES` in
 * product.model.js.
 *
 * Mirrored rather than merely guessed at: a form that offers less than the API
 * accepts is a feature the user cannot reach and has no way to discover, and one
 * that offers more turns a considered limit into a 400 after the work is typed.
 */
const MAX_AXES = 10;
const MAX_VALUES = 50;

/**
 * Names pre-filled for the first few axes, in order, and NOTHING past them.
 *
 * The suggestions run out on purpose. "Ukuran × Rasa × Warna × Motif" covers
 * what a pet shop actually sells, and by the fifth axis there is no name this
 * form could guess that would be better than the one the user has in mind. A
 * made-up default there — "Atribut 5" — is worse than an empty box: it reads as
 * a real label, so it survives to the POS as one.
 *
 * An empty name is not silently acceptable either. The API requires one on
 * every axis, so the form refuses to save until it is filled — see
 * ProductForm's validate().
 */
const AXIS_NAME_SUGGESTIONS = ["Ukuran", "Rasa", "Warna", "Motif"];

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

  function addAxis() {
    const used = new Set(axes.map((axis) => axis.name.trim().toLowerCase()));
    // Empty once the suggestions are exhausted — see AXIS_NAME_SUGGESTIONS.
    const name =
      AXIS_NAME_SUGGESTIONS.find(
        (candidate) => !used.has(candidate.toLowerCase()),
      ) ?? "";

    onChange([...axes, { name, values: [] }]);
  }

  /**
   * Drops one axis, and shifts the half-typed values along with it.
   *
   * `drafts` is keyed by POSITION, so removing the middle of three axes would
   * otherwise leave the third axis's unsubmitted text sitting in the second's
   * box — a value about to be committed to the wrong attribute. Re-keying is
   * what keeps the draft attached to the axis it was typed for.
   */
  function removeAxis(index: number) {
    onChange(axes.filter((_axis, i) => i !== index));

    setDrafts((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([key, value]) => {
        const position = Number(key);
        if (position < index) next[position] = value;
        else if (position > index) next[position - 1] = value;
      });
      return next;
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
            onClick={addAxis}
          >
            + Atribut
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

            {/* Every axis but the first. A parent with no axes describes no
                combinations at all, so the API requires at least one and the
                form does not offer to remove the last. */}
            {index > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger"
                aria-label={`Hapus atribut ${axis.name || index + 1}`}
                onClick={() => removeAxis(index)}
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
