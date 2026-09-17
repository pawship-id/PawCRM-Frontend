"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

import {
  Alert,
  FilterBar,
  FilterPills,
  FilterToggle,
  Spinner,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import { invalidatePetOptions } from "@/hooks/usePetOptions";
import type { PetOption, PetOptionType } from "@/types/api";

import type { UsePetOptionListResult } from "../hooks/usePetOptionList";
import { PET_OPTION_TYPE_WORDS, byOrder } from "../petOptions";
import { PetOptionFormDialog } from "./PetOptionFormDialog";
import { PetOptionsTable } from "./PetOptionsTable";

/** Which dialog is open: none, add to the current list, or rename that option. */
type DialogState =
  | { mode: "create" }
  | { mode: "rename"; option: PetOption }
  | null;

/**
 * The tenant's own words for an animal — one section of Pengaturan › Layanan.
 *
 * TWO SECTIONS DRAW THIS PANEL (17 September 2026, mockup
 * `buloo-pengaturan-v3`): Opsi Varian holds jenis hewan, ukuran and jenis bulu —
 * the three a service's price may vary by (`ServiceVariantAxis`) — and Ras holds
 * breeds alone, because a breed is never a price axis. It was one screen,
 * Data hewan, with a pill for each of the four.
 *
 * WITH MORE THAN ONE TYPE the type is the panel's main lens, a pill row with
 * counts (§8). With one there is nothing to choose and no pills are drawn.
 *
 * THE COUNTS ARE LIVE OPTIONS — active and retired, not deleted — whatever the
 * toggle says. A pill's number should not change because somebody asked to see
 * the bin.
 *
 * THE LIST IS THE HUB'S, passed in: one load for all four types feeds both
 * sections and the rail's counts (see `usePetOptionList`).
 *
 * AFTER EVERY WRITE, TWO RE-READS: that list, and the app-wide store behind
 * every picker (`invalidatePetOptions`), so a size added here is in the pet form
 * without a reload.
 */
export function PetOptionsPanel({
  types,
  list,
  intro,
}: {
  /** In pill order; the first is the one the panel opens on. */
  types: readonly PetOptionType[];
  list: UsePetOptionListResult;
  /** The section's callout, above everything else. */
  intro?: ReactNode;
}) {
  const { options, loading, error, refetch } = list;
  const { can } = usePermissions();

  const [chosenType, setType] = useState<PetOptionType>(types[0]);
  // A panel re-used with other types must not stay on one it no longer has.
  const type = types.includes(chosenType) ? chosenType : types[0];
  const [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  const words = PET_OPTION_TYPE_WORDS[type];
  const firstLoad = loading && options.length === 0;

  const pills = types.map((value) => ({
    value,
    label: PET_OPTION_TYPE_WORDS[value].title,
    // No number until there is one: "0" while loading is a claim.
    count: firstLoad
      ? undefined
      : options.filter(
          (option) => option.type === value && option.deletedAt === null,
        ).length,
  }));

  const ofType = useMemo(
    () => options.filter((option) => option.type === type).sort(byOrder),
    [options, type],
  );
  const rows = showDeleted
    ? ofType
    : ofType.filter((option) => option.deletedAt === null);
  const hiddenDeleted = ofType.length - rows.length;

  function afterWrite() {
    refetch();
    invalidatePetOptions();
  }

  return (
    <div className="flex flex-col gap-5">
      {intro}

      <div className="flex flex-col gap-2">
        {types.length > 1 && (
          <FilterPills
            ariaLabel="Jenis data hewan"
            value={type}
            options={pills}
            onChange={setType}
          />
        )}
        <p className="max-w-2xl text-sm text-muted">{words.usedBy}</p>
      </div>

      <FilterBar
        actions={
          <Can feature="petOptions" action="create">
            <Button onClick={() => setDialog({ mode: "create" })}>
              <Plus className="size-4" aria-hidden />
              {`Tambah ${words.noun}`}
            </Button>
          </Can>
        }
      >
        <FilterToggle
          label="Tampilkan yang dihapus"
          checked={showDeleted}
          onChange={setShowDeleted}
        />
      </FilterBar>

      {error && <Alert variant="error">{error}</Alert>}

      {/* A failed first load draws nothing below the Alert: "Belum ada
          ukuran" would read as a true answer about the shop's data. */}
      {firstLoad ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat data hewan…
        </div>
      ) : error && options.length === 0 ? null : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="font-semibold text-foreground">Belum ada {words.noun}.</p>
          {hiddenDeleted > 0 && (
            <p className="mt-1 text-sm text-muted">
              {hiddenDeleted} {words.noun} yang dihapus disembunyikan — nyalakan
              Tampilkan yang dihapus untuk memulihkannya.
            </p>
          )}
          {can("petOptions", "create") && (
            <Button
              variant="ghost"
              className="mt-2"
              onClick={() => setDialog({ mode: "create" })}
            >
              Tambah yang pertama →
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Keyed by type so a refusal shown on one list does not follow the
              reader onto the next. */}
          <PetOptionsTable
            key={type}
            type={type}
            rows={rows}
            /* A breed's animal, named from this same load. */
            speciesLabel={(code) =>
              options.find(
                (option) => option.type === "species" && option.code === code,
              )?.label ?? null
            }
            loading={loading}
            onRename={(option) => setDialog({ mode: "rename", option })}
            onChanged={afterWrite}
          />
          <p className="max-w-2xl text-sm text-muted">
            <b className="font-semibold text-foreground">Nonaktifkan</b> kalau
            sudah tidak mau ditawarkan: tidak muncul lagi di pilihan baru, tapi
            hewan dan layanan yang sudah memakainya tetap.{" "}
            <b className="font-semibold text-foreground">Hapus</b> hanya bisa
            selama belum dipakai sama sekali.
          </p>
        </>
      )}

      {dialog && (
        <PetOptionFormDialog
          key={dialog.mode === "rename" ? dialog.option._id : `create-${type}`}
          type={dialog.mode === "rename" ? dialog.option.type : type}
          /* The tenant's animals, from the list this panel already holds. */
          speciesChoices={options
            .filter(
              (option) =>
                option.type === "species" &&
                option.deletedAt === null &&
                (option.isActive ||
                  option.code ===
                    (dialog.mode === "rename" ? dialog.option.speciesCode : null)),
            )
            .sort(byOrder)
            .map((option) => ({
              value: option.code,
              label: option.isActive ? option.label : `${option.label} (nonaktif)`,
            }))}
          option={dialog.mode === "rename" ? dialog.option : undefined}
          onClose={() => setDialog(null)}
          onSaved={afterWrite}
        />
      )}
    </div>
  );
}
