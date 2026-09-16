"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import {
  Alert,
  CheckRow,
  CheckRowGroup,
  FIELD_HEIGHT,
  Spinner,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useServiceSteps } from "@/hooks/useServiceSteps";
import { cn } from "@/lib/utils";
import type { ServiceLocation, ServiceVariantAxis } from "@/types/api";

import { MAX_VARIANTS, type VariantCombo } from "../variantAxes";
import {
  ServiceStepFlagBadge,
  serviceStepFlag,
  ServiceStepPicker,
} from "./ServiceStepPicker";

/**
 * The service form's fields that are more than one control each.
 *
 * Kept beside the form rather than in `@/components`, per ui-rules §14: none of
 * these has a second caller yet. `ServiceBranchScope` is the one that will —
 * suppliers and users each carry their own copy of the same checkbox-plus-list
 * — but promoting all three is a sweep, and the rules say not to open one
 * unasked.
 */

export const LOCATION_LABELS: Record<ServiceLocation, string> = {
  in_store: "Di toko",
  in_home: "Di rumah pelanggan",
};

/**
 * The three axes as this form offers them — a checkbox each, with the reason
 * somebody would tick it.
 *
 * ONLY THE AXES ARE WRITTEN HERE. Their VALUES — which species, which sizes,
 * which coats — sat in this table as a closed list mirroring pet.model.js until
 * 14 September 2026. They are the tenant's pet options now, handed to the
 * combinations as a `VariantAxisValues`; see `variantAxes.ts`.
 */
export const VARIANT_AXIS_FIELDS: Array<{
  axis: ServiceVariantAxis;
  label: string;
  hint: string;
}> = [
  {
    axis: "petType",
    label: "Tipe hewan",
    hint: "Harga anjing beda dari kucing.",
  },
  {
    axis: "sizeCategory",
    label: "Kategori ukuran",
    hint: "Harga naik mengikuti besar hewannya.",
  },
  {
    axis: "furType",
    label: "Kategori bulu",
    hint: "Bulu panjang makan waktu lebih lama.",
  },
];

/**
 * Which axes the price varies by, and a price box per generated combination.
 *
 * TICKING AN AXIS DOES NOT CLEAR THE OTHER PRICES. Somebody who ticks Ukuran,
 * fills three boxes, then adds Tipe hewan is refining an answer rather than
 * starting again — the prices they already typed for the combinations that
 * survive are kept, and only the genuinely new rows come up blank.
 *
 * MORE ROWS THAN THE SERVER STORES IS SAID HERE, beside the ticks that made
 * them. With the tenant's own lists a grid can reach sixty rows against a limit
 * of `MAX_VARIANTS`; the rows stay drawn — what was typed is not thrown away —
 * and the form's Simpan stays off until an axis is unticked.
 */
