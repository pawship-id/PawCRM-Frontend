"use client";

import { useState, type ReactNode } from "react";
import { Pencil, Plus, X } from "lucide-react";

import { Alert, ConfirmDialog, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/permissions";
import { invalidatePetOptions } from "@/hooks/usePetOptions";
import { invalidateVariantOptions, useVariantOptions } from "@/hooks/useVariantOptions";
import { invalidateZones } from "@/hooks/useZones";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { petOptionService } from "@/services/petOption.service";
import { variantOptionService } from "@/services/variantOption.service";
import { zoneService } from "@/services/zone.service";
import type { PetOptionType, VariantOption, Zone } from "@/types/api";

import type { UsePetOptionListResult } from "../hooks/usePetOptionList";
import type { UseZoneListResult } from "../hooks/useZoneList";
import { byOrder } from "../petOptions";
import { zoneRangeText } from "../zones";
import { PetOptionFormDialog } from "./PetOptionFormDialog";
import {
  VariantOptionEditDialog,
  VariantOptionFormDialog,
  VariantValueDialog,
  VariantValueEditDialog,
} from "./VariantOptionFormDialog";
import { ZoneFormDialog } from "./ZoneFormDialog";

/** One chip on a card: what it says, how it is changed, and how it is removed. */
interface Chip {
  key: string;
  label: string;
  /** The small grey text after the label — a zone's range. */
  meta?: string;
  retired?: boolean;
  /** What a click on the chip opens. */
  edit: Editing;
  remove: () => Promise<unknown>;
}

type Editing =
  | { kind: "card"; card: VariantOption }
  | {
      kind: "value";
      optionName: string;
      value: { label: string; isActive: boolean };
      save: (patch: { label?: string; isActive?: boolean }) => Promise<unknown>;
    }
  | { kind: "zone"; zone: Zone }
  | null;

type Pending =
  | { kind: "card"; card: VariantOption }
  | { kind: "value"; card: VariantOption; chip: Chip }
  | null;

type Adding =
  | { kind: "card" }
  | { kind: "pet"; type: PetOptionType }
  | { kind: "staff"; card: VariantOption }
  | { kind: "zone" }
  | null;

/** The pet-option list a pet card's values come from. */
const PET_TYPE_OF: Partial<Record<VariantOption["source"], PetOptionType>> = {
  species: "species",
  size: "size",
  furType: "furType",
};

/**
 * Opsi Varian — one section of Pengaturan › Layanan, drawn as the mockup's
 * cards (17 September 2026): what a service's price may vary by.
 *
 * ─── EACH CARD WRITES WHERE ITS VALUES LIVE ────────────────────────────────
 *
 * The pet's three (Jenis Hewan, Ukuran, Jenis Bulu) are the tenant's pet
 * options — "+ Nilai" and ✕ write `/pet-options`, the same list the pet form
 * picks from. Zona's values are the zones — "+ Nilai" opens the zone dialog.
 * A "Dipilih staf" card keeps its own values. A card is one list, wherever it
 * is stored.
 *
 * ─── BADGES ────────────────────────────────────────────────────────────────
 *
 * "Otomatis" — answered for the staff (the pet's profile, the customer's
 * address); "Dipilih staf" — chosen at booking, till and invoice. "N layanan"
 * is how many live services price on the card, counted by the server; it is
 * also why ✕ is refused, and the refusal says so.
 *
 * ─── WHAT IS NOT HERE ──────────────────────────────────────────────────────
 *
 * Ordering values is not here — a pet list's order is on its own table, a zone's
 * is its distance. Renaming and retiring are: the pencil edits a card's name and
 * keterangan, a click on a chip its value's name and "Masih ditawarkan" (a zone
 * chip opens the zone dialog).
 */
export function VariantOptionsPanel({
  petOptions,
  zones,
  intro,
}: {
  petOptions: UsePetOptionListResult;
  zones: UseZoneListResult;
  intro?: ReactNode;
}) {
  const { can } = usePermissions();
  const cards = useVariantOptions();

  const [adding, setAdding] = useState<Adding>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [working, setWorking] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);

  function refreshAll() {
    invalidateVariantOptions();
    petOptions.refetch();
    invalidatePetOptions();
    zones.refetch();
    invalidateZones();
  }

  function chipsOf(card: VariantOption): Chip[] {
    const petType = PET_TYPE_OF[card.source];

    if (petType) {
      return petOptions.options
        .filter((option) => option.type === petType && option.deletedAt === null)
        .sort(byOrder)
        .map((option) => ({
          key: option._id,
          label: option.label,
          retired: !option.isActive,
          edit: {
            kind: "value" as const,
            optionName: card.name,
            value: { label: option.label, isActive: option.isActive },
            save: (patch) => petOptionService.update(option._id, patch),
          },
          remove: () => petOptionService.remove(option._id),
        }));
    }

    if (card.source === "zone") {
      return zones.zones
        .filter((zone) => zone.deletedAt === null)
        .map((zone) => ({
          key: zone._id,
          label: zone.name,
          meta: zoneRangeText(zone),
          edit: { kind: "zone" as const, zone },
          remove: () => zoneService.remove(zone._id),
        }));
    }

    return [...card.values]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((value) => ({
        key: value.code,
        label: value.label,
        retired: !value.isActive,
        edit: {
          kind: "value" as const,
          optionName: card.name,
          value: { label: value.label, isActive: value.isActive },
          save: (patch) => variantOptionService.updateValue(card._id, value.code, patch),
        },
        remove: () => variantOptionService.removeValue(card._id, value.code),
      }));
  }

  /** Who may rename or retire a card's values — the list's own grant. */
  function mayUpdateValues(card: VariantOption) {
    if (PET_TYPE_OF[card.source]) return can("petOptions", "update");
    return can("services", "update");
  }

  /** Who may add or remove a card's values — the list's own grant. */
  function mayEditValues(card: VariantOption) {
    if (PET_TYPE_OF[card.source]) return can("petOptions", "create") || can("petOptions", "delete");
    if (card.source === "zone") return can("services", "create") || can("services", "delete");
    return can("services", "update");
  }

  async function confirmPending() {
    if (!pending) return;
    setWorking(true);
    setPendingError(null);

    try {
      if (pending.kind === "card") {
        await variantOptionService.remove(pending.card._id);
        swalToast(`Opsi ${pending.card.name} dihapus.`);
      } else {
        await pending.chip.remove();
        swalToast(`${pending.chip.label} dihapus dari ${pending.card.name}.`);
      }
      setPending(null);
      refreshAll();
    } catch (error) {
      // The server's reason says what holds it — "masih dipakai 3 layanan".
      setPendingError(error instanceof ApiError ? error.fullMessage : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setWorking(false);
    }
  }

  const live = cards.items.filter((card) => card.deletedAt === null);
  const hasZoneCard = live.some((card) => card.source === "zone");

  return (
    <div className="flex flex-col gap-5">
      {intro}

      <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Opsi varian</h3>
        {can("services", "create") && (
          <Button variant="ghost" size="sm" onClick={() => setAdding({ kind: "card" })}>
            <Plus className="size-4" aria-hidden />
            Tambah opsi
          </Button>
        )}
      </div>

      {cards.error && <Alert variant="error">{cards.error}</Alert>}

      {!cards.loaded || (cards.loading && live.length === 0) ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat opsi varian…
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {live.map((card) => {
            const chips = chipsOf(card);
            const staff = card.source === "staff";

            return (
              <li
                key={card._id}
                className="rounded-xl border border-border bg-surface p-4"
                aria-label={`Opsi ${card.name}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-base font-bold text-foreground">{card.name}</h4>
                    {card.description && (
                      <p className="text-sm text-muted">{card.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={
                        staff
                          ? "rounded-full bg-tint-warning px-2 py-0.5 text-xs font-medium text-warning"
                          : "rounded-full bg-tint-success px-2 py-0.5 text-xs font-medium text-success"
                      }
                    >
                      {staff ? "Dipilih staf" : "Otomatis"}
                    </span>
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted tabular-nums">
                      {card.serviceCount} layanan
                    </span>
                    {can("services", "update") && (
                      <Button
                        variant="ghost"
                        className="size-9 text-muted"
                        aria-label={`Ubah opsi ${card.name}`}
                        onClick={() => setEditing({ kind: "card", card })}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                    )}
                    {!card.builtIn && can("services", "delete") && (
                      <Button
                        variant="ghost"
                        className="size-9 text-muted hover:bg-tint-danger hover:text-danger-ink"
                        aria-label={`Hapus opsi ${card.name}`}
                        onClick={() => {
                          setPendingError(null);
                          setPending({ kind: "card", card });
                        }}
                      >
                        <X className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {chips.length === 0 && (
                    <span className="text-sm text-muted">
                      {card.source === "zone" ? "Belum ada zona." : "Belum ada nilai."}
                    </span>
                  )}
                  {chips.map((chip) => (
                    <span
                      key={chip.key}
                      className={
                        chip.retired
                          ? "inline-flex h-8 items-center gap-2 rounded-full bg-tint-neutral pr-1 pl-3 text-sm text-muted"
                          : "inline-flex h-8 items-center gap-2 rounded-full bg-tint-brand pr-1 pl-3 text-sm font-semibold text-foreground"
                      }
                    >
                      {mayUpdateValues(card) ? (
                        <button
                          type="button"
                          aria-label={`Ubah ${chip.label} di ${card.name}`}
                          className="rounded-sm hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          onClick={() => setEditing(chip.edit)}
                        >
                          {chip.label}
                        </button>
                      ) : (
                        chip.label
                      )}
                      {chip.retired && <span className="text-xs font-normal">(nonaktif)</span>}
                      {chip.meta && (
                        <span className="text-xs font-normal text-muted tabular-nums">{chip.meta}</span>
                      )}
                      {mayEditValues(card) && (
                        <button
                          type="button"
                          aria-label={`Hapus ${chip.label} dari ${card.name}`}
                          className="flex size-6 items-center justify-center rounded-full text-muted transition hover:bg-tint-danger hover:text-danger-ink focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                          onClick={() => {
                            setPendingError(null);
                            setPending({ kind: "value", card, chip });
                          }}
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </span>
                  ))}
                  {mayEditValues(card) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Tambah nilai ${card.name}`}
                      onClick={() => {
                        const petType = PET_TYPE_OF[card.source];
                        setAdding(
                          petType
                            ? { kind: "pet", type: petType }
                            : card.source === "zone"
                              ? { kind: "zone" }
                              : { kind: "staff", card },
                        );
                      }}
                    >
                      <Plus className="size-4" aria-hidden />
                      Nilai
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="max-w-2xl text-sm text-muted">
        Opsi yang dicentang di form layanan jadi pembeda harganya. Opsi yang masih
        dipakai layanan tidak bisa dihapus — lepas dulu dari harga varian layanan itu.
      </p>

      {adding?.kind === "card" && (
        <VariantOptionFormDialog
          hasZoneCard={hasZoneCard}
          onClose={() => setAdding(null)}
          onSaved={refreshAll}
        />
      )}
      {adding?.kind === "pet" && (
        <PetOptionFormDialog type={adding.type} onClose={() => setAdding(null)} onSaved={refreshAll} />
      )}
      {adding?.kind === "staff" && (
        <VariantValueDialog
          optionId={adding.card._id}
          optionName={adding.card.name}
          onClose={() => setAdding(null)}
          onSaved={refreshAll}
        />
      )}
      {adding?.kind === "zone" && (
        <ZoneFormDialog zones={zones.zones} onClose={() => setAdding(null)} onSaved={refreshAll} />
      )}

      {editing?.kind === "card" && (
        <VariantOptionEditDialog
          option={editing.card}
          onClose={() => setEditing(null)}
          onSaved={refreshAll}
        />
      )}
      {editing?.kind === "value" && (
        <VariantValueEditDialog
          optionName={editing.optionName}
          value={editing.value}
          save={editing.save}
          onClose={() => setEditing(null)}
          onSaved={refreshAll}
        />
      )}
      {editing?.kind === "zone" && (
        <ZoneFormDialog
          zone={editing.zone}
          zones={zones.zones}
          onClose={() => setEditing(null)}
          onSaved={refreshAll}
        />
      )}

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === "card"
              ? `Hapus opsi ${pending.card.name}?`
              : `Hapus ${pending.chip.label} dari ${pending.card.name}?`
          }
          confirmLabel="Hapus"
          destructive
          busy={working}
          error={pendingError}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        >
          {pending.kind === "card"
            ? "Opsinya tidak bisa dicentang lagi di form layanan. Ditolak kalau masih dipakai layanan."
            : "Ditolak kalau masih dipakai layanan atau data hewan — nonaktifkan saja kalau begitu."}
        </ConfirmDialog>
      )}
    </div>
  );
}
