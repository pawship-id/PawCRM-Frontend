"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Card, Spinner, TextField, ConfirmDialog } from "@/components";
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
import type { Branch } from "@/types/api";

import { BranchStatusBadge } from "./BranchStatusBadge";

/**
 * Edit an existing branch. Mirrors UserEditForm but with the smaller surface the
 * branch API exposes: the details (name, address, phone, active) go through a
 * single PATCH /branches/:id, and the soft-delete lifecycle (delete / restore)
 * lives in its own danger-zone Card. There is no password/status/unlock split
 * here — `isActive` is an ordinary detail field, edited inline as a toggle.
 *
 * It fetches the branch on mount, then hands it to each section. Sections lift
 * their result back via `onUpdated` so the header badge and siblings stay in
 * sync without a refetch.
 */
export function BranchEditForm({ id }: { id: string }) {
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    branchService
      .getById(id)
      .then((result) => {
        if (active) setBranch(result);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Could not load this branch.",
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
          <h1 className="text-2xl font-semibold text-foreground">Edit Branch</h1>
          {branch && (
            <BranchStatusBadge
              isActive={branch.isActive}
              deleted={branch.deletedAt !== null}
            />
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          {branch
            ? `Update ${branch.name}'s details and availability.`
            : "Update this branch's details and availability."}
        </p>
      </div>

      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : !branch ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Spinner /> Loading form edit branch...
        </div>
      ) : (
        <>
          <Card
            title="Details"
            description="Name, contact and availability."
          >
            <DetailsSection branch={branch} onUpdated={setBranch} />
          </Card>

          <Card
            title="Danger zone"
            description="Remove this branch or restore a removed one."
          >
            <DangerSection branch={branch} onUpdated={setBranch} />
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DetailsSection({
  branch,
  onUpdated,
}: {
  branch: Branch;
  onUpdated: (branch: Branch) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(branch.name);
  const [address, setAddress] = useState(branch.address ?? "");
  const [phone, setPhone] = useState(branch.phone ?? "");
  const [isActive, setIsActive] = useState(branch.isActive);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const disabled = branch.deletedAt !== null;

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
      const updated = await branchService.update(branch._id, {
        name: name.trim(),
        address: address.trim() === "" ? null : address.trim(),
        phone: phone.trim() === "" ? null : phone.trim(),
        isActive,
      });
      onUpdated(updated);
      swalToast("Branch updated.");
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
          This branch is deleted. Restore it in the danger zone to edit.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Row 1: name & phone */}
        <TextField
          label="Branch name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          disabled={disabled}
          required
        />
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
      </div>

      <div className="flex items-center gap-2.5">
        <Checkbox
          id="branch-active"
          checked={isActive}
          disabled={disabled}
          onCheckedChange={(checked) => setIsActive(checked === true)}
        />
        <Label htmlFor="branch-active" className="font-normal">
          Active — this branch is open and available for use
        </Label>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/master/branches")}
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
  branch,
  onUpdated,
}: {
  branch: Branch;
  onUpdated: (branch: Branch) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<DangerAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleted = branch.deletedAt !== null;

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
        await branchService.remove(branch._id);
        router.push("/dashboard/master/branches");
        swalToast("Branch deleted.");
        return;
      }
      const updated = await branchService.restore(branch._id);
      onUpdated(updated);
      setPending(null);
      swalToast("Branch restored.");
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
      {deleted ? (
        <Button variant="secondary" onClick={() => setPending("restore")}>
          Restore branch
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="bg-danger text-danger-foreground hover:bg-danger/90"
          onClick={() => setPending("delete")}
        >
          Delete branch
        </Button>
      )}

      {pending && (
        <ConfirmDialog
          title={pending === "delete" ? "Delete branch" : "Restore branch"}
          confirmLabel={pending === "delete" ? "Delete" : "Restore"}
          destructive={pending === "delete"}
          busy={busy}
          error={error}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending === "delete" ? (
            <>
              Delete <strong>{branch.name}</strong>? It will be hidden from the
              list and its name freed for reuse. You can restore it later.
            </>
          ) : (
            <>
              Restore <strong>{branch.name}</strong>? This may fail if its name
              has since been taken by another branch.
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
