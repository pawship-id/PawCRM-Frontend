"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  Button,
  LocationFields,
  TextField,
  toGeoLocation,
  validateLocationFields,
} from "@/components";
import type { LocationFieldsValue } from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { swalToast } from "@/lib/swal";
import {
  validateBranchName,
  validateBranchCode,
  BRANCH_CODE_MAX_LENGTH,
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
/*
  ERRORS GO TO A TOAST, NOT AN INLINE ALERT — a deliberate departure from
  `docs/ui-rules.md` §9, which reserves `swalToast` for "it worked".

  Asked for directly, and the reason holds: this form scrolls. A `409` on the
  branch code fires while the cursor is in a field halfway down the page, and an
  Alert pinned to the top of the form is a message the person who caused it never
  sees. A toast in the corner is where their eye already is.

  PER-FIELD ERRORS STAY UNDER THEIR FIELDS. Those say WHICH box is wrong, and a
  toast cannot point at a box. Only form-level refusals — the ones with no field
  to attach to — are toasted.

  Server refusals get a longer timer than the 3s default: they carry an
  instruction ("another branch already uses this code"), and three seconds is not
  long enough to read one and act on it.
*/
export function BranchCreateForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState<LocationFieldsValue>({
    lat: "",
    lng: "",
  });
  const [isActive, setIsActive] = useState(true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const nextErrors: Record<string, string> = {
      ...validateLocationFields(location),
    };
    const nameError = validateBranchName(name);
    const codeError = validateBranchCode(code);
    const addressError = validateAddress(address);
    const phoneError = validatePhone(phone);
    if (nameError) nextErrors.name = nameError;
    if (codeError) nextErrors.code = codeError;
    if (addressError) nextErrors.address = addressError;
    if (phoneError) nextErrors.phone = phoneError;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const created = await branchService.create({
        name: name.trim(),
        code: code.trim() === "" ? null : code.trim(),
        address: address.trim() === "" ? null : address.trim(),
        phone: phone.trim() === "" ? null : phone.trim(),
        location: toGeoLocation(location),
        isActive,
      });
      // Redirect first, then fire the toast so it rides along on the list screen.
      router.push("/dashboard/master/branches");
      swalToast(`${created.name} has been created.`);
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        // 8 seconds, not the default 3: a server refusal carries an instruction.
        swalToast(error.message, "error", 8000);
      } else {
        swalToast("Terjadi kesalahan. Coba lagi.", "error");
      }
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">

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

        {/*
          THE CODE GOES INSIDE INVOICE NUMBERS, which is why it sits beside the
          name rather than among the contact details: it is part of the branch's
          identity, not a way to reach it. Uppercased as it is typed so what is
          on screen is what will be stored — the server uppercases too, and a
          field that silently changed its value on save reads as a bug.
        */}
        <TextField
          label="Kode cabang"
          name="code"
          placeholder="mis. CBS"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          error={fieldErrors.code}
          maxLength={BRANCH_CODE_MAX_LENGTH}
          hint="Maksimal 8 karakter, huruf dan angka saja. Muncul di nomor faktur cabang ini — INV/CBS/2608/0001. Boleh dikosongkan."
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

        {/* Row 3: the map pin — two half-width fields fill the existing grid. */}
        <LocationFields
          value={location}
          onChange={setLocation}
          errors={fieldErrors}
        />
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
