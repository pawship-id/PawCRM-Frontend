"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Card, Spinner, TextField, ConfirmDialog } from "@/components";
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
import type { User, WarehouseScopeEntry } from "@/types/api";

import { useLookups } from "../hooks/useLookups";
import { RoleSelect } from "./RoleSelect";
import { RosterSection } from "./RosterSection";
import { BranchScopeField } from "./BranchScopeField";
import { StatusBadge } from "./StatusBadge";

function isLocked(user: User): boolean {
  if (!user.lockedUntil) return false;
  const until = new Date(user.lockedUntil).getTime();
  return !Number.isNaN(until) && until > Date.now();
}

/**
 * Edit an existing staff user. One component orchestrates the four concerns the
 * backend exposes as separate endpoints, each in its own Card:
 *   - details  -> PATCH /users/:id            (DetailsSection)
 *   - status   -> PATCH /users/:id/status     (StatusSection)
 *   - password -> PATCH /users/:id/password   (PasswordSection)
 *   - lifecycle-> delete / restore / unlock   (DangerSection)
 *
 * It fetches the user (and the role/branch lookups) on mount, then hands the
 * loaded user to each section. Sections lift their result back via `onUpdated`
 * so the shared header badge and sibling sections stay in sync without a
 * refetch. Each section is a self-contained hand-rolled form (the ProfileForm
 * pattern): local state, client validation, ApiError.fieldErrors mapping.
 */
