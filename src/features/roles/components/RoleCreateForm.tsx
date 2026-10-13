"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Spinner, TextField } from "@/components";
import { ApiError } from "@/services/api-error";
import { roleService } from "@/services/role.service";
import { swalToast } from "@/lib/swal";
import { validateRoleName, validateRoleDescription } from "@/utils/validation";

import { usePermissionCatalog } from "../hooks/usePermissionCatalog";
import { PermissionsField } from "./PermissionsField";
import { PermissionTree } from "./PermissionTree";
import { RoleTemplatePicker } from "./RoleTemplatePicker";
import {
  grantsToSelection,
  selectionToGrants,
  type PermissionSelection,
} from "../permissions";

/**
 * Create a role via POST /roles, then return to the list.
 *
 * Follows the app's hand-rolled form pattern (see UserCreateForm): local state,
 * client validation as a UX nicety, and ApiError.fieldErrors mapped onto the
 * matching inputs so backend validation (duplicate name, unknown grant) surfaces
 * inline. The permission catalog drives the matrix and is loaded first.
 */
export function RoleCreateForm() {
  const router = useRouter();
  const {
    features: catalog,
    modules,
    templates,
    loading: catalogLoading,
    error: catalogError,
  } = usePermissionCatalog();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selection, setSelection] = useState<PermissionSelection>({});
  // Bumped per template pick, so the tree remounts and opens what it filled.
  const [templateRun, setTemplateRun] = useState(0);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      const created = await roleService.create({
        name: name.trim(),
        description: description.trim() === "" ? null : description.trim(),
        permissions: selectionToGrants(selection),
      });
      // Redirect first, then fire the toast so it rides along on the list screen.
      router.push("/dashboard/pengaturan/peran");
      swalToast(`Peran ${created.name} tersimpan.`);
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError("Terjadi kesalahan. Coba lagi.");
      }
      setSaving(false);
    }
  }

  if (catalogLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
        <Spinner /> Memuat formulir…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}
      {catalogError && <Alert variant="error">{catalogError}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Nama peran"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          required
        />
        <TextField
          label="Keterangan"
          name="description"
          placeholder="Opsional"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={fieldErrors.description}
        />
      </div>

      {templates.length > 0 && (
        <RoleTemplatePicker
          templates={templates}
          onPick={(template) => {
            setSelection(grantsToSelection(template.permissions));
            setTemplateRun((run) => run + 1);
            // A blank name takes the template's, so "Kasir" needs one click.
            if (name.trim() === "") setName(template.label);
          }}
        />
      )}

      {modules.length > 0 ? (
        <PermissionTree
          key={templateRun}
          modules={modules}
          selection={selection}
          onChange={setSelection}
          error={fieldErrors.permissions}
        />
      ) : (
        <PermissionsField
          catalog={catalog}
          selection={selection}
          onChange={setSelection}
          error={fieldErrors.permissions}
        />
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/pengaturan/peran")}
        >
          Batal
        </Button>
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Simpan peran
        </Button>
      </div>
    </form>
  );
}
