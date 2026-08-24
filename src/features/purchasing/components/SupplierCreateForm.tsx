"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button } from "@/components";
import { ApiError } from "@/services/api-error";
import { supplierService } from "@/services/supplier.service";
import { swalToast } from "@/lib/swal";

import {
  SupplierFormFields,
  validateSupplierForm,
  type SupplierFormValues,
} from "./SupplierFormFields";
import { emptyFormValues, toSupplierPayload } from "./supplierPayload";

/**
 * Create a supplier via POST /suppliers, then return to the list.
 *
 * Follows the app's hand-rolled form pattern (see CustomerCreateForm): local
 * state, client validation as a UX nicety, and `ApiError.fieldErrors` mapped
 * onto the matching inputs so backend refusals — a duplicate name, a duplicate
 * NPWP, a malformed tax number — surface inline rather than as a banner.
 *
 * No `isActive` control here: a vendor being created is one the tenant intends
 * to buy from, and offering "create it switched off" would be a state nobody
 * asks for. It is on the edit form, where stopping is a real decision.
 *
 * THE REFUSALS THAT CANNOT BE PREVENTED CLIENT-SIDE all arrive the same way and
 * need no special case: `ApiError.fieldErrors` is keyed by the API's own field
 * path, and this form's error keys are those paths — so `body.categoryId`,
 * `body.pic.email` and `body.bankAccounts.0.bankName` each land on the input
 * that produced them. The set is: a duplicate name, NPWP or code (409), a
 * category the server has since deleted, and a posting account of the wrong
 * type or one that has been deactivated since the picker loaded.
 */
export function SupplierCreateForm() {
  const router = useRouter();

  // A function initialiser, not a shared constant: `emptyFormValues()` returns
  // fresh nested objects, so two mounted forms cannot end up sharing one address
  // or one bank list.
  const [values, setValues] = useState<SupplierFormValues>(emptyFormValues);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function patch(next: Partial<SupplierFormValues>) {
    setValues((prev) => ({ ...prev, ...next }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors = validateSupplierForm(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const created = await supplierService.create(toSupplierPayload(values));

      // Redirect first, then the toast, so it rides along on the list screen.
      router.push("/dashboard/purchasing/suppliers");
      swalToast(`${created.name} ditambahkan.`);
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        // A 409 carries its offending field in `details` too, so try that first
        // and fall back to the banner for everything else.
        const fields = error.fieldErrors;
        if (Object.keys(fields).length > 0) setFieldErrors(fields);
        else setFormError(error.fullMessage);
      } else {
        setFormError("Terjadi kesalahan. Coba lagi.");
      }
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex w-full flex-col gap-6"
    >
      {formError && <Alert variant="error">{formError}</Alert>}

      <SupplierFormFields
        values={values}
        errors={fieldErrors}
        disabled={saving}
        onChange={patch}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan supplier"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() => router.push("/dashboard/purchasing/suppliers")}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