export function UserEditForm({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const {
    roles,
    branches,
    warehouses,
    loading: lookupsLoading,
    error: lookupsError,
  } = useLookups();

  useEffect(() => {
    let active = true;
    userService
      .getById(id)
      .then((result) => {
        if (active) setUser(result);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError ? error.message : "Could not load this user.",
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
          <h1 className="text-2xl font-extrabold text-foreground">Edit User</h1>
          {user && (
            <StatusBadge
              status={user.status}
              deleted={user.deletedAt !== null}
            />
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          {user
            ? `Update ${user.fullName}'s details, status, password and account access.`
            : "Update this staff member's details, status, password and account access."}
        </p>
      </div>

      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : !user || lookupsLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Spinner /> Loading form edit user...
        </div>
      ) : (
        <>
          <Card
            title="Details"
            description="Name, contact, role and branch access."
          >
            {lookupsError && (
              <Alert variant="error" className="mb-4">
                {lookupsError}
              </Alert>
            )}
            <DetailsSection
              user={user}
              roles={roles}
              branches={branches}
              warehouses={warehouses}
              onUpdated={setUser}
            />
          </Card>

          {/*
            THE ROSTER AND THE RATE — FR-4 and FR-6.

            Both have been storable since this module shipped and neither had a
            screen. The roster decides who may be booked; the rate decides what
            they earn. Until this Card existed the only way to set either was to
            call the API by hand.

            ABOVE Password on purpose: it is the one somebody opens this page to
            change on an ordinary day.
          */}
          <Card
            title="Jadwal & Komisi"
            description="Hari libur, cuti, dan cara komisinya dihitung."
          >
            <RosterSection user={user} onUpdated={setUser} />
          </Card>

          <Card
            title="Password"
            description="Set a new password for this user."
          >
            <PasswordSection userId={user._id} />
          </Card>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Card
              title="Status"
              description="Activate or suspend sign-in access."
            >
              <StatusSection user={user} onUpdated={setUser} />
            </Card>

            <Card
              title="Danger zone"
              description="Irreversible or account-lifecycle actions."
            >
              <DangerSection user={user} onUpdated={setUser} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DetailsSection({
  user,
  roles,
  branches,
  warehouses,
  onUpdated,
}: {
  user: User;
  roles: ReturnType<typeof useLookups>["roles"];
  branches: ReturnType<typeof useLookups>["branches"];
  warehouses: ReturnType<typeof useLookups>["warehouses"];
  onUpdated: (user: User) => void;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [roleId, setRoleId] = useState(user.roleId ?? "");
  const [allBranches, setAllBranches] = useState(user.allBranches);
  const [branchAccess, setBranchAccess] = useState<string[]>(user.branchAccess);
  // `?? []` because a user stored before this field existed comes back without
  // it; the picker then shows every granted branch at "all warehouses", which
  // is exactly the access that user has today.
  const [warehouseAccess, setWarehouseAccess] = useState<WarehouseScopeEntry[]>(
    user.warehouseAccess ?? [],
  );

  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Keyed by branch id, so the message lands under the branch it belongs to.
  const [warehouseErrors, setWarehouseErrors] = useState<
    Record<string, string>
  >({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const disabled = user.deletedAt !== null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string> = {};
    const nameError = validateFullName(fullName);
    const emailError = validateEmail(email);
    const phoneError = validatePhone(phone);
    if (nameError) nextErrors.fullName = nameError;
    if (emailError) nextErrors.email = emailError;
    if (phoneError) nextErrors.phone = phoneError;
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
      const updated = await userService.update(user._id, {
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() === "" ? null : phone.trim(),
        roleId: roleId || null,
        allBranches,
        branchAccess: allBranches ? [] : branchAccess,
        // Sent on every save, not only when it changed: the backend recomputes
        // the whole scope whenever any part of it arrives, and omitting the
        // rows would have it fall back to the stored ones.
        warehouseAccess: allBranches
          ? []
          : warehouseAccess.filter((entry) =>
              branchAccess.includes(entry.branchId),
            ),
      });
      onUpdated(updated);
      swalToast("User updated.");
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        setFormError(error.message);
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
          This user is deleted. Restore them in the danger zone to edit.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Row 1: full name & email */}
        <TextField
          label="Full name"
          name="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={fieldErrors.fullName}
          disabled={disabled}
          required
        />
        <TextField
          label="Email"
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={disabled}
          required
        />

        {/* Row 2: phone & role */}
        <TextField
          label="Phone"
          type="tel"
          name="phone"
          placeholder="Optional"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={fieldErrors.phone}
          hint="Leave blank to remove."
          disabled={disabled}
        />
        <RoleSelect
          roles={roles}
          value={roleId}
          onChange={(value) => setRoleId(value)}
          error={fieldErrors.roleId}
          disabled={disabled}
        />

        {/* Row 3: branch (full width) */}
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
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/master/users")}
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

function StatusSection({
  user,
  onUpdated,
}: {
  user: User;
  onUpdated: (user: User) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextStatus = user.status === "active" ? "suspended" : "active";
  const disabled = user.deletedAt !== null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const updated = await userService.setStatus(user._id, nextStatus);
      onUpdated(updated);
      swalToast(
        nextStatus === "suspended" ? "User suspended." : "User activated.",
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not change status.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          This user is currently{" "}
          <strong className="text-foreground">
            {user.status === "active" ? "active" : "suspended"}
          </strong>
          .
        </p>
        <Button
          variant="secondary"
          loading={busy}
          disabled={disabled}
          onClick={toggle}
        >
          {nextStatus === "suspended" ? "Suspend" : "Activate"}
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PasswordSection({ userId }: { userId: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string> = {};
    const passwordError = validatePassword(password);
    const confirmError = validateConfirmPassword(password, confirm);
    if (passwordError) nextErrors.newPassword = passwordError;
    if (confirmError) nextErrors.confirm = confirmError;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await userService.changePassword(userId, password);
      setPassword("");
      setConfirm("");
      swalToast("Password updated.");
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        setFormError(error.message);
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="New password"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.newPassword}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          required
        />
        <TextField
          label="Confirm new password"
          type="password"
          name="confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fieldErrors.confirm}
          required
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Set password
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

type DangerAction = "delete" | "restore" | "unlock" | null;

function DangerSection({
  user,
  onUpdated,
}: {
  user: User;
  onUpdated: (user: User) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<DangerAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleted = user.deletedAt !== null;
  const locked = isLocked(user);

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
        await userService.remove(user._id);
        router.push("/dashboard/master/users");
        swalToast("User deleted.");
        return;
      }
      const updated =
        pending === "restore"
          ? await userService.restore(user._id)
          : await userService.unlock(user._id);
      onUpdated(updated);
      setPending(null);
      swalToast(pending === "restore" ? "User restored." : "User unlocked.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {locked && !deleted && (
        <Button variant="secondary" onClick={() => setPending("unlock")}>
          Unlock account
        </Button>
      )}
      {deleted ? (
        <Button variant="secondary" onClick={() => setPending("restore")}>
          Restore user
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="bg-danger text-danger-foreground hover:bg-danger/90"
          onClick={() => setPending("delete")}
        >
          Delete user
        </Button>
      )}

      {pending && (
        <ConfirmDialog
          title={
            pending === "delete"
              ? "Delete user"
              : pending === "restore"
                ? "Restore user"
                : "Unlock user"
          }
          confirmLabel={
            pending === "delete"
              ? "Delete"
              : pending === "restore"
                ? "Restore"
                : "Unlock"
          }
          destructive={pending === "delete"}
          busy={busy}
          error={error}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending === "delete" ? (
            <>
              Delete <strong>{user.fullName}</strong>? Their account will be
              deactivated and hidden. You can restore it later.
            </>
          ) : pending === "restore" ? (
            <>
              Restore <strong>{user.fullName}</strong>? This may fail if their
              email address has since been reused.
            </>
          ) : (
            <>
              Clear the login lockout for <strong>{user.fullName}</strong>?
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
