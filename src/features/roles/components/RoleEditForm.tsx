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
import type { Role, PermissionGrant, PermissionModule } from "@/types/api";

import { usePermissionCatalog } from "../hooks/usePermissionCatalog";
import { PermissionsField } from "./PermissionsField";
import { PermissionTree } from "./PermissionTree";
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
    modules,
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
          error instanceof ApiError ? error.message : "Peran ini tidak bisa dimuat.",
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
          <h1 className="text-2xl font-extrabold text-foreground">Ubah peran</h1>
          {role && <RoleStatusBadge role={role} />}
        </div>
        <p className="mt-1 text-sm text-muted">
          {role
            ? `Ubah nama, keterangan, dan hak akses ${role.name}.`
            : "Ubah nama, keterangan, dan hak akses peran ini."}
        </p>
      </div>

      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : !role || catalogLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Spinner /> Memuat formulir…
        </div>
      ) : (
        <>
          <Card
            title="Detail"
            description="Nama, keterangan, dan hak akses yang diberikan peran ini."
          >
            {catalogError && (
              <Alert variant="error" className="mb-4">
                {catalogError}
              </Alert>
            )}
            <DetailsSection
              role={role}
              catalog={catalog}
              modules={modules}
              onUpdated={setRole}
            />
          </Card>

          <Card
            title="Hapus atau pulihkan"
            description="Peran yang dihapus disembunyikan dan bisa dipulihkan lagi."
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
  modules,
  onUpdated,
}: {
  role: Role;
  catalog: PermissionGrant[];
  modules: PermissionModule[];
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
      swalToast("Peran tersimpan.");
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError("Terjadi kesalahan. Coba lagi.");
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
          label="Nama peran"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          disabled={disabled}
          required
        />
        <TextField
          label="Keterangan"
          name="description"
          placeholder="Opsional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={fieldErrors.description}
          hint="Kosongkan untuk menghapus keterangan."
          disabled={disabled}
        />
      </div>

      {modules.length > 0 ? (
        <PermissionTree
          modules={modules}
          selection={selection}
          onChange={setSelection}
          disabled={permissionsDisabled}
          error={fieldErrors.permissions}
        />
      ) : (
        <PermissionsField
          catalog={catalog}
          selection={selection}
          onChange={setSelection}
          disabled={permissionsDisabled}
          error={fieldErrors.permissions}
        />
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/settings/roles")}
        >
          Batal
        </Button>
        <Button
          type="submit"
          loading={saving}
          disabled={disabled}
          className="w-full sm:w-auto"
        >
          Simpan peran
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
        router.push("/dashboard/settings/roles");
        swalToast("Peran dihapus.");
        return;
      }
      const restored = await roleService.restore(role._id);
      onUpdated(restored);
      setPending(null);
      swalToast("Peran dipulihkan.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Terjadi kesalahan. Coba lagi.",
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
        Peran bawaan sistem tidak bisa dihapus.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {deleted ? (
        <Button variant="secondary" onClick={() => setPending("restore")}>
          Pulihkan peran
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="bg-danger text-danger-foreground hover:bg-danger/90"
          onClick={() => setPending("delete")}
        >
          Hapus peran
        </Button>
      )}

      {pending && (
        <ConfirmDialog
          title={pending === "delete" ? "Hapus peran" : "Pulihkan peran"}
          confirmLabel={pending === "delete" ? "Hapus" : "Pulihkan"}
          destructive={pending === "delete"}
          busy={busy}
          error={error}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending === "delete" ? (
            <>
              Hapus <strong>{role.name}</strong>? Peran akan disembunyikan dan
              bisa dipulihkan nanti. Peran yang masih dipakai pengguna tidak
              bisa dihapus.
            </>
          ) : (
            <>
              Pulihkan <strong>{role.name}</strong>? Bisa gagal kalau namanya
              sudah dipakai peran lain.
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
