"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Button,
  Card,
  Spinner,
  TextField,
  ConfirmDialog,
  LocationFields,
  toGeoLocation,
  toLocationFieldsValue,
  validateLocationFields,
} from "@/components";
import type { LocationFieldsValue } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api-error";
import { warehouseService } from "@/services/warehouse.service";
import { swalToast } from "@/lib/swal";
import {
  validateWarehouseName,
  validateWarehouseAddress,
  validatePicName,
  validatePicPhone,
} from "@/utils/validation";
import type { Branch, Warehouse } from "@/types/api";

import { useWarehouseBranches } from "../hooks/useWarehouseBranches";
import { WarehouseStatusBadge } from "./WarehouseStatusBadge";
import { WarehouseBranchSelect } from "./WarehouseBranchSelect";

/**
 * Edit an existing warehouse. Mirrors BranchEditForm: the details (name, branch,
 * address, PIC, active) go through a single PATCH /warehouses/:id, and the
 * soft-delete lifecycle (delete / restore) lives in its own danger-zone Card.
 *
 * It fetches the warehouse on mount, then hands it to each section. Sections
 * lift their result back via `onUpdated` so the header badges and siblings stay
 * in sync without a refetch.
 */
export function WarehouseEditForm({ id }: { id: string }) {
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { branches, error: branchError } = useWarehouseBranches();

  useEffect(() => {
    let active = true;
    warehouseService
      .getById(id)
      .then((result) => {
        if (active) setWarehouse(result);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError
            ? error.fullMessage
            : "Data gudang ini tidak bisa dimuat.",
        );
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-6">
      {/* The header stays visible while the body loads. */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-foreground">
            Ubah gudang
          </h1>
          {warehouse && (
            <>
              <WarehouseStatusBadge
                isActive={warehouse.isActive}
                deleted={warehouse.deletedAt !== null}
              />
              {warehouse.isDefault && (
                <Badge
                  variant="outline"
                  className="border-transparent bg-tint-neutral text-muted"
                >
                  Bawaan cabang
                </Badge>
              )}
            </>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          {warehouse
            ? `Ubah data dan ketersediaan ${warehouse.name}.`
            : "Ubah data dan ketersediaan gudang ini."}
        </p>
      </div>

      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : !warehouse ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Spinner /> Memuat form gudang…
        </div>
      ) : (
        <>
          {branchError && <Alert variant="info">{branchError}</Alert>}

          <Card
            title="Data gudang"
            description="Nama, cabang, kontak, dan ketersediaan."
          >
            <DetailsSection
              warehouse={warehouse}
              branches={branches}
              onUpdated={setWarehouse}
            />
          </Card>

          <Card
            title="Zona berbahaya"
            description="Hapus gudang ini, atau pulihkan yang sudah dihapus."
          >
            <DangerSection warehouse={warehouse} onUpdated={setWarehouse} />
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DetailsSection({
  warehouse,
  branches,
  onUpdated,
}: {
  warehouse: Warehouse;
  branches: Branch[];
  onUpdated: (warehouse: Warehouse) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(warehouse.name);
  const [branchId, setBranchId] = useState<string | null>(
    warehouse.defaultBranchId,
  );
  const [address, setAddress] = useState(warehouse.address ?? "");
  // toLocationFieldsValue tolerates a missing pin, so a warehouse document
  // written before the field existed renders as two empty inputs, not a throw.
  const [location, setLocation] = useState<LocationFieldsValue>(() =>
    toLocationFieldsValue(warehouse.location),
  );
  const [picName, setPicName] = useState(warehouse.picName ?? "");
  const [picPhone, setPicPhone] = useState(warehouse.picPhone ?? "");
  const [isActive, setIsActive] = useState(warehouse.isActive);
  const [hasPos, setHasPos] = useState(warehouse.hasPos === true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const disabled = warehouse.deletedAt !== null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string> = {
      ...validateLocationFields(location),
    };
    const nameError = validateWarehouseName(name);
    const addressError = validateWarehouseAddress(address);
    const picNameError = validatePicName(picName);
    const picPhoneError = validatePicPhone(picPhone);
    if (nameError) nextErrors.name = nameError;
    if (addressError) nextErrors.address = addressError;
    if (picNameError) nextErrors.picName = picNameError;
    if (picPhoneError) nextErrors.picPhone = picPhoneError;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const updated = await warehouseService.update(warehouse._id, {
        name: name.trim(),
        defaultBranchId: branchId,
        address: address.trim() === "" ? null : address.trim(),
        location: toGeoLocation(location),
        picName: picName.trim() === "" ? null : picName.trim(),
        picPhone: picPhone.trim() === "" ? null : picPhone.trim(),
        isActive,
        hasPos,
      });
      onUpdated(updated);
      swalToast("Gudang tersimpan.");
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        setFormError(error.fullMessage);
      } else {
        setFormError("Ada yang tidak beres. Coba lagi, ya.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}
      {disabled && (
        <Alert variant="info">
          Gudang ini sudah dihapus. Pulihkan dulu di zona berbahaya untuk bisa
          diubah.
        </Alert>
      )}
      {warehouse.isDefault && !disabled && (
        <Alert variant="info">
          Ini gudang bawaan cabangnya. Namanya dan datanya bebas diubah, tapi
          tidak bisa dihapus — tiap cabang wajib punya satu tempat stok. Kalau
          sudah tidak dipakai, nonaktifkan saja.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Row 1: name & branch */}
        <TextField
          label="Nama gudang"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          disabled={disabled}
          required
        />
        <WarehouseBranchSelect
          value={branchId}
          branches={branches}
          disabled={disabled}
          error={fieldErrors.defaultBranchId}
          onChange={setBranchId}
        />

        {/* Row 2: address (full width) */}
        <div className="sm:col-span-2">
          <TextField
            label="Alamat"
            name="address"
            placeholder="Opsional"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={fieldErrors.address}
            hint="Kosongkan untuk menghapus isinya."
            disabled={disabled}
          />
        </div>

        {/* Row 3: the map pin */}
        <LocationFields
          value={location}
          onChange={setLocation}
          errors={fieldErrors}
          disabled={disabled}
        />

        {/* Row 4: the person accountable for stock here */}
        <TextField
          label="Nama PIC"
          name="picName"
          placeholder="Opsional"
          value={picName}
          onChange={(e) => setPicName(e.target.value)}
          error={fieldErrors.picName}
          hint="Kosongkan untuk menghapus isinya."
          disabled={disabled}
        />
        <TextField
          label="Telepon PIC"
          type="tel"
          name="picPhone"
          placeholder="Opsional"
          value={picPhone}
          onChange={(e) => setPicPhone(e.target.value)}
          error={fieldErrors.picPhone}
          hint="Kosongkan untuk menghapus isinya."
          disabled={disabled}
        />
      </div>

      <div className="flex items-center gap-2.5">
        <Checkbox
          id="warehouse-active"
          checked={isActive}
          disabled={disabled}
          onCheckedChange={(checked) => setIsActive(checked === true)}
        />
        <Label htmlFor="warehouse-active" className="font-normal">
          Aktif — gudang ini menerima mutasi stok
        </Label>
      </div>


      {/*
        IS THERE A TILL HERE? A warehouse is a place stock sits; only some are
        places a customer pays at. Nothing gates the POS on it yet — the tenant
        profile counts it, and the subscription will be priced on it — so the
        caption says what it is FOR rather than implying it closes a till.
      */}
      <div className="flex items-center gap-2.5">
        <Checkbox
          id="warehouse-pos"
          checked={hasPos}
          disabled={disabled}
          onCheckedChange={(checked) => setHasPos(checked === true)}
        />
        <Label htmlFor="warehouse-pos" className="font-normal">
          Ada kasir di gudang ini — dihitung sebagai kasir aktif di profil usaha
        </Label>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/pengaturan/gudang")}
        >
          Batal
        </Button>
        <Button
          type="submit"
          loading={saving}
          disabled={disabled}
          className="w-full sm:w-auto"
        >
          Simpan gudang
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

type DangerAction = "delete" | "restore" | null;

function DangerSection({
  warehouse,
  onUpdated,
}: {
  warehouse: Warehouse;
  onUpdated: (warehouse: Warehouse) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<DangerAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleted = warehouse.deletedAt !== null;

  function closeDialog() {
    if (busy) return;
    setPending(null);
    setError(null);
  }

  async function runAction() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending === "delete") {
        await warehouseService.remove(warehouse._id);
        router.push("/dashboard/pengaturan/gudang");
        swalToast("Gudang dihapus.");
        return;
      }
      const updated = await warehouseService.restore(warehouse._id);
      onUpdated(updated);
      setPending(null);
      swalToast("Gudang dipulihkan.");
    } catch (err) {
      setError(
        // fullMessage: the 409 guards explain themselves in the reason, and
        // "Cannot delete warehouse" alone leaves nothing to act on.
        err instanceof ApiError
          ? err.fullMessage
          : "Ada yang tidak beres. Coba lagi, ya.",
      );
    } finally {
      setBusy(false);
    }
  }

  // The default warehouse of a branch can never be deleted, so the button that
  // would only ever produce a 409 is replaced by the reason it is absent.
  if (!deleted && warehouse.isDefault) {
    return (
      <p className="text-sm text-muted">
        Gudang ini dibuat bersama cabangnya dan tidak bisa dihapus — tiap cabang
        wajib punya satu tempat stok. Kalau sudah tidak dipakai, nonaktifkan saja
        di bagian data gudang di atas.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {deleted ? (
        <Button variant="secondary" onClick={() => setPending("restore")}>
          Pulihkan gudang
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="bg-danger text-danger-foreground hover:bg-danger/90"
          onClick={() => setPending("delete")}
        >
          Hapus gudang
        </Button>
      )}

      {pending && (
        <ConfirmDialog
          title={pending === "delete" ? "Hapus gudang" : "Pulihkan gudang"}
          confirmLabel={pending === "delete" ? "Hapus" : "Pulihkan"}
          destructive={pending === "delete"}
          busy={busy}
          error={error}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending === "delete" ? (
            <>
              Hapus <strong>{warehouse.name}</strong>? Gudang ini akan hilang
              dari daftar dan namanya bisa dipakai lagi. Gudang yang masih
              menyimpan stok atau punya riwayat mutasi tidak bisa dihapus —
              nonaktifkan saja.
            </>
          ) : (
            <>
              Pulihkan <strong>{warehouse.name}</strong>? Bisa gagal kalau
              namanya sudah dipakai gudang lain.
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
