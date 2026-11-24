"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Wrench, X } from "lucide-react";

import {
  Alert,
  Card,
  CheckRow,
  CheckRowGroup,
  ConfirmDialog,
  FormActionBar,
  SelectField,
  Spinner,
  TextareaField,
  TextField,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { GroomingModuleHeader } from "@/features/grooming/components/GroomingModuleHeader";
import { ChoiceCards } from "@/features/grooming/components/GroomingSettingsControls";
import { useBranchOptions } from "@/features/inventory/hooks/useBranchOptions";
import { usePermissions } from "@/features/permissions";
import { invalidateHotelRoomTypes } from "@/hooks/useHotelRoomTypes";
import { invalidateVariantOptions } from "@/hooks/useVariantOptions";
import { usePetOptions } from "@/hooks/usePetOptions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { hotelService } from "@/services/hotel.service";

import { HOTEL_LINE } from "../line";
import { HOTEL_ROOM_TYPES_PATH } from "../paths";
import {
  BLANK_ROOM_TYPE,
  parseUnitCodes,
  roomTypePayload,
  roomTypeProblem,
  seedRoomType,
  type RoomTypeDraft,
} from "../roomTypeDraft";

/**
 * One room type, new or changed (21 November 2026). A Form Entitas (§16): name,
 * branch, the animals it takes, then how it holds them — numbered units (each
 * can be marked under repair) or one zone with a capacity.
 */
export function HotelRoomTypeForm({
  roomTypeId,
}: {
  roomTypeId: string | null;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const editing = roomTypeId !== null;
  const mayWrite = can("services", editing ? "update" : "create");
  const { branches } = useBranchOptions();
  const petOptions = usePetOptions();
  const species = petOptions
    .ordered("species")
    .filter((option) => option.isActive);

  const [draft, setDraft] = useState<RoomTypeDraft>(BLANK_ROOM_TYPE);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unitText, setUnitText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomTypeId) return;
    let active = true;
    hotelService
      .getRoomType(roomTypeId)
      .then((roomType) => {
        if (active) setDraft(seedRoomType(roomType));
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(
            error instanceof ApiError
              ? error.fullMessage
              : "Tipe kamar tidak bisa dimuat.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [roomTypeId]);

  /* A new one starts on the only branch, when there is only one. */
  useEffect(() => {
    if (!editing && !draft.branchId && branches.length === 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- defaulting once the list arrives
      setDraft((current) => ({ ...current, branchId: branches[0]._id }));
    }
  }, [editing, draft.branchId, branches]);

  const change = (patch: Partial<RoomTypeDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const problem = roomTypeProblem(draft);

  function addUnits() {
    const codes = parseUnitCodes(
      unitText,
      draft.units.map((unit) => unit.code),
    );
    if (codes.length === 0) {
      swalToast(
        unitText.trim()
          ? "Nomor kamar itu sudah ada."
          : "Ketik nomor kamarnya dulu.",
        "error",
        4000,
      );
      return;
    }
    change({
      units: [
        ...draft.units,
        ...codes.map((code) => ({ code, underRepair: false })),
      ],
    });
    setUnitText("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (problem || saving || !mayWrite) return;
    setSaving(true);
    try {
      const payload = roomTypePayload(draft);
      if (roomTypeId) await hotelService.updateRoomType(roomTypeId, payload);
      else await hotelService.createRoomType(payload);
      invalidateHotelRoomTypes();
      invalidateVariantOptions();
      swalToast(`Tipe kamar ${payload.name} tersimpan.`);
      router.push(HOTEL_ROOM_TYPES_PATH);
    } catch (error) {
      swalToast(
        error instanceof ApiError
          ? (error.reason ?? error.fullMessage)
          : "Tipe kamar belum tersimpan. Coba lagi.",
        "error",
        6000,
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!roomTypeId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await hotelService.removeRoomType(roomTypeId);
      invalidateHotelRoomTypes();
      invalidateVariantOptions();
      swalToast(`Tipe kamar ${draft.name} dihapus.`);
      router.push(HOTEL_ROOM_TYPES_PATH);
    } catch (error) {
      setDeleteError(
        error instanceof ApiError
          ? (error.reason ?? error.fullMessage)
          : "Belum bisa dihapus. Coba lagi.",
      );
    } finally {
      setDeleting(false);
    }
  }

  const header = <GroomingModuleHeader line={HOTEL_LINE} />;

  if (loadError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert variant="error">{loadError}</Alert>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat tipe kamar…
        </div>
      </div>
    );
  }

  const disabled = saving || !mayWrite;

  return (
    <div className="flex flex-col gap-6">
      {header}
      <form onSubmit={submit} className="flex flex-col gap-6">
        <FormActionBar
          title={editing ? "Ubah tipe kamar" : "Tipe kamar baru"}
          submitLabel="Simpan tipe kamar"
          submitting={saving}
          disabled={Boolean(problem) || !mayWrite}
          blockedReason={!mayWrite ? "perlu izin ubah layanan" : problem}
          cancelHref={HOTEL_ROOM_TYPES_PATH}
          extra={
            editing && can("services", "delete") ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                className="text-danger hover:bg-danger/10 hover:text-danger"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                <Trash2 className="size-4" />
                Hapus
              </Button>
            ) : undefined
          }
        />

        <Card title="Informasi dasar">
          <div className="flex flex-col gap-5">
            <TextField
              label="Nama tipe kamar"
              name="name"
              value={draft.name}
              onChange={(event) => change({ name: event.target.value })}
              placeholder="Misal: Kandang Standar, Suite, Ruang Tamu"
              disabled={disabled}
              required
            />
            <SelectField
              label="Cabang"
              value={draft.branchId}
              onChange={(branchId) => branchId && change({ branchId })}
              options={branches.map((branch) => ({
                value: branch._id,
                label: branch.name,
              }))}
              placeholder="Pilih cabang"
              disabled={disabled}
              required
            />
            <div>
              <p className="text-sm font-medium">Untuk hewan</p>
              <CheckRowGroup className="mt-1">
                {species.map((option) => (
                  <CheckRow
                    key={option._id}
                    label={option.label}
                    checked={draft.petTypeIds.includes(option._id)}
                    onCheckedChange={(checked) =>
                      change({
                        petTypeIds: checked
                          ? [...draft.petTypeIds, option._id]
                          : draft.petTypeIds.filter((id) => id !== option._id),
                      })
                    }
                    disabled={disabled}
                  />
                ))}
              </CheckRowGroup>
            </div>
          </div>
        </Card>

        <Card title="Cara menampung">
          <div className="flex flex-col gap-5">
            <ChoiceCards
              legend="Cara menampung"
              value={draft.mode}
              onChange={(mode) => change({ mode })}
              options={[
                {
                  value: "numbered",
                  label: "Kamar atau kandang bernomor",
                  description:
                    "Setiap kamar punya nomor, misal A-01. Staf memilih nomor kamar saat booking.",
                },
                {
                  value: "zone",
                  label: "Zona kapasitas",
                  description:
                    "Satu area tanpa nomor, dengan batas jumlah hewan. Cocok untuk hotel rumahan.",
                },
              ]}
              disabled={disabled}
            />

            {draft.mode === "numbered" ? (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="unit-add">Nomor kamar</Label>
                  <p className="text-xs text-muted">
                    Tekan ikon kunci pas untuk menandai kamar sedang perbaikan —
                    kamar itu tidak bisa dipilih saat booking.
                  </p>
                  {draft.units.length > 0 ? (
                    <ul className="flex flex-wrap gap-2">
                      {draft.units.map((unit, index) => (
                        <li
                          key={unit._id ?? unit.code}
                          className={cn(
                            "flex items-center gap-0.5 rounded-full border py-0.5 pr-0.5 pl-2.5 text-sm font-semibold tabular-nums",
                            unit.underRepair
                              ? "border-transparent bg-tint-warning text-warning"
                              : "border-border bg-surface",
                          )}
                        >
                          {unit.code}
                          {unit.underRepair && (
                            <span className="text-xs font-normal">
                              · perbaikan
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-7 rounded-full p-0"
                            aria-label={
                              unit.underRepair
                                ? `${unit.code} bisa dipakai lagi`
                                : `Tandai ${unit.code} perbaikan`
                            }
                            aria-pressed={unit.underRepair}
                            disabled={disabled}
                            onClick={() =>
                              change({
                                units: draft.units.map((current, position) =>
                                  position === index
                                    ? {
                                        ...current,
                                        underRepair: !current.underRepair,
                                      }
                                    : current,
                                ),
                              })
                            }
                          >
                            <Wrench className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="size-7 rounded-full p-0 hover:bg-tint-danger hover:text-danger"
                            aria-label={`Hapus ${unit.code}`}
                            disabled={disabled}
                            onClick={() =>
                              change({
                                units: draft.units.filter(
                                  (_, position) => position !== index,
                                ),
                              })
                            }
                          >
                            <X className="size-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">Belum ada nomor kamar.</p>
                  )}
                  <div className="flex max-w-md gap-2">
                    <Input
                      id="unit-add"
                      value={unitText}
                      onChange={(event) => setUnitText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addUnits();
                        }
                      }}
                      placeholder="A-09, atau A-09 sampai A-12"
                      disabled={disabled}
                      className="h-11"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      onClick={addUnits}
                      disabled={disabled}
                    >
                      Tambah
                    </Button>
                  </div>
                </div>
                <TextField
                  label="Hewan per kamar"
                  name="petsPerUnit"
                  inputMode="numeric"
                  value={draft.petsPerUnit}
                  onChange={(event) =>
                    change({ petsPerUnit: event.target.value })
                  }
                  hint="Lebih dari 1 untuk kamar yang boleh diisi beberapa hewan dari pemilik yang sama."
                  disabled={disabled}
                  className="max-w-xs"
                  required
                />
              </>
            ) : (
              <>
                <TextField
                  label="Batas hewan sekaligus"
                  name="capacity"
                  inputMode="numeric"
                  value={draft.capacity}
                  onChange={(event) => change({ capacity: event.target.value })}
                  disabled={disabled}
                  className="max-w-xs"
                  required
                />
                <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
                  <div className="min-w-0">
                    <Label htmlFor="zone-closed">Zona sedang perbaikan</Label>
                    <p className="mt-1 text-xs text-muted">
                      Zona tidak bisa dipilih saat booking selama ini menyala.
                    </p>
                  </div>
                  <Switch
                    id="zone-closed"
                    checked={draft.closed}
                    onCheckedChange={(closed) => change({ closed })}
                    disabled={disabled}
                  />
                </div>
              </>
            )}
          </div>
        </Card>

        <Card title="Fasilitas & status">
          <div className="flex flex-col gap-5">
            <TextareaField
              label="Fasilitas"
              value={draft.facilities}
              onChange={(event) => change({ facilities: event.target.value })}
              hint="Yang perlu diketahui staf dan pelanggan, misal AC, CCTV, ukuran kandang."
              rows={3}
              disabled={disabled}
            />
            <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
              <div className="min-w-0">
                <Label htmlFor="room-type-active">Aktif</Label>
                <p className="mt-1 text-xs text-muted">
                  Tipe kamar nonaktif tidak bisa dipilih untuk booking baru.
                </p>
              </div>
              <Switch
                id="room-type-active"
                checked={draft.isActive}
                onCheckedChange={(isActive) => change({ isActive })}
                disabled={disabled}
              />
            </div>
          </div>
        </Card>
      </form>

      {confirmDelete && (
        <ConfirmDialog
          title="Hapus tipe kamar"
          confirmLabel="Hapus tipe kamar"
          destructive
          busy={deleting}
          error={deleteError ?? undefined}
          onConfirm={() => void remove()}
          onCancel={() => {
            setConfirmDelete(false);
            setDeleteError(null);
          }}
        >
          Hapus <strong>{draft.name}</strong>? Tidak bisa kalau masih dipakai
          layanan hotel atau masih ada booking yang belum selesai — nonaktifkan
          saja kalau begitu.
        </ConfirmDialog>
      )}
    </div>
  );
}
