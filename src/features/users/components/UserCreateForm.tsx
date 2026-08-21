"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Spinner, TextField } from "@/components";
import { ApiError } from "@/services/api-error";
import { userService } from "@/services/user.service";
import { swalToast } from "@/lib/swal";
import {
  validateEmail,
  validateFullName,
  validatePhone,
  validateWarehouseScope,
  validatePassword,
  validateConfirmPassword,
  PASSWORD_MIN_LENGTH,
} from "@/utils/validation";

import type { WarehouseScopeEntry } from "@/types/api";

import { useLookups } from "../hooks/useLookups";
import { RoleSelect } from "./RoleSelect";
import { BranchScopeField } from "./BranchScopeField";

/**
 * Create a staff user via POST /users, then return to the list.
 *
 * Follows the app's hand-rolled form pattern (see ProfileForm): local state,
 * client validation as a UX nicety, and ApiError.fieldErrors mapped onto the
 * matching inputs so backend validation (duplicate email, unknown branch, ...)
 * surfaces inline. The branch scope is validated client-side to match the
 * backend rule — all branches, or at least one specific branch.
 */
export function UserCreateForm() {
  const router = useRouter();
  const {
    roles,
    branches,
    warehouses,
    loading: lookupsLoading,
    error: lookupsError,
  } = useLookups();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [roleId, setRoleId] = useState("");
  const [allBranches, setAllBranches] = useState(false);
  const [branchAccess, setBranchAccess] = useState<string[]>([]);
  const [warehouseAccess, setWarehouseAccess] = useState<WarehouseScopeEntry[]>(
    [],
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Keyed by branch id, so the message lands under the branch it belongs to.
  const [warehouseErrors, setWarehouseErrors] = useState<
    Record<string, string>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string> = {};
    const nameError = validateFullName(fullName);
    const emailError = validateEmail(email);
    const phoneError = validatePhone(phone);
    const passwordError = validatePassword(password);
    const confirmError = validateConfirmPassword(password, confirm);
    if (nameError) nextErrors.fullName = nameError;
    if (emailError) nextErrors.email = emailError;
    if (phoneError) nextErrors.phone = phoneError;
    if (passwordError) nextErrors.password = passwordError;
    if (confirmError) nextErrors.confirm = confirmError;
    if (!allBranches && branchAccess.length === 0)
      nextErrors.branchAccess = "Select all branches or at least one branch";

    // Only meaningful under specific branches: "all branches" carries no rows.
    const nextWarehouseErrors = allBranches
      ? {}
      : validateWarehouseScope(branchAccess, warehouseAccess);

    setFieldErrors(nextErrors);
    setWarehouseErrors(nextWarehouseErrors);
    if (
      Object.keys(nextErrors).length > 0 ||
      Object.keys(nextWarehouseErrors).length > 0
    )
      return;

    setSaving(true);
    try {
      const created = await userService.create({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        phone: phone.trim() === "" ? null : phone.trim(),
        roleId: roleId || null,
        allBranches,
        branchAccess: allBranches ? [] : branchAccess,
        // Every branch already implies every warehouse, so the rows go with it.
        // The backend drops rows for branches not granted, but sending only the
        // granted ones keeps the payload saying what the form shows.
        warehouseAccess: allBranches
          ? []
          : warehouseAccess.filter((entry) =>
              branchAccess.includes(entry.branchId),
            ),
      });
      // Redirect first, then fire the toast so it rides along on the list screen.
      router.push("/dashboard/master/users");
      swalToast(`${created.fullName} has been created.`);
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

  if (lookupsLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
        <Spinner /> Loading form create user...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}
      {lookupsError && <Alert variant="error">{lookupsError}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Row 1: full name & email */}
        <TextField
          label="Full name"
          name="fullName"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={fieldErrors.fullName}
          required
        />
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
        />

        {/* Row 2: password & confirm password */}
        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          required
        />
        <TextField
          label="Confirm password"
          type="password"
          name="confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fieldErrors.confirm}
          required
        />

        {/* Row 3: phone & role */}
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
        <RoleSelect
          roles={roles}
          value={roleId}
          onChange={setRoleId}
          error={fieldErrors.roleId}
        />

        {/* Row 4: branch (full width) */}
        <div className="sm:col-span-2">
          <BranchScopeField
            branches={branches}
            warehouses={warehouses}
            allBranches={allBranches}
            branchAccess={branchAccess}
            warehouseAccess={warehouseAccess}
            onChange={(next) => {
              setAllBranches(next.allBranches);
              setBranchAccess(next.branchAccess);
              setWarehouseAccess(next.warehouseAccess);
            }}
            error={fieldErrors.branchAccess}
            warehouseError={warehouseErrors}
          />
        </div>
      </div>

      {/* Stacks on small screens (Create on top, Cancel below); row on sm+. */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/master/users")}
        >
          Cancel
        </Button>
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Create user
        </Button>
      </div>
    </form>
  );
}
