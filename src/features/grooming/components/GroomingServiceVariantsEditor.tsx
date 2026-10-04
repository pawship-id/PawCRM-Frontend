"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { Alert, Card, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  axisDefsForKind,
  buildVariantCombos,
  MAX_VARIANTS,
  useVariantAxisValues,
} from "@/features/services";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import { formatMoney } from "@/utils/decimal";
import type { Service, ServiceKind, VariantAxisKey } from "@/types/api";

import { type ServicePlace } from "../serviceDisplay";
import {
  applyBulk,
  AXIS_ORDER,
  type BulkAction,
  draftPatch,
  draftProblem,
  draftSignature,
  durationValue,
  fillBySize,
  MAX_DURATION_MIN,
  priceDigits,
  priceText,
  rowOf,
  seedDraft,
  toggleAxis,
  updateRow,
  type VariantDraft,
} from "../serviceVariantDraft";
import { DraftSaveBar } from "./DraftSaveBar";

const PLACES: { value: ServicePlace; label: string; hint: string }[] = [
  { value: "store", label: "Di toko saja", hint: "Tanpa biaya perjalanan" },
  { value: "home", label: "Di alamat pelanggan saja", hint: "Selalu ke rumah" },
  { value: "both", label: "Keduanya", hint: "Ditandai per booking, harga sama" },
];

type BulkField = Exclude<BulkAction["kind"], "toggle">;

const BULK_PROMPTS: Record<BulkField, { label: string; placeholder: string }> = {
  price: { label: "Harga baru", placeholder: "139.000" },
  duration: { label: "Durasi baru (menit)", placeholder: "60" },
  percent: { label: "Naik berapa persen (boleh minus)", placeholder: "10" },
  rupiah: { label: "Tambah berapa rupiah (boleh minus)", placeholder: "50.000" },
};

/** The bulk bar's typed value → the change it means, or null when it means nothing. */
function bulkActionOf(field: BulkField, text: string): BulkAction | null {
  const trimmed = text.trim();

  switch (field) {
    case "price": {
      const digits = priceDigits(trimmed);
      return digits === null ? null : { kind: "price", digits };
    }
    case "duration": {
      const minutes = durationValue(trimmed);
      return minutes === null ? null : { kind: "duration", minutes };
    }
    case "percent": {
      const percent = Number(trimmed.replace(",", "."));
      return trimmed !== "" && Number.isFinite(percent)
        ? { kind: "percent", percent }
        : null;
    }
    case "rupiah": {
      const negative = trimmed.startsWith("-");
      const digits = priceDigits(negative ? trimmed.slice(1) : trimmed);
      return digits === null
        ? null
        : { kind: "rupiah", delta: Number(digits) * (negative ? -1 : 1) };
    }
  }
}

/**
 * Layanan › Grooming › a service › Varian & Harga — EDITED IN PLACE, as
 * `buloo-grooming-v3.html` draws it (decided 14 September 2026, on request).
 *
 * ─── A DRAFT, AND ONE SIMPAN ───────────────────────────────────────────────
 *
 * Every box writes to a draft (`serviceVariantDraft.ts`), and a bar at the head
 * of the tab appears once the draft differs from what is stored: Batal throws it
 * away, "Simpan varian & harga" sends it as ONE patch. Not saved per keystroke: a
 * price half typed is not a price, a bulk "+10%" over eight rows is one
 * decision, and the server judges the grid whole — every variant priced and
 * timed — so a row-by-row save would be refused halfway.
 *
 * THE OTHER TABS STAY READ-ONLY, with the service form behind Ubah.
 *
 * ─── WHAT THE MOCKUP HAS AND THIS DOES NOT ─────────────────────────────────
 *
 * Tier Groomer and Zona as price options: neither exists as a variant axis, and
 * the shop asked for the three that do — Ukuran, Jenis bulu, Jenis hewan.
 *
 * ─── THE VALUES ARE THE SHOP'S (14 September 2026) ─────────────────────────
 *
 * How many sizes Ukuran has — the chip's "×3", the mockup's four — and the order
 * "Isi bertingkat" climbs them in are the tenant's pet options, read through
 * `useVariantAxisValues` over the stored variants. So a size retired after this
 * service priced it stays a row, "(nonaktif)", and a size added since is a new
 * blank row the draft asks to be priced. With lists that can grow, ticking all
 * three can exceed the server's MAX_VARIANTS; the grid says so and the draft
 * cannot be saved until an option is unticked.
 */
