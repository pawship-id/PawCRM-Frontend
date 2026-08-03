"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, TextField } from "@/components";
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

import { useWarehouseBranches } from "../hooks/useWarehouseBranches";
import { WarehouseBranchSelect } from "./WarehouseBranchSelect";

/**
 * Create a warehouse via POST /warehouses, then return to the list.
 *
 * Follows the app's hand-rolled form pattern (see BranchCreateForm): local
 * state, client validation as a UX nicety, and ApiError.fieldErrors mapped onto
 * the matching inputs so backend validation (duplicate name, bad phone)
 * surfaces inline. Only the name is required — a tenant may register its
 * locations before it has the address or PIC to hand.
 *
 * `isDefault` is not on this form and never will be: it is server-owned, set
 * only when a branch auto-provisions its stock location.
 */
export function WarehouseCreateForm() {
  const router = useRouter();
  const { branches, error: branchError } = useWarehouseBranches();

  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [picName, setPicName] = useState("");
  const [picPhone, setPicPhone] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string> = {};
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
      const created = await warehouseService.create({
        name: name.trim(),
        defaultBranchId: branchId,
        address: address.trim() === "" ? null : address.trim(),
        picName: picName.trim() === "" ? null : picName.trim(),
        picPhone: picPhone.trim() === "" ? null : picPhone.trim(),
        isActive,
      });
      // Redirect first, then fire the toast so it rides along on the list screen.
      router.push("/dashboard/master/warehouses");
      swalToast(`${created.name} has been created.`);
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        setFormError(error.fullMessage);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}
      {branchError && <Alert variant="info">{branchError}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Row 1: name & branch */}
        <TextField
          label="Warehouse name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          required
        />
        <WarehouseBranchSelect
          value={branchId}
          branches={branches}
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
          />
        </div>

        {/* Row 3: the person accountable for stock here */}
        <TextField
          label="PIC name"
          name="picName"
          placeholder="Optional"
          value={picName}
          onChange={(e) => setPicName(e.target.value)}
          error={fieldErrors.picName}
          hint="Who a stock discrepancy is raised with."
        />
        <TextField
          label="PIC phone"
          type="tel"
          name="picPhone"
          autoComplete="tel"
          placeholder="Optional"
          value={picPhone}
          onChange={(e) => setPicPhone(e.target.value)}
          error={fieldErrors.picPhone}
        />
      </div>

      <div className="flex items-center gap-2.5">
        <Checkbox
          id="warehouse-active"
          checked={isActive}
          onCheckedChange={(checked) => setIsActive(checked === true)}
        />
        <Label htmlFor="warehouse-active" className="font-normal">
          Active — this warehouse accepts stock movement
        </Label>
      </div>

      {/* Stacks on small screens (Create on top, Cancel below); row on sm+. */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/master/warehouses")}
        >
          Cancel
        </Button>
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Create warehouse
        </Button>
      </div>
    </form>
  );
}
