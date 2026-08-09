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
            : "Could not load this warehouse.",
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
          <h1 className="text-2xl font-semibold text-foreground">
            Edit Warehouse
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
                  className="border-transparent bg-muted/40 text-muted"
                >
                  Default
                </Badge>
              )}
            </>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          {warehouse
            ? `Update ${warehouse.name}'s details and availability.`
            : "Update this warehouse's details and availability."}
        </p>
      </div>

      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : !warehouse ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Spinner /> Loading form edit warehouse...
        </div>
      ) : (
        <>
          {branchError && <Alert variant="info">{branchError}</Alert>}

          <Card
            title="Details"
            description="Name, branch, contact and availability."
          >
            <DetailsSection
              warehouse={warehouse}
              branches={branches}
              onUpdated={setWarehouse}
            />
          </Card>

          <Card
            title="Danger zone"
            description="Remove this warehouse or restore a removed one."
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
      });
      onUpdated(updated);
      swalToast("Warehouse updated.");
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        setFormError(error.fullMessage);
      } else {
        setFormError("Something went wrong. Please try again.");
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
          This warehouse is deleted. Restore it in the danger zone to edit.
        </Alert>
      )}
      {warehouse.isDefault && !disabled && (
        <Alert variant="info">
          This is the default warehouse of its branch. It can be renamed and
          edited freely, but not deleted — every branch must keep one stock
          location. Deactivate it instead if it is out of use.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Row 1: name & branch */}
        <TextField
          label="Warehouse name"
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
            label="Address"
            name="address"
            placeholder="Optional"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={fieldErrors.address}
            hint="Leave blank to remove."
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
          label="PIC name"
          name="picName"
          placeholder="Optional"
          value={picName}
          onChange={(e) => setPicName(e.target.value)}
          error={fieldErrors.picName}
          hint="Leave blank to remove."
          disabled={disabled}
        />
        <TextField
          label="PIC phone"
          type="tel"
          name="picPhone"
          placeholder="Optional"
          value={picPhone}
          onChange={(e) => setPicPhone(e.target.value)}
          error={fieldErrors.picPhone}
          hint="Leave blank to remove."
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
          Active — this warehouse accepts stock movement
        </Label>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/master/warehouses")}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          loading={saving}
          disabled={disabled}
          className="w-full sm:w-auto"
        >
          Save changes
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
        router.push("/dashboard/master/warehouses");
        swalToast("Warehouse deleted.");
        return;
      }
      const updated = await warehouseService.restore(warehouse._id);
      onUpdated(updated);
      setPending(null);
      swalToast("Warehouse restored.");
    } catch (err) {
      setError(
        // fullMessage: the 409 guards explain themselves in the reason, and
        // "Cannot delete warehouse" alone leaves nothing to act on.
        err instanceof ApiError
          ? err.fullMessage
          : "Something went wrong. Please try again.",
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
        This warehouse was created with its branch and cannot be deleted — every
        branch must keep one stock location. Deactivate it in the details above
        if it is out of use.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {deleted ? (
        <Button variant="secondary" onClick={() => setPending("restore")}>
          Restore warehouse
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="bg-danger text-danger-foreground hover:bg-danger/90"
          onClick={() => setPending("delete")}
        >
          Delete warehouse
        </Button>
      )}

      {pending && (
        <ConfirmDialog
          title={pending === "delete" ? "Delete warehouse" : "Restore warehouse"}
          confirmLabel={pending === "delete" ? "Delete" : "Restore"}
          destructive={pending === "delete"}
          busy={busy}
          error={error}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending === "delete" ? (
            <>
              Delete <strong>{warehouse.name}</strong>? It will be hidden from
              the list and its name freed for reuse. A warehouse that still holds
              stock or has movement history cannot be deleted — deactivate it
              instead.
            </>
          ) : (
            <>
              Restore <strong>{warehouse.name}</strong>? This may fail if its
              name has since been taken by another warehouse.
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
