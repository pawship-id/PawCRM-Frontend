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
} from "@/components";
import { ApiError } from "@/services/api-error";
import { roleService } from "@/services/role.service";
import { swalToast } from "@/lib/swal";
import { validateRoleName, validateRoleDescription } from "@/utils/validation";
import type { Role, PermissionGrant } from "@/types/api";

import { usePermissionCatalog } from "../hooks/usePermissionCatalog";
import { PermissionsField } from "./PermissionsField";
import { RoleStatusBadge } from "./RoleStatusBadge";
import {
  grantsToSelection,
  selectionToGrants,
  type PermissionSelection,
} from "../permissions";

/** Every action of every catalog feature — the "full access" a super admin has. */
function allSelection(catalog: PermissionGrant[]): PermissionSelection {
  return Object.fromEntries(catalog.map((f) => [f.feature, [...f.actions]]));
}

/**
 * Edit an existing role. One component orchestrates the concerns the backend
 * exposes: details+permissions (PATCH /roles/:id) and the delete/restore
 * lifecycle, each in its own Card, mirroring UserEditForm.
 *
 * It fetches the role (and the permission catalog) on mount, then hands the
 * loaded role to each section. Sections lift their result back via `onUpdated`
 * so the shared header badge stays in sync without a refetch.
 */
export function RoleEditForm({ id }: { id: string }) {
  const [role, setRole] = useState<Role | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const {
    features: catalog,
    loading: catalogLoading,
    error: catalogError,
  } = usePermissionCatalog();

  useEffect(() => {
    let active = true;
    roleService
      .getById(id)
      .then((result) => {
        if (active) setRole(result);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError ? error.message : "Could not load this role.",
        );
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Edit Role</h1>
          {role && <RoleStatusBadge role={role} />}
        </div>
        <p className="mt-1 text-sm text-muted">
          {role
            ? `Update ${role.name}'s details and permissions.`
            : "Update this role's details and permissions."}
        </p>
      </div>

      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : !role || catalogLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Spinner /> Loading form edit role...
        </div>
      ) : (
        <>
          <Card
            title="Details"
            description="Name, description and the permissions this role grants."
          >
            {catalogError && (
              <Alert variant="error" className="mb-4">
                {catalogError}
              </Alert>
            )}
            <DetailsSection role={role} catalog={catalog} onUpdated={setRole} />
          </Card>

          <Card
            title="Danger zone"
            description="Account-lifecycle actions for this role."
          >
            <DangerSection role={role} onUpdated={setRole} />
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DetailsSection({
  role,
  catalog,
  onUpdated,
}: {
  role: Role;
  catalog: PermissionGrant[];
  onUpdated: (role: Role) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [selection, setSelection] = useState<PermissionSelection>(
    role.isSuperAdmin
      ? allSelection(catalog)
      : grantsToSelection(role.permissions),
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // A deleted role is read-only until restored; a super admin's access is
  // unconditional, so its permission matrix is shown but not editable.
  const disabled = role.deletedAt != null;
  const permissionsDisabled = disabled || Boolean(role.isSuperAdmin);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string> = {};
    const nameError = validateRoleName(name);
    const descriptionError = validateRoleDescription(description);
    if (nameError) nextErrors.name = nameError;
    if (descriptionError) nextErrors.description = descriptionError;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const updated = await roleService.update(role._id, {
        name: name.trim(),
        description: description.trim() === "" ? null : description.trim(),
        // A super admin's grants are not editable here; leave them untouched.
        ...(role.isSuperAdmin
          ? {}
          : { permissions: selectionToGrants(selection) }),
      });
      onUpdated(updated);
      swalToast("Role updated.");
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
          This role is deleted. Restore it in the danger zone to edit.
        </Alert>
      )}
      {role.isSuperAdmin && !disabled && (
        <Alert variant="info">
          This is a super-admin role — its holders bypass every permission check,
          so its permissions cannot be narrowed.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Role name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          disabled={disabled}
          required
        />
        <TextField
          label="Description"
          name="description"
          placeholder="Optional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={fieldErrors.description}
          hint="Leave blank to remove."
          disabled={disabled}
        />
      </div>

      <PermissionsField
        catalog={catalog}
        selection={selection}
        onChange={setSelection}
        disabled={permissionsDisabled}
        error={fieldErrors.permissions}
      />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/master/roles")}
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
  role,
  onUpdated,
}: {
  role: Role;
  onUpdated: (role: Role) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<DangerAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleted = role.deletedAt != null;

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
        await roleService.remove(role._id);
        router.push("/dashboard/master/roles");
        swalToast("Role deleted.");
        return;
      }
      const restored = await roleService.restore(role._id);
      onUpdated(restored);
      setPending(null);
      swalToast("Role restored.");
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

  // A system role cannot be deleted (the backend returns 403), so the UI does
  // not offer the action and there is nothing to do while it is live.
  if (role.isSystem && !deleted) {
    return (
      <p className="text-sm text-muted">
        System roles are part of the baseline and cannot be deleted.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {deleted ? (
        <Button variant="secondary" onClick={() => setPending("restore")}>
          Restore role
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="bg-danger text-danger-foreground hover:bg-danger/90"
          onClick={() => setPending("delete")}
        >
          Delete role
        </Button>
      )}

      {pending && (
        <ConfirmDialog
          title={pending === "delete" ? "Delete role" : "Restore role"}
          confirmLabel={pending === "delete" ? "Delete" : "Restore"}
          destructive={pending === "delete"}
          busy={busy}
          error={error}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending === "delete" ? (
            <>
              Delete <strong>{role.name}</strong>? It will be hidden and can be
              restored later. A role still assigned to a user cannot be deleted.
            </>
          ) : (
            <>
              Restore <strong>{role.name}</strong>? This may fail if another role
              has since taken its name.
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
