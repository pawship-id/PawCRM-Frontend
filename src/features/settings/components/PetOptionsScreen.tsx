"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import {
  Alert,
  Breadcrumb,
  FilterBar,
  FilterPills,
  FilterToggle,
  Spinner,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import { invalidatePetOptions } from "@/hooks/usePetOptions";
import type { PetOption, PetOptionType } from "@/types/api";

import { usePetOptionList } from "../hooks/usePetOptionList";
import {
  PET_OPTION_TYPES,
  PET_OPTION_TYPE_WORDS,
  SERVICE_SETTINGS_PATH,
  byOrder,
} from "../petOptions";
import { PetOptionFormDialog } from "./PetOptionFormDialog";
import { PetOptionsTable } from "./PetOptionsTable";

/** Which dialog is open: none, add to the current list, or rename that option. */
type DialogState =
  | { mode: "create" }
  | { mode: "rename"; option: PetOption }
  | null;

/**
 * Pengaturan › Layanan › Data hewan — the tenant's own words for an animal:
 * jenis hewan, ras, ukuran, jenis bulu.
 *
 * ONE SCREEN FOR FOUR LISTS, because the server keeps them in one collection
 * told apart by `type` (14 September 2026) and every list has the same shape —
 * a name, a code, an order, retired or not. Four screens would be four copies
 * of one table. The type is the page's main lens with four values, so it is a
 * pill row with counts (§8), opening on Jenis hewan: what an animal IS comes
 * before how it is described.
 *
 * THE COUNTS ARE LIVE OPTIONS — active and retired, not deleted — whatever the
 * toggle says. A pill's number should not change because somebody asked to see
 * the bin.
 *
 * NO SEARCH, NO PAGINATION. A list is a handful of words; everything is loaded
 * once (see `usePetOptionList`) and narrowed here.
 *
 * AFTER EVERY WRITE, TWO RE-READS: this screen's list, and the app-wide store
 * behind every picker (`invalidatePetOptions`), so a size added here is in the
 * pet form without a reload.
 */
export function PetOptionsScreen() {
  const { options, loading, error, refetch } = usePetOptionList();
  const { can } = usePermissions();

  const [type, setType] = useState<PetOptionType>("species");
  const [showDeleted, setShowDeleted] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  const words = PET_OPTION_TYPE_WORDS[type];
  const firstLoad = loading && options.length === 0;

  const pills = PET_OPTION_TYPES.map((value) => ({
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
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Pengaturan" },
            { label: "Layanan", href: SERVICE_SETTINGS_PATH },
            { label: "Data hewan" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          Data hewan
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pilihan yang dipakai toko untuk mencatat hewan. Nama bisa diubah kapan
          saja — data yang sudah tercatat ikut nama barunya.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <FilterPills
          ariaLabel="Jenis data hewan"
          value={type}
          options={pills}
          onChange={setType}
        />
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
          option={dialog.mode === "rename" ? dialog.option : undefined}
          onClose={() => setDialog(null)}
          onSaved={afterWrite}
        />
      )}
    </div>
  );
}
