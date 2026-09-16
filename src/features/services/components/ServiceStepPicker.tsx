"use client";

import { useState } from "react";
import { ChevronsUpDown, Plus } from "lucide-react";

import { Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { invalidateServiceSteps, useServiceSteps } from "@/hooks/useServiceSteps";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { serviceStepService } from "@/services/serviceStep.service";
import type { ServiceStep } from "@/types/api";

/** `NAME_MAX_LENGTH` in serviceStep.model.js — what a booking turn can hold. */
export const SERVICE_STEP_NAME_MAX_LENGTH = 60;

/** "  blow   Dry " → "blow dry" — how the list keys a name (`nameKey`). */
const keyOf = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Why a tahapan a service already lists could not be added to it today — or
 * null when it is an active step of the line.
 *
 *   "nonaktif"        — on the list, retired since.
 *   "belum di daftar" — not on the list at all: a name stored while tahapan
 *                       were free text, or one from the line the service was
 *                       moved away from.
 *
 * Null while the list is loading or failed to load: "not found" in a list that
 * has not arrived is not a fact about the name.
 */
export type ServiceStepFlag = "nonaktif" | "belum di daftar";

export function serviceStepFlag(
  name: string,
  list: {
    loading: boolean;
    error: string | null;
    stepFor: (name: string) => ServiceStep | undefined;
  },
): ServiceStepFlag | null {
  if (list.loading || list.error) return null;

  const step = list.stepFor(name);
  if (!step) return "belum di daftar";
  return step.isActive ? null : "nonaktif";
}

/**
 * The server's sentence(s) for a refused `sessions` — "'Spa' belum ada di
 * daftar tahapan lini ini", "Tahapan 'Blow dry' sudah dinonaktifkan" — or null
 * when the error is about something else. Already in Bahasa, so shown as sent.
 */
export function sessionsRefusal(error: unknown): string | null {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return null;

  const messages = error.details
    .filter(
      (detail) =>
        detail !== null &&
        typeof detail === "object" &&
        typeof detail.field === "string" &&
        /^sessions(\.|\[|$)/.test(
          detail.field.replace(/^(body|params|query)\./, ""),
        ),
    )
    .map((detail) => detail.message);

  return messages.length > 0 ? messages.join(" ") : null;
}

/**
 * The small word beside a tahapan row that cannot be added again. A word, not a
 * colour (ui-rules §1.3): pale warning tint, warning ink.
 */
export function ServiceStepFlagBadge({ flag }: { flag: ServiceStepFlag }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-tint-warning px-2 py-0.5 text-xs font-medium text-warning">
      {flag}
    </span>
  );
}

const ROW =
  "flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition hover:bg-surface-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

/**
 * "+ Tambah tahapan…" — ONE PICKER for both places a service's tahapan are
 * chosen: the service form and the Tahapan card on a grooming service's detail
 * page (decided 14 September 2026).
 *
 * WHAT IT OFFERS is the business line's tahapan list (`useServiceSteps`):
 * ACTIVE steps, in the list's order, minus the ones the service already has —
 * matched case-insensitively, so "mandi" hides "Mandi". The server refuses any
 * other name on save, so offering one would be a list that lies.
 *
 * A NAME NOT ON THE LIST can be put on it from here — "Tambah “X” ke daftar
 * tahapan" saves it to the line's list at once (`POST /service-steps`, which
 * needs `services:update`), and the service gets the name as the list returned
 * it. Only when `mayAddToList`: a role without the grant is told the name is not
 * on the list instead of being offered a button the API refuses.
 *
 * A RETIRED STEP typed by name is said to be nonaktif and is not addable — the
 * server would refuse it on a service that does not already hold it.
 *
 * `onPick` receives the LIST'S SPELLING. It may fire after an await (the quick
 * add), so callers update their draft with a functional update rather than the
 * draft they rendered with.
 */
export function ServiceStepPicker({
  businessLineId,
  taken,
  onPick,
  mayAddToList,
  disabled = false,
  disabledReason = null,
  className,
}: {
  /** The service's line. Empty asks for nothing — see `disabledReason`. */
  businessLineId: string | null | undefined;
  /** What the service already lists; hidden from the options. */
  taken: string[];
  onPick: (name: string) => void;
  /** `services:update` — whether a missing name may be added to the list. */
  mayAddToList: boolean;
  /** Off without saying why — a save in flight. */
  disabled?: boolean;
  /** Off, and this sentence beside the trigger — "Pilih lini bisnis dulu." */
  disabledReason?: string | null;
  className?: string;
}) {
  const lineId = businessLineId ?? "";
  const { steps, loading, error, stepFor, reload } = useServiceSteps(lineId);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const off = disabled || Boolean(disabledReason) || lineId === "";
  const takenKeys = new Set(taken.map(keyOf));

  const typed = query.trim().replace(/\s+/g, " ");
  const typedKey = keyOf(typed);
  const available = steps.filter(
    (step) => step.isActive && !takenKeys.has(step.nameKey),
  );
  const matches = typed
    ? available.filter((step) => step.nameKey.includes(typedKey))
    : available;
  const listed = typed ? stepFor(typed) : undefined;
  const typedTaken = typed !== "" && takenKeys.has(typedKey);
  const typedRetired = !typedTaken && listed !== undefined && !listed.isActive;
  const typedMissing =
    typed !== "" && !typedTaken && listed === undefined && !loading && !error;
  const offerAdd =
    typedMissing && mayAddToList && typed.length <= SERVICE_STEP_NAME_MAX_LENGTH;

  function reset() {
    setQuery("");
    setAddError(null);
  }

  function pick(name: string) {
    onPick(name);
    reset();
    setOpen(false);
  }

  async function addToList(name: string) {
    if (adding || !lineId) return;

    setAdding(name);
    setAddError(null);
    try {
      const step = await serviceStepService.create({
        businessLineId: lineId,
        name,
      });
      invalidateServiceSteps(lineId);
      pick(step.name);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Somebody added it a moment ago. The reloaded list offers it — or says
        // it is nonaktif — under the same typed name.
        invalidateServiceSteps(lineId);
        setAddError(
          `“${name}” ternyata sudah ada di daftar tahapan. Daftarnya dimuat ulang — pilih dari sana.`,
        );
      } else if (err instanceof ApiError && err.status === 403) {
        setAddError("Peran ini belum boleh menambah tahapan ke daftar.");
      } else {
        setAddError(`“${name}” belum tersimpan ke daftar tahapan. Coba lagi.`);
      }
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover
        open={open}
        onOpenChange={(next) => {
          // A quick add in flight keeps the popover, so its answer lands where
          // it was asked.
          if (!next && adding) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            disabled={off}
            className={cn("min-w-56 justify-between", className)}
          >
            <span className="flex items-center gap-1.5">
              <Plus className="size-4" aria-hidden />
              Tambah tahapan…
            </span>
            <ChevronsUpDown className="size-4 text-muted" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-2">
          <Input
            aria-label="Cari tahapan"
            autoFocus
            value={query}
            maxLength={SERVICE_STEP_NAME_MAX_LENGTH}
            disabled={adding !== null}
            onChange={(event) => {
              setQuery(event.target.value);
              setAddError(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const exact = available.find((step) => step.nameKey === typedKey);
              if (exact) pick(exact.name);
              else if (offerAdd) void addToList(typed);
            }}
            placeholder={mayAddToList ? "Cari atau ketik tahapan baru" : "Cari tahapan"}
            className="h-9"
          />

          <div className="mt-2 flex max-h-64 flex-col overflow-y-auto">
            {loading ? (
              <p className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted">
                <Spinner size={16} /> Memuat daftar tahapan…
              </p>
            ) : error ? (
              <div className="flex flex-col items-start gap-1 px-2 py-1.5">
                <p className="text-sm font-semibold text-danger">
                  Daftar tahapan tidak bisa dimuat.
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={reload}>
                  Muat ulang
                </Button>
              </div>
            ) : (
              <>
                {typedTaken && (
                  <p className="px-2 py-1.5 text-sm text-muted">
                    Tahapan ini sudah ada di layanan ini.
                  </p>
                )}
                {typedRetired && listed && (
                  <p className="px-2 py-1.5 text-sm text-muted">
                    “{listed.name}” sudah dinonaktifkan di daftar tahapan, jadi
                    tidak bisa ditambahkan.
                  </p>
                )}
                {offerAdd && (
                  <button
                    type="button"
                    disabled={adding !== null}
                    onClick={() => void addToList(typed)}
                    className={cn(ROW, "font-semibold text-primary")}
                  >
                    {adding ? <Spinner size={16} /> : <Plus className="size-4" aria-hidden />}
                    {adding
                      ? `Menyimpan “${adding}”…`
                      : `Tambah “${typed}” ke daftar tahapan`}
                  </button>
                )}
                {typedMissing && !mayAddToList && (
                  <p className="px-2 py-1.5 text-sm text-muted">
                    “{typed}” belum ada di daftar tahapan lini ini.
                  </p>
                )}
                {addError && (
                  <p role="alert" className="px-2 py-1.5 text-sm font-semibold text-danger">
                    {addError}
                  </p>
                )}

                {matches.length > 0 ? (
                  <>
                    <p className="px-2 pt-1.5 pb-1 text-xs text-muted">
                      Daftar tahapan lini ini
                    </p>
                    {matches.map((step) => (
                      <button
                        key={step._id}
                        type="button"
                        disabled={adding !== null}
                        onClick={() => pick(step.name)}
                        className={cn(ROW, "text-foreground")}
                      >
                        {step.name}
                      </button>
                    ))}
                  </>
                ) : (
                  typed === "" && (
                    <p className="px-2 py-1.5 text-sm text-muted">
                      {available.length === 0 && steps.some((step) => step.isActive)
                        ? "Semua tahapan di daftar sudah dipakai layanan ini."
                        : "Belum ada tahapan di daftar lini ini."}
                      {mayAddToList && " Ketik nama untuk menambahkannya."}
                    </p>
                  )
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {disabledReason && (
        <span className="text-xs text-muted">{disabledReason}</span>
      )}
    </div>
  );
}
