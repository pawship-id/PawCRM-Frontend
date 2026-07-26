"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, TextField } from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { swalToast } from "@/lib/swal";
import {
  validateBranchName,
  validateAddress,
  validatePhone,
} from "@/utils/validation";

/**
 * Create a branch via POST /branches, then return to the list.
 *
 * Follows the app's hand-rolled form pattern (see UserCreateForm): local state,
 * client validation as a UX nicety, and ApiError.fieldErrors mapped onto the
 * matching inputs so backend validation (duplicate name, bad phone) surfaces
 * inline. `isActive` is an ordinary field on the branch, so it is a plain toggle
 * here rather than a separate step; it defaults to active.
 */
export function BranchCreateForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string> = {};
    const nameError = validateBranchName(name);
    const addressError = validateAddress(address);
    const phoneError = validatePhone(phone);
    if (nameError) nextErrors.name = nameError;
    if (addressError) nextErrors.address = addressError;
    if (phoneError) nextErrors.phone = phoneError;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const created = await branchService.create({
        name: name.trim(),
        address: address.trim() === "" ? null : address.trim(),
        phone: phone.trim() === "" ? null : phone.trim(),
        isActive,
      });
      // Redirect first, then fire the toast so it rides along on the list screen.
      router.push("/dashboard/master/branches");
      swalToast(`${created.name} has been created.`);
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Row 1: name & phone */}
        <TextField
          label="Branch name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          required
        />
        <TextField
          label="Phone"
          type="tel"
          name="phone"
          autoComplete="tel"
          placeholder="Optional"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={fieldErrors.phone}
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
      </div>

      <div className="flex items-center gap-2.5">
        <Checkbox
          id="branch-active"
          checked={isActive}
          onCheckedChange={(checked) => setIsActive(checked === true)}
        />
        <Label htmlFor="branch-active" className="font-normal">
          Active — this branch is open and available for use
        </Label>
      </div>

      {/* Stacks on small screens (Create on top, Cancel below); row on sm+. */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/master/branches")}
        >
          Cancel
        </Button>
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Create branch
        </Button>
      </div>
    </form>
  );
}