export function ServiceVariantEditor({
  axes,
  prices,
  durations,
  active,
  combos,
  loading,
  error,
  disabled,
  onToggleAxis,
  onPriceChange,
  onDurationChange,
  onActiveChange,
}: {
  axes: ServiceVariantAxis[];
  prices: Record<string, string>;
  /** Combo key → minutes as typed. */
  durations: Record<string, string>;
  /** Combo key → on/off. A key that is absent reads as on. */
  active: Record<string, boolean>;
  combos: VariantCombo[];
  /** The tenant's axis values have not arrived; no rows are drawn from half a list. */
  loading: boolean;
  error?: string;
  disabled: boolean;
  onToggleAxis: (axis: ServiceVariantAxis, checked: boolean) => void;
  onPriceChange: (key: string, value: string) => void;
  onDurationChange: (key: string, value: string) => void;
  onActiveChange: (key: string, active: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium">Harga dibedakan berdasarkan</p>
        <p className="mt-1 text-xs text-muted">
          Pilih minimal satu. Barisnya dibuat otomatis dari kombinasi yang
          dicentang.
        </p>
        <CheckRowGroup className="mt-2">
          {VARIANT_AXIS_FIELDS.map((entry) => (
            <CheckRow
              key={entry.axis}
              label={entry.label}
              description={entry.hint}
              checked={axes.includes(entry.axis)}
              onCheckedChange={(checked) => onToggleAxis(entry.axis, checked)}
              disabled={disabled}
            />
          ))}
        </CheckRowGroup>
      </div>

      {loading && axes.length > 0 ? (
        <div className="flex h-9 items-center gap-2 border-t border-border pt-4 text-sm text-muted">
          <Spinner size={16} /> Memuat jenis hewan, ukuran, dan bulu…
        </div>
      ) : combos.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium">
              Harga & durasi per varian{" "}
              <span className="font-normal text-muted">
                ({combos.length} baris)
              </span>
            </p>
            {/*
              ─── EACH VARIANT ITS OWN LENGTH AND ITS OWN ON/OFF ──────────────

              Decided 13 September 2026. A large long-haired dog does not take as
              long as a small short-haired one, so the minutes sit beside the
              price rather than once above the grid. A variant switched off stays
              in the grid — it is still a combination the service has — but the
              booking form and the till will not let anybody choose it.
            */}
            <p className="mt-1 text-xs text-muted">
              Varian yang tidak dicentang Aktif tetap tampil, tapi tidak bisa
              dipilih di booking maupun kasir.
            </p>
          </div>

          {combos.length > MAX_VARIANTS && (
            <Alert variant="error">
              Kombinasinya jadi {combos.length} varian — maksimal{" "}
              {MAX_VARIANTS} per layanan. Hilangkan salah satu centang supaya
              bisa disimpan.
            </Alert>
          )}

          <div
            aria-hidden
            className="hidden gap-3 text-xs font-semibold text-muted sm:grid sm:grid-cols-[1fr_160px_120px_72px]"
          >
            <span>Varian</span>
            <span>Harga</span>
            <span>Durasi (menit)</span>
            <span>Aktif</span>
          </div>

          <div className="flex flex-col gap-3">
            {combos.map((combo) => {
              const on = active[combo.key] !== false;

              return (
                <div
                  key={combo.key}
                  className="grid items-center gap-3 sm:grid-cols-[1fr_160px_120px_72px]"
                >
                  <span className={cn("text-sm", !on && "text-muted")}>
                    {combo.label}
                    {!on && <span className="ml-1.5 text-xs">· nonaktif</span>}
                  </span>
                  {/*
                    An `aria-label` rather than a `TextField`: the row's own text
                    IS the label, and repeating it above every box would make a
                    twelve-row grid read as twelve stacked fields.
                  */}
                  <Input
                    aria-label={`Harga ${combo.label}`}
                    inputMode="numeric"
                    value={prices[combo.key] ?? ""}
                    onChange={(event) =>
                      onPriceChange(combo.key, event.target.value)
                    }
                    placeholder="150000"
                    disabled={disabled}
                    className={FIELD_HEIGHT}
                  />
                  <Input
                    aria-label={`Durasi ${combo.label} (menit)`}
                    type="number"
                    min={1}
                    max={1440}
                    value={durations[combo.key] ?? ""}
                    onChange={(event) =>
                      onDurationChange(combo.key, event.target.value)
                    }
                    placeholder="60"
                    disabled={disabled}
                    className={FIELD_HEIGHT}
                  />
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox
                      aria-label={`${combo.label} aktif`}
                      checked={on}
                      onCheckedChange={(next) =>
                        onActiveChange(combo.key, next === true)
                      }
                      disabled={disabled}
                    />
                    <span className="sm:sr-only">Aktif</span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A free list of short lines — Termasuk. (Tahapan were one too, until each
 * business line got its own list on 14 September 2026 — see
 * `ServiceStepsField`.)
 *
 * ADD-AND-REMOVE RATHER THAN A COMMA-SEPARATED BOX, because the list is
 * rendered as separate items downstream (a storefront's ticks). A text box
 * would make the separator part of the data, and the first item containing a
 * comma would silently become two.
 */
export function StringListField({
  label,
  hint,
  placeholder,
  values,
  maxItems,
  maxLength,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  placeholder: string;
  values: string[];
  maxItems: number;
  maxLength: number;
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const full = values.length >= maxItems;

  function add() {
    const trimmed = draft.trim();
    if (trimmed === "" || full) return;
    // Silently ignoring a repeat rather than warning about it: the list is a
    // handful of words, and a duplicate is a slip nobody needs a sentence about.
    if (!values.includes(trimmed)) onChange([...values, trimmed]);
    setDraft("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs text-muted">{hint}</p>
      </div>

      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {values.map((value, index) => (
            <li
              key={`${value}-${index}`}
              className="flex items-center gap-1.5 rounded-full bg-surface-hover px-3 py-1.5 text-sm"
            >
              {value}
              <button
                type="button"
                aria-label={`Hapus ${value}`}
                className="rounded-full p-0.5 text-muted transition hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50"
                disabled={disabled}
                onClick={() =>
                  onChange(values.filter((_, position) => position !== index))
                }
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2">
        <Input
          aria-label={label}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds the line instead of submitting the form — a half-typed
            // list is not a saved service.
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled || full}
          className={`flex-1 ${FIELD_HEIGHT}`}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={add}
          disabled={disabled || full || draft.trim() === ""}
        >
          <Plus className="size-4" aria-hidden />
          Tambah
        </Button>
      </div>

      {full && (
        <p className="text-xs text-muted">Maksimal {maxItems} baris.</p>
      )}
    </div>
  );
}

/**
 * The service's tahapan, picked from its business line's list (14 September
 * 2026) — they were free text before.
 *
 * NO LINE, NO LIST: the picker stays off and says "Pilih lini bisnis dulu"
 * until the Identitas card has one.
 *
 * A ROW THAT CANNOT BE ADDED AGAIN — retired on the list, or not on it — says
 * so beside its name and can still be removed.
 *
 * WHAT THE SERVER WILL REFUSE is warned about before Simpan. It keeps a name
 * the service already stored on this same line (`kept`), retired or not; any
 * other name must be an active step of the chosen line. So after the line is
 * changed, every row not on the new line's list is named in a warning — the
 * save would fail on them otherwise.
 */
export function ServiceStepsField({
  businessLineId,
  sessions,
  kept,
  maxItems,
  mayAddToList,
  error,
  disabled,
  onChange,
}: {
  businessLineId: string;
  sessions: string[];
  /** Names the server keeps whatever the list says — stored, same line. */
  kept: string[];
  maxItems: number;
  mayAddToList: boolean;
  error?: string;
  disabled: boolean;
  /** A functional update: the quick add answers after an await. */
  onChange: (update: (current: string[]) => string[]) => void;
}) {
  const list = useServiceSteps(businessLineId || null);
  const keptKeys = new Set(kept.map((name) => name.trim().toLowerCase()));
  const flags = sessions.map((name) => serviceStepFlag(name, list));
  const refused = sessions.filter(
    (name, index) =>
      flags[index] !== null && !keptKeys.has(name.trim().toLowerCase()),
  );
  const full = sessions.length >= maxItems;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">Tahapan</p>
        <p className="mt-1 text-xs text-muted">
          Urutan pengerjaannya, dipilih dari daftar tahapan lini bisnisnya — mis.
          Mandi → Gunting → Blow dry.
        </p>
      </div>

      {sessions.length > 0 && (
        <ol className="flex flex-wrap gap-2">
          {sessions.map((name, index) => (
            <li
              key={name}
              className="flex items-center gap-1.5 rounded-full bg-surface-hover py-0 pr-0 pl-3 text-sm"
            >
              {name}
              {flags[index] && <ServiceStepFlagBadge flag={flags[index]} />}
              <button
                type="button"
                aria-label={`Hapus tahapan ${name}`}
                className="flex size-9 items-center justify-center rounded-full text-muted transition hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                disabled={disabled}
                onClick={() =>
                  onChange((current) =>
                    current.filter((session) => session !== name),
                  )
                }
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}

      {refused.length > 0 && (
        <Alert variant="warning">
          {refused.map((name) => `“${name}”`).join(", ")} tidak ada di daftar
          tahapan aktif lini bisnis ini. Hapus, lalu pilih penggantinya dari
          daftar — kalau tidak, layanan ini ditolak saat disimpan.
        </Alert>
      )}

      <ServiceStepPicker
        businessLineId={businessLineId}
        taken={sessions}
        mayAddToList={mayAddToList}
        disabled={disabled}
        disabledReason={
          !businessLineId
            ? "Pilih lini bisnis dulu."
            : full
              ? `Maksimal ${maxItems} tahapan.`
              : null
        }
        onPick={(name) =>
          onChange((current) =>
            current.length >= maxItems ||
            current.some(
              (session) => session.toLowerCase() === name.toLowerCase(),
            )
              ? current
              : [...current, name],
          )
        }
        className={FIELD_HEIGHT}
      />

      {error && (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Below this many tahapan there is nothing to split — one takes it all. */
export const WEIGHTS_MIN_SESSIONS = 2;

/** `3` → `[34, 33, 33]`: whole per cents that add up to exactly 100. */
export function evenSessionWeights(count: number): number[] {
  if (count <= 0) return [];

  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;

  return Array.from({ length: count }, (_, index) =>
    index < remainder ? base + 1 : base,
  );
}

function typedWeights(
  sessions: string[],
  weights: Record<string, string>,
): string[] {
  return sessions.map((session) => (weights[session] ?? "").trim());
}

/**
 * The server's rule, checked before the round trip: EVERY BOX EMPTY splits
 * evenly; otherwise every box is a whole number 0–100 and they add up to 100.
 */
export function sessionWeightsError(
  sessions: string[],
  weights: Record<string, string>,
): string | null {
  if (sessions.length < WEIGHTS_MIN_SESSIONS) return null;

  const typed = typedWeights(sessions, weights);
  if (typed.every((value) => value === "")) return null;

  if (typed.some((value) => value === "")) {
    return "Isi bobot semua tahapan, atau kosongkan semuanya supaya dibagi rata.";
  }
  if (typed.some((value) => !/^\d+$/.test(value) || Number(value) > 100)) {
    return "Bobot diisi angka bulat 0–100, tanpa tanda %.";
  }

  const total = typed.reduce((sum, value) => sum + Number(value), 0);
  return total === 100 ? null : `Total bobotnya ${total}%, harus pas 100%.`;
}

/** `[]` for "split evenly", else one number per session in session order. */
export function sessionWeightsPayload(
  sessions: string[],
  weights: Record<string, string>,
): number[] {
  if (sessions.length < WEIGHTS_MIN_SESSIONS) return [];

  const typed = typedWeights(sessions, weights);
  return typed.every((value) => value === "") ? [] : typed.map(Number);
}

/**
 * Each tahapan's share of the service's commission — decided 13 September 2026.
 *
 * KEYED BY THE SESSION'S NAME, which is unique in that list (the picker never
 * offers a name the service already has, and the server refuses a repeat). Removing a tahapan drops its box; the numbers typed for the
 * others stay.
 *
 * HIDDEN BELOW TWO TAHAPAN. One tahapan takes the whole commission whatever is
 * typed, so a box for it would be a question with one answer.
 */
export function SessionWeightsEditor({
  sessions,
  weights,
  error,
  disabled,
  onChange,
}: {
  sessions: string[];
  weights: Record<string, string>;
  error?: string;
  disabled: boolean;
  onChange: (next: Record<string, string>) => void;
}) {
  if (sessions.length < WEIGHTS_MIN_SESSIONS) return null;

  const typed = typedWeights(sessions, weights);
  const filled = typed.some((value) => value !== "");
  const total = typed.reduce(
    (sum, value) => sum + (/^\d+$/.test(value) ? Number(value) : 0),
    0,
  );

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div>
        <p className="text-sm font-medium">Bobot komisi per tahapan</p>
        <p className="mt-1 text-xs text-muted">
          Kosongkan semua supaya komisinya dibagi rata. Kalau diisi, semua
          tahapan harus diisi dan totalnya pas 100%.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {sessions.map((session) => (
          <div
            key={session}
            className="grid items-center gap-3 sm:grid-cols-[1fr_160px]"
          >
            <span className="text-sm">{session}</span>
            <span className="flex items-center gap-2">
              <Input
                aria-label={`Bobot ${session} (%)`}
                inputMode="numeric"
                value={weights[session] ?? ""}
                onChange={(event) =>
                  onChange({ ...weights, [session]: event.target.value })
                }
                placeholder="rata"
                disabled={disabled}
                className={`${FIELD_HEIGHT} text-right tabular-nums`}
              />
              <span className="text-sm text-muted">%</span>
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          Total{" "}
          <span
            className={
              !filled || total === 100
                ? "font-semibold tabular-nums text-foreground"
                : "font-semibold tabular-nums text-danger"
            }
          >
            {filled ? `${total}%` : "dibagi rata"}
          </span>
        </p>
        <span className="flex gap-2">
          {filled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onChange({})}
            >
              Kosongkan
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={() => {
              const even = evenSessionWeights(sessions.length);
              onChange(
                Object.fromEntries(
                  sessions.map((session, index) => [session, String(even[index])]),
                ),
              );
            }}
          >
            Bagi rata
          </Button>
        </span>
      </div>

      {error && (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Which branches offer this service.
 *
 * A CHECKBOX PLUS A LIST, not a multi-select, and it mirrors the same field on
 * the supplier and user forms. "Semua cabang" is a genuinely different answer
 * from "these five" — it keeps meaning every branch as new ones open — so it
 * gets a control of its own rather than being expressible only by ticking
 * everything.
 *
 * TICKING IT DROPS THE LIST, matching what the server stores: a leftover list is
 * a trap the day the box is unticked, because the service would silently
 * reappear in exactly the branches somebody picked months ago.
 */
export function ServiceBranchScope({
  branches,
  loading,
  loadError,
  allBranches,
  branchIds,
  error,
  disabled,
  onChange,
}: {
  branches: Array<{ _id: string; name: string }>;
  loading: boolean;
  loadError: string | null;
  allBranches: boolean;
  branchIds: string[];
  error?: string;
  disabled: boolean;
  onChange: (patch: { allBranches?: boolean; branchIds?: string[] }) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Tersedia di cabang</p>

      <div className="flex items-start gap-3">
        <Checkbox
          id="service-all-branches"
          checked={allBranches}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange({
              allBranches: checked === true,
              ...(checked === true ? { branchIds: [] } : {}),
            })
          }
        />
        <div>
          <Label htmlFor="service-all-branches" className="font-normal">
            Semua cabang
          </Label>
          <p className="mt-1 text-xs text-muted">
            Termasuk cabang yang dibuka nanti. Hilangkan centang kalau layanan
            ini cuma ada di sebagian cabang.
          </p>
        </div>
      </div>

      {!allBranches &&
        (loadError ? (
          <p className="text-xs text-danger">
            {loadError} Centang “Semua cabang” untuk melanjutkan.
          </p>
        ) : loading ? (
          <div className="flex h-9 items-center gap-2 text-sm text-muted">
            <Spinner size={16} /> Memuat cabang…
          </div>
        ) : branches.length === 0 ? (
          <p className="text-xs text-muted">
            Belum ada cabang yang bisa dipilih. Centang “Semua cabang”.
          </p>
        ) : (
          <div className="ml-7 flex flex-col gap-2">
            {branches.map((branch) => (
              <div key={branch._id} className="flex items-center gap-3">
                <Checkbox
                  id={`service-branch-${branch._id}`}
                  checked={branchIds.includes(branch._id)}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      allBranches: false,
                      branchIds:
                        checked === true
                          ? [...branchIds, branch._id]
                          : branchIds.filter((id) => id !== branch._id),
                    })
                  }
                />
                <Label
                  htmlFor={`service-branch-${branch._id}`}
                  className="font-normal"
                >
                  {branch.name}
                </Label>
              </div>
            ))}
          </div>
        ))}

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The add-ons a main service can be sold with.
 *
 * ONLY SERVICES FILED AS ADD-ON APPEAR, because those are the only ones the API
 * accepts here — offering a main service and letting the save fail would be a
 * list that lies. A tenant with none yet is told where they come from rather
 * than shown an empty box.
 */
export function ServiceAddonPicker({
  addons,
  loading,
  loadError,
  selected,
  disabled,
  onChange,
}: {
  addons: Array<{ _id: string; name: string; code: string }>;
  loading: boolean;
  loadError: string | null;
  selected: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  if (loadError) {
    return <p className="text-xs text-danger">{loadError}</p>;
  }

  if (loading) {
    return (
      <div className="flex h-9 items-center gap-2 text-sm text-muted">
        <Spinner size={16} /> Memuat add-on…
      </div>
    );
  }

  if (addons.length === 0) {
    return (
      <p className="text-sm text-muted">
        Belum ada layanan yang ditandai sebagai add-on. Buat layanannya dulu
        dengan jenis “Add-on”, nanti muncul di sini.
      </p>
    );
  }

  return (
    <CheckRowGroup>
      {addons.map((addon) => (
        <CheckRow
          key={addon._id}
          label={addon.name}
          description={addon.code}
          checked={selected.includes(addon._id)}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange(
              checked
                ? [...selected, addon._id]
                : selected.filter((id) => id !== addon._id),
            )
          }
        />
      ))}
    </CheckRowGroup>
  );
}
