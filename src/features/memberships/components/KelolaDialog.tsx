"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { SelectField, Spinner, TextField, TextareaField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { membershipService } from "@/services/membership.service";
import { petService } from "@/services/pet.service";
import type { Pet } from "@/types/api";
import type {
  KelolaReason,
  MembershipRedemption,
  PetMembership,
} from "@/types/membership";
import { MEMBERSHIP_LIMITS } from "@/types/membership";
import { isoDate } from "@/utils/date";

import { membershipFailure } from "../errors";
import {
  type KelolaPreview,
  type KelolaType,
  cardRange,
  dayKey,
  hasUsage,
  previewAdjustDates,
  previewAdjustQuota,
  previewCancel,
  previewMoveRedemption,
  previewPause,
  previewTransfer,
  quotaAdjustable,
  transferBlockReason,
} from "../kelola";
import {
  KELOLA_ACTIONS,
  KELOLA_CANCEL,
  KELOLA_REASON_OPTIONS,
  KELOLA_ROLES_TEXT,
  quotaText,
} from "../labels";

/**
 * Kelola keanggotaan — ONE dialog, a body per action (BO prototype
 * `renderKelola`): the action's own fields, then Alasan (required, one of the
 * five exact strings) and Catatan, then a preview of what will change.
 *
 * A RAW `ui/dialog` because the body is a form (ui-rules §9). A failed save is a
 * toast in the server's words, with field errors under their inputs
 * (`membershipFailure`); a success is a toast and the caller refetches.
 *
 * THE PREVIEW IS A FORECAST (`kelola.ts`): it blocks the save on what the
 * server is known to refuse, and leaves everything else to the server.
 */

const TITLE: Record<KelolaType, string> = {
  "adjust-dates": KELOLA_ACTIONS["adjust-dates"].title,
  pause: KELOLA_ACTIONS.pause.title,
  "adjust-quota": KELOLA_ACTIONS["adjust-quota"].title,
  transfer: KELOLA_ACTIONS.transfer.title,
  move: "Ubah tanggal pakai",
  cancel: KELOLA_CANCEL.title,
};

/** The save button names what it saves (ui-rules §16). */
const SAVE_LABEL: Record<KelolaType, string> = {
  "adjust-dates": "Simpan masa berlaku",
  pause: "Simpan penundaan",
  "adjust-quota": "Simpan koreksi jatah",
  transfer: "Pindahkan membership",
  move: "Simpan tanggal pakai",
  cancel: "Batalkan membership",
};

const SUCCESS: Record<KelolaType, string> = {
  "adjust-dates": "Masa berlaku diubah dan tercatat di riwayat.",
  pause: "Membership ditunda dan tercatat di riwayat.",
  "adjust-quota": "Jatah dikoreksi dan tercatat di riwayat.",
  transfer: "Membership dipindah dan tercatat di riwayat.",
  move: "Tanggal pakai diubah dan tercatat di riwayat.",
  cancel: "Membership dibatalkan.",
};

/** What the dialog is opened on. `redemption` only for `move`. */
export interface KelolaTarget {
  type: KelolaType;
  redemption?: MembershipRedemption | null;
}