export function GroomingServiceVariantsEditor({
  service,
  mayUpdate,
  onSaved,
  serviceKind,
}: {
  /** The module's kind — used only for an old service that has none of its own. */
  serviceKind?: ServiceKind;
  service: Service;
  /** `services:update` — without it everything is shown and nothing is editable. */
  mayUpdate: boolean;
  onSaved: (service: Service) => void;
}) {
  const [draft, setDraft] = useState<VariantDraft>(() => seedDraft(service));
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkField, setBulkField] = useState<BulkField | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [tiering, setTiering] = useState(false);
  const [tierBase, setTierBase] = useState("");
  const [tierStep, setTierStep] = useState("");
  const [tierError, setTierError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    valuesFor,
    axes: allAxisDefs,
    loading: optionsLoading,
    error: optionsError,
  } = useVariantAxisValues();
  /*
    The service's own kind's options — the module's for an old service with none
    — plus the ones the draft already prices on (22 September 2026).
  */
  const axisDefs = axisDefsForKind(
    allAxisDefs,
    service.serviceKind ?? serviceKind,
    draft.axes,
  );
  const axisValues = useMemo(
    () => valuesFor(service.variants),
    [valuesFor, service.variants],
  );

  /*
    NOT EDITABLE WITHOUT THE LIST. Which rows an axis makes is the tenant's
    list; with it unknown, ticking one would build a grid from the stored values
    alone and save that as the service's whole price list.
  */
  const disabled = !mayUpdate || saving || optionsError !== null;
  const combos = buildVariantCombos(draft.axes, axisValues);
  const dirty =
    draftSignature(draft, axisValues) !==
    draftSignature(seedDraft(service), axisValues);
  const problem = draftProblem(draft, axisValues);
  const tooMany = combos.length > MAX_VARIANTS;
  const smallestSize = axisValues.sizeCategory?.[0]?.label ?? "ukuran terkecil";
  const activeCount = combos.filter((combo) => rowOf(draft, combo.key).active).length;

  const activePrices = combos
    .map((combo) => rowOf(draft, combo.key))
    .filter((row) => row.active)
    .map((row) => priceDigits(row.price))
    .filter((digits): digits is string => digits !== null)
    .map(Number);

  function closeBulk() {
    setBulkField(null);
    setBulkText("");
    setBulkError(null);
  }

  function change(next: VariantDraft) {
    setDraft(next);
    setSaveError(null);
  }

  function pickAxis(axis: VariantAxisKey, on: boolean) {
    change(toggleAxis(draft, axis, on, axisValues));
    // The rows' keys change with the axes, so a selection would point at nothing.
    setSelected([]);
    closeBulk();
    setTiering(false);
  }

  function runBulk(action: BulkAction) {
    change(applyBulk(draft, selected, action));
    setSelected([]);
    closeBulk();
  }

  function applyBulkText() {
    if (!bulkField) return;
    const action = bulkActionOf(bulkField, bulkText);

    if (!action) {
      setBulkError(
        bulkField === "duration"
          ? `Isi menit antara 1 dan ${MAX_DURATION_MIN}.`
          : bulkField === "percent"
            ? "Isi angka persen, mis. 10 atau -5."
            : "Isi angka rupiah, mis. 150.000.",
      );
      return;
    }

    runBulk(action);
  }

  function applyTier() {
    const base = priceDigits(tierBase);
    const step = priceDigits(tierStep);

    if (base === null || step === null) {
      setTierError(
        `Isi harga ${smallestSize} dan kenaikan per ukuran dalam rupiah.`,
      );
      return;
    }

    change(fillBySize(draft, Number(base), Number(step), axisValues));
    setTiering(false);
    setTierBase("");
    setTierStep("");
    setTierError(null);
  }

  function discard() {
    setDraft(seedDraft(service));
    setSelected([]);
    closeBulk();
    setTiering(false);
    setSaveError(null);
  }

  async function save() {
    if (problem || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      const updated = await serviceService.update(
        service._id,
        draftPatch(draft, axisValues),
      );
      swalToast("Varian & harga tersimpan.");
      onSaved(updated);
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? (err.reason ?? err.fullMessage)
          : "Varian & harga belum tersimpan. Coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  }

  const allSelected = combos.length > 0 && selected.length === combos.length;

  /*
    NO GRID FROM HALF A LIST. Until the tenant's values arrive, every stored
    value would read as "(nonaktif)" and every axis chip would count wrong.
  */
  if (optionsLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat jenis hewan, ukuran, dan bulu…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {mayUpdate && dirty && (
        <DraftSaveBar
          problem={
            problem && (
              <>
                Belum bisa disimpan: <b className="font-semibold">{problem}</b>.
              </>
            )
          }
          saving={saving}
          saveLabel="Simpan varian & harga"
          onDiscard={discard}
          onSave={() => void save()}
        />
      )}

      {saveError && <Alert variant="error">{saveError}</Alert>}
      {optionsError && (
        <Alert variant="error">
          Daftar jenis hewan, ukuran, dan bulu tidak bisa dimuat, jadi varian
          belum bisa diubah. Muat ulang halamannya.
        </Alert>
      )}

      <Card title="Tempat pengerjaan">
        <div
          role="radiogroup"
          aria-label="Tempat pengerjaan"
          className="grid gap-3 md:grid-cols-3"
        >
          {PLACES.map((place) => {
            const checked = draft.place === place.value;

            return (
              <button
                key={place.value}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => change({ ...draft, place: place.value })}
                className={cn(
                  "rounded-xl border p-4 text-left transition focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  checked
                    ? "border-primary bg-surface-selected"
                    : "border-border bg-surface enabled:hover:bg-surface-hover",
                )}
              >
                <span className="block text-sm font-semibold text-foreground">
                  {place.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{place.hint}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Opsi yang membedakan harga">
        <div className="flex flex-wrap gap-2">
          {/*
            EVERY OPSI VARIAN CARD (17 September 2026) — the mockup's three pet
            chips first in its order, then Zona and "Dipilih staf" cards in card
            order. A card is named as the tenant named it.
          */}
          {[
            ...AXIS_ORDER.map((key) => axisDefs.find((def) => def.key === key)).filter(
              (def): def is (typeof axisDefs)[number] => Boolean(def),
            ),
            ...axisDefs.filter((def) => !AXIS_ORDER.includes(def.key)),
          ].map((def) => {
            const axis = def.key;
            const on = draft.axes.includes(axis);

            return (
              <label
                key={axis}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition",
                  on
                    ? "border-primary bg-surface-selected text-primary"
                    : "border-border bg-surface text-foreground hover:bg-surface-hover",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <Checkbox
                  checked={on}
                  disabled={disabled}
                  onCheckedChange={(next) => pickAxis(axis, next === true)}
                />
                {def.name}
                <span className="font-normal text-muted">
                  ×{(axisValues[axis] ?? []).length}
                </span>
              </label>
            );
          })}
        </div>
        {draft.axes.length === 0 && (
          <p className="mt-3 text-sm text-muted">
            Tidak ada yang dicentang — satu harga dan satu durasi untuk semua
            hewan.
          </p>
        )}
      </Card>

      {draft.axes.length === 0 ? (
        <Card title="Harga & durasi">
          <div className="grid max-w-lg gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Harga
              <Input
                inputMode="numeric"
                value={draft.flat.price}
                disabled={disabled}
                aria-invalid={
                  draft.flat.price.trim() !== "" &&
                  priceDigits(draft.flat.price) === null
                }
                onChange={(event) =>
                  change({
                    ...draft,
                    flat: { ...draft.flat, price: event.target.value },
                  })
                }
                onBlur={() => {
                  const digits = priceDigits(draft.flat.price);
                  if (digits !== null) {
                    change({
                      ...draft,
                      flat: { ...draft.flat, price: priceText(digits) },
                    });
                  }
                }}
                placeholder="139.000"
                className="h-11 tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
              Durasi (menit)
              <Input
                type="number"
                min={1}
                max={MAX_DURATION_MIN}
                value={draft.flat.duration}
                disabled={disabled}
                onChange={(event) =>
                  change({
                    ...draft,
                    flat: { ...draft.flat, duration: event.target.value },
                  })
                }
                placeholder="60"
                className="h-11 tabular-nums"
              />
            </label>
          </div>
        </Card>
      ) : (
        <Card
          title="Daftar varian"
          action={
            <div className="flex gap-2">
              <Badge variant="outline" className="border-transparent bg-tint-neutral text-muted tabular-nums">
                {combos.length} varian
              </Badge>
              <Badge variant="outline" className="border-transparent bg-tint-neutral text-muted tabular-nums">
                {activeCount} aktif
              </Badge>
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            {tooMany && (
              <Alert variant="error">
                Kombinasinya jadi {combos.length} varian — maksimal{" "}
                {MAX_VARIANTS} per layanan. Hilangkan salah satu centang di
                atas supaya bisa disimpan.
              </Alert>
            )}

            {mayUpdate && selected.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-primary px-4 py-3 text-primary-foreground">
                <b className="text-sm tabular-nums">{selected.length} dipilih</b>

                {bulkField === null ? (
                  <>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setBulkField("price")}>
                      Set harga
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setBulkField("duration")}>
                      Set durasi
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setBulkField("percent")}>
                      + %
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setBulkField("rupiah")}>
                      + Rp
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => runBulk({ kind: "toggle" })}>
                      Aktif / nonaktif
                    </Button>
                  </>
                ) : (
                  <>
                    <Input
                      aria-label={BULK_PROMPTS[bulkField].label}
                      value={bulkText}
                      onChange={(event) => {
                        setBulkText(event.target.value);
                        setBulkError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyBulkText();
                        }
                      }}
                      placeholder={BULK_PROMPTS[bulkField].placeholder}
                      className="h-9 w-40 bg-surface text-foreground tabular-nums"
                    />
                    <span className="text-sm">{BULK_PROMPTS[bulkField].label}</span>
                    <Button type="button" size="sm" variant="secondary" onClick={applyBulkText}>
                      Terapkan
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground"
                      onClick={closeBulk}
                    >
                      Batal
                    </Button>
                    {bulkError && (
                      <span role="alert" className="w-full text-sm">
                        {bulkError}
                      </span>
                    )}
                  </>
                )}

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Batalkan pilihan"
                  className="ml-auto text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground"
                  onClick={() => {
                    setSelected([]);
                    closeBulk();
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
            )}

            <div className="max-h-105 overflow-auto rounded-xl border border-border">
              <Table className="min-w-140">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        aria-label="Pilih semua varian"
                        checked={allSelected}
                        disabled={disabled}
                        onCheckedChange={(next) =>
                          setSelected(next === true ? combos.map((combo) => combo.key) : [])
                        }
                      />
                    </TableHead>
                    <TableHead>Varian</TableHead>
                    <TableHead className="w-44">Harga</TableHead>
                    <TableHead className="w-36">Durasi</TableHead>
                    <TableHead className="w-20">Aktif</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {combos.map((combo) => {
                    const row = rowOf(draft, combo.key);
                    const picked = selected.includes(combo.key);
                    const badPrice =
                      row.price.trim() !== "" && priceDigits(row.price) === null;
                    const badDuration =
                      row.duration.trim() !== "" && durationValue(row.duration) === null;

                    return (
                      <TableRow
                        key={combo.key}
                        className={cn(picked && "bg-surface-selected")}
                      >
                        <TableCell>
                          <Checkbox
                            aria-label={`Pilih ${combo.label}`}
                            checked={picked}
                            disabled={disabled}
                            onCheckedChange={(next) =>
                              setSelected((current) =>
                                next === true
                                  ? [...current, combo.key]
                                  : current.filter((key) => key !== combo.key),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-sm font-semibold whitespace-nowrap",
                            row.active ? "text-foreground" : "text-muted",
                          )}
                        >
                          {combo.label}
                          {!row.active && (
                            <span className="ml-1.5 text-xs font-normal">· nonaktif</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            aria-label={`Harga ${combo.label}`}
                            inputMode="numeric"
                            value={row.price}
                            disabled={disabled}
                            aria-invalid={badPrice}
                            onChange={(event) =>
                              change(updateRow(draft, combo.key, { price: event.target.value }))
                            }
                            onBlur={() => {
                              const digits = priceDigits(row.price);
                              if (digits !== null && priceText(digits) !== row.price) {
                                change(updateRow(draft, combo.key, { price: priceText(digits) }));
                              }
                            }}
                            placeholder="139.000"
                            className="h-9 font-semibold tabular-nums"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Input
                              aria-label={`Durasi ${combo.label} (menit)`}
                              type="number"
                              min={1}
                              max={MAX_DURATION_MIN}
                              value={row.duration}
                              disabled={disabled}
                              aria-invalid={badDuration}
                              onChange={(event) =>
                                change(
                                  updateRow(draft, combo.key, {
                                    duration: event.target.value,
                                  }),
                                )
                              }
                              placeholder="60"
                              className="h-9 w-20 tabular-nums"
                            />
                            <span className="text-xs text-muted">mnt</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            aria-label={`${combo.label} aktif`}
                            checked={row.active}
                            disabled={disabled}
                            onCheckedChange={(next) =>
                              change(updateRow(draft, combo.key, { active: next === true }))
                            }
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              {mayUpdate && draft.axes.includes("sizeCategory") ? (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto min-h-11 px-0"
                  disabled={saving}
                  onClick={() => setTiering((open) => !open)}
                >
                  Isi bertingkat per ukuran…
                </Button>
              ) : (
                <span />
              )}
              <p className="text-sm text-muted">
                Rentang varian aktif:{" "}
                <b className="font-semibold tabular-nums text-foreground">
                  {activePrices.length === 0
                    ? "—"
                    : Math.min(...activePrices) === Math.max(...activePrices)
                      ? formatMoney(String(Math.min(...activePrices)))
                      : `${formatMoney(String(Math.min(...activePrices)))} – ${formatMoney(String(Math.max(...activePrices)))}`}
                </b>
              </p>
            </div>

            {tiering && (
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                  Harga {smallestSize}
                  <Input
                    inputMode="numeric"
                    value={tierBase}
                    onChange={(event) => {
                      setTierBase(event.target.value);
                      setTierError(null);
                    }}
                    placeholder="139.000"
                    className="h-9 w-36 tabular-nums"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
                  Naik per ukuran
                  <Input
                    inputMode="numeric"
                    value={tierStep}
                    onChange={(event) => {
                      setTierStep(event.target.value);
                      setTierError(null);
                    }}
                    placeholder="20.000"
                    className="h-9 w-36 tabular-nums"
                  />
                </label>
                <Button type="button" size="sm" onClick={applyTier}>
                  Terapkan
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTiering(false);
                    setTierError(null);
                  }}
                >
                  Batal
                </Button>
                {tierError && (
                  <p role="alert" className="w-full text-sm font-semibold text-danger">
                    {tierError}
                  </p>
                )}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