export function KelolaDialog({
  card,
  target,
  onClose,
  onSaved,
}: {
  card: PetMembership;
  target: KelolaTarget | null;
  onClose: () => void;
  onSaved: (card: PetMembership) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(next) => !next && onClose()}>
      {target && (
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          {/* Keyed so every opening starts from a clean form. */}
          <KelolaBody
            key={`${target.type}-${target.redemption?.id ?? ""}`}
            card={card}
            target={target}
            onClose={onClose}
            onSaved={onSaved}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function holderLine(card: PetMembership): string {
  const holder = card.petName
    ? `${card.petName} · ${card.customerName ?? "Pelanggan"}`
    : (card.customerName ?? "Pelanggan");
  return `${holder} · ${card.plan.name ?? "Membership"} · ${card.number}`;
}

function KelolaBody({
  card,
  target,
  onClose,
  onSaved,
}: {
  card: PetMembership;
  target: KelolaTarget;
  onClose: () => void;
  onSaved: (card: PetMembership) => void;
}) {
  const { type, redemption } = target;
  const today = isoDate(new Date());
  const range = cardRange(card);
  const canShiftStart = !hasUsage(card);

  const [reason, setReason] = useState<KelolaReason | "">("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /* adjust-dates */
  const [mode, setMode] = useState<"start" | "end">(canShiftStart ? "start" : "end");
  const [date, setDate] = useState(() =>
    type === "move" && redemption
      ? dayKey(redemption.usedAt)
      : canShiftStart
        ? range.start
        : range.end,
  );
  /* pause */
  const [pauseStart, setPauseStart] = useState(today);
  const [pauseDays, setPauseDays] = useState("7");
  /* adjust-quota */
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  /* transfer */
  const [targetPetId, setTargetPetId] = useState("");
  const pets = useTransferPets(type === "transfer" ? card.customerId : null);

  const preview: KelolaPreview = useMemo(() => {
    switch (type) {
      case "adjust-dates":
        return previewAdjustDates(card, { mode, date }, today);
      case "pause":
        return previewPause(card, { startDate: pauseStart, days: Number(pauseDays) }, today);
      case "adjust-quota":
        return previewAdjustQuota(card, deltas);
      case "transfer":
        return previewTransfer(
          card,
          pets.items.find((pet) => pet._id === targetPetId)?.name ?? null,
        );
      case "move":
        return redemption
          ? previewMoveRedemption(card, redemption, date)
          : { rows: [], errors: ["Pemakaian tidak ditemukan."] };
      case "cancel":
        return previewCancel(card);
    }
  }, [type, card, mode, date, today, pauseStart, pauseDays, deltas, pets.items, targetPetId, redemption]);

  const blocked = (() => {
    if (preview.errors.length) return preview.errors[0];
    if (type === "adjust-quota" && !Object.values(deltas).some(Boolean)) {
      return "Belum ada penyesuaian.";
    }
    if (type === "transfer" && !targetPetId) return "Pilih hewan tujuan.";
    if (!reason) return "Pilih alasan dulu.";
    return null;
  })();

  async function save() {
    if (blocked || !reason) return;
    setSaving(true);
    setFieldErrors({});
    const base = { reason, note: note.trim() || null };

    try {
      let next: PetMembership;
      switch (type) {
        case "adjust-dates":
          next = await membershipService.adjustDates(card.id, { ...base, mode, date });
          break;
        case "pause":
          next = await membershipService.pause(card.id, {
            ...base,
            startDate: pauseStart,
            days: Number(pauseDays),
          });
          break;
        case "adjust-quota":
          next = await membershipService.adjustQuota(card.id, {
            ...base,
            adjustments: Object.entries(deltas)
              .filter(([, delta]) => delta !== 0)
              .map(([benefitId, delta]) => ({ benefitId, delta })),
          });
          break;
        case "transfer":
          next = await membershipService.transfer(card.id, { ...base, petId: targetPetId });
          break;
        case "move":
          next = await membershipService.moveRedemption(card.id, redemption!.id, {
            ...base,
            usedAt: date,
          });
          break;
        case "cancel":
          next = await membershipService.cancel(card.id, base);
          break;
      }
      swalToast(SUCCESS[type], "success");
      onSaved(next);
      onClose();
    } catch (err) {
      const failure = membershipFailure(err, "Perubahan gagal disimpan. Coba lagi.");
      setFieldErrors(failure.fieldErrors);
      swalToast(failure.toast, "error", 6000);
    } finally {
      setSaving(false);
    }
  }

  const quotaRows = (card.benefits ?? []).filter(quotaAdjustable);

  return (
    <>
      <DialogHeader>
        <DialogTitle>{TITLE[type]}</DialogTitle>
        <DialogDescription className="tabular-nums">{holderLine(card)}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        {type === "adjust-dates" && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground" id="kelola-mode-label">
                Yang diubah
              </span>
              <div
                role="group"
                aria-labelledby="kelola-mode-label"
                className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-border bg-background p-1"
              >
                <Segment
                  pressed={mode === "start"}
                  disabled={!canShiftStart}
                  onClick={() => {
                    setMode("start");
                    setDate(range.start);
                  }}
                >
                  Geser tanggal mulai
                </Segment>
                <Segment
                  pressed={mode === "end"}
                  onClick={() => {
                    setMode("end");
                    setDate(range.end);
                  }}
                >
                  Ubah tanggal berakhir
                </Segment>
              </div>
              {!canShiftStart && (
                <p className="text-sm text-muted">
                  Tanggal mulai tidak bisa digeser karena jatah sudah pernah dipakai.
                </p>
              )}
            </div>
            <TextField
              label={mode === "start" ? "Tanggal mulai baru" : "Tanggal berakhir baru"}
              type="date"
              required
              value={date}
              min={mode === "end" ? today : undefined}
              onChange={(event) => setDate(event.target.value)}
              error={fieldErrors.date}
            />
          </>
        )}

        {type === "pause" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Mulai ditunda"
              type="date"
              required
              value={pauseStart}
              min={today}
              max={range.end}
              onChange={(event) => setPauseStart(event.target.value)}
              error={fieldErrors.startDate}
            />
            <TextField
              label="Lama (hari)"
              type="number"
              inputMode="numeric"
              required
              min={1}
              max={MEMBERSHIP_LIMITS.maxPauseDays}
              value={pauseDays}
              onChange={(event) => setPauseDays(event.target.value)}
              error={fieldErrors.days}
              hint={`Maksimal ${MEMBERSHIP_LIMITS.maxPauseDays} hari per keanggotaan.`}
            />
          </div>
        )}

        {type === "move" && (
          <TextField
            label="Tanggal pakai yang benar"
            type="date"
            required
            value={date}
            min={range.start}
            max={range.end}
            onChange={(event) => setDate(event.target.value)}
            error={fieldErrors.usedAt}
            hint="Hanya memindahkan hitungan jatah ke periode yang benar. Transaksinya tidak berubah."
          />
        )}

        {type === "adjust-quota" &&
          (quotaRows.length === 0 ? (
            <p className="text-sm text-muted">
              Paket ini tidak punya jatah berkuota yang bisa dikoreksi.
            </p>
          ) : (
            <div className="rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Benefit</TableHead>
                    <TableHead className="text-right">Kuota</TableHead>
                    <TableHead className="text-right">Penyesuaian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotaRows.map((benefit, index) => {
                    const delta = deltas[benefit.id] ?? 0;
                    const set = (value: number) =>
                      setDeltas((current) => ({ ...current, [benefit.id]: value }));
                    const error =
                      fieldErrors[`adjustments[${index}].delta`] ??
                      fieldErrors[`adjustments[${index}].benefitId`];
                    return (
                      <TableRow key={benefit.id}>
                        <TableCell>
                          <p className="font-medium">{benefit.label}</p>
                          <p className="text-sm text-muted">
                            {quotaText(benefit.quota)} · terpakai {benefit.used ?? 0}
                            {benefit.quota.perPeriod ? " periode ini" : ""}
                          </p>
                          {error && <p className="text-sm font-semibold text-danger-ink">{error}</p>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{benefit.cap}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              aria-label={`Kurangi ${benefit.label}`}
                              disabled={delta <= -99}
                              onClick={() => set(delta - 1)}
                            >
                              <Minus className="size-4" aria-hidden />
                            </Button>
                            <span
                              className="w-10 text-center text-sm font-semibold tabular-nums"
                              aria-live="polite"
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              aria-label={`Tambah ${benefit.label}`}
                              disabled={delta >= 99}
                              onClick={() => set(delta + 1)}
                            >
                              <Plus className="size-4" aria-hidden />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ))}

        {type === "transfer" && (
          <TransferPicker
            card={card}
            pets={pets}
            value={targetPetId}
            onChange={setTargetPetId}
            error={fieldErrors.petId}
          />
        )}

        <SelectField
          label="Alasan"
          required
          value={reason}
          onChange={(value) => setReason(value as KelolaReason)}
          options={KELOLA_REASON_OPTIONS}
          placeholder="Pilih alasan"
          error={fieldErrors.reason}
        />

        <TextareaField
          label="Catatan"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="Opsional"
        />

        <PreviewBox preview={preview} />
      </div>

      <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm text-muted">Boleh dilakukan: {KELOLA_ROLES_TEXT}</p>
          {blocked && !preview.errors.length && (
            <p className="text-sm font-medium text-foreground">{blocked}</p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button
            type="button"
            variant={type === "cancel" ? "destructive" : "default"}
            onClick={save}
            disabled={saving || blocked !== null}
          >
            {saving ? "Menyimpan…" : SAVE_LABEL[type]}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

function Segment({
  pressed,
  disabled,
  onClick,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-md border border-transparent px-3 text-sm font-semibold transition",
        "outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        pressed ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** The forecast, as label · value rows, then the refusals in red. */
function PreviewBox({ preview }: { preview: KelolaPreview }) {
  return (
    <section
      aria-label="Pratinjau perubahan"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-xl bg-navy-100 p-4"
    >
      {preview.rows.length > 0 && (
        <dl className="flex flex-col gap-1.5">
          {preview.rows.map((row) => (
            <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-4">
              <dt className="text-sm text-muted">{row.label}</dt>
              <dd
                className={cn(
                  "text-sm tabular-nums",
                  row.strong ? "font-semibold" : "",
                  row.tone === "success"
                    ? "text-success"
                    : row.tone === "danger"
                      ? "text-danger-ink"
                      : "text-foreground",
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {preview.empty && <p className="text-sm text-muted">{preview.empty}</p>}
      {preview.errors.map((error) => (
        <p key={error} className="text-sm font-semibold text-danger-ink">
          {error}
        </p>
      ))}
    </section>
  );
}

/* ───────────────────────────────────────────────────────── transfer */

interface TransferPets {
  items: Pet[];
  held: Set<string>;
  loading: boolean;
  error: string | null;
}

/**
 * The owner's animals and which of them already hold a running card — two
 * requests, made only when the transfer dialog opens.
 */
function useTransferPets(customerId: string | null): TransferPets {
  const [state, setState] = useState<TransferPets>({
    items: [],
    held: new Set(),
    loading: Boolean(customerId),
    error: null,
  });

  useEffect(() => {
    if (!customerId) return;
    let active = true;

    Promise.all([
      petService.list({ customerId, limit: 100 }),
      membershipService.listMemberships({
        customerId,
        attachTo: "pet",
        status: ["active", "scheduled", "paused", "awaiting_payment"],
        limit: 100,
      }),
    ])
      .then(([pets, cards]) => {
        if (!active) return;
        setState({
          items: pets.items,
          held: new Set(cards.items.map((entry) => entry.petId).filter(Boolean) as string[]),
          loading: false,
          error: null,
        });
      })
      .catch(() => {
        if (active) {
          setState({ items: [], held: new Set(), loading: false, error: "Daftar hewan tidak bisa dimuat." });
        }
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  return state;
}

function TransferPicker({
  card,
  pets,
  value,
  onChange,
  error,
}: {
  card: PetMembership;
  pets: TransferPets;
  value: string;
  onChange: (petId: string) => void;
  error?: string;
}) {
  const others = pets.items.filter((pet) => pet._id !== card.petId);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground" id="kelola-transfer-label">
        Pindah ke <span className="text-danger-ink">*</span>
      </span>
      {pets.loading ? (
        <div className="flex items-center gap-2 py-2 text-sm text-muted">
          <Spinner /> Memuat hewan…
        </div>
      ) : pets.error ? (
        <p className="text-sm font-semibold text-danger-ink">{pets.error}</p>
      ) : others.length === 0 ? (
        <p className="text-sm text-muted">Pelanggan ini tidak punya hewan lain.</p>
      ) : (
        <div role="radiogroup" aria-labelledby="kelola-transfer-label" className="flex flex-col gap-2">
          {others.map((pet) => {
            const why = transferBlockReason(pet, card, pets.held);
            const variant = [pet.speciesLabel, pet.sizeLabel, pet.furTypeLabel]
              .filter(Boolean)
              .join(" · ");
            const selected = value === pet._id;
            return (
              <button
                key={pet._id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={why !== null}
                onClick={() => onChange(pet._id)}
                className={cn(
                  "flex min-h-11 flex-col items-start rounded-lg border-[1.5px] px-3 py-2 text-left transition",
                  "outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  selected ? "border-primary bg-navy-100" : "border-border bg-surface hover:bg-surface-hover",
                )}
              >
                <span className="text-sm font-semibold text-foreground">{pet.name}</span>
                <span className="text-sm text-muted">
                  {[variant || null, why].filter(Boolean).join(" · ") || "—"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="text-sm font-semibold text-danger-ink">{error}</p>}
    </div>
  );
}
