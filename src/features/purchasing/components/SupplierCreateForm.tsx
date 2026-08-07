"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button } from "@/components";
import { ApiError } from "@/services/api-error";
import { supplierService } from "@/services/supplier.service";
import { swalToast } from "@/lib/swal";

import {
  SupplierFormFields,
  orNull,
  validateSupplierForm,
  type SupplierFormValues,
} from "./SupplierFormFields";

const EMPTY: SupplierFormValues = {
  name: "",
  type: "beli_putus",
  pic: "",
  phone: "",
  email: "",
  address: "",
  npwp: "",
  notes: "",
  // 30 rather than 0, deliberately. The model defaults to 0 (cash on delivery)
  // because a database needs one unambiguous default; a FORM is a different
  // question — a supplier saved on 0 by accident makes every invoice due the day
  // it arrives, which reads as a cash-flow emergency that is not real. Monthly
  // terms are the ordinary case, and the hint says what 0 means for the rest.
  paymentTermDays: "30",
};

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
 */
export function SupplierCreateForm() {
  const router = useRouter();

  const [values, setValues] = useState<SupplierFormValues>(EMPTY);
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
      const created = await supplierService.create({
        name: values.name.trim(),
        type: values.type,
        pic: orNull(values.pic),
        phone: orNull(values.phone),
        email: orNull(values.email),
        address: orNull(values.address),
        // Whitespace stripped, matching what the server stores — otherwise the
        // duplicate check would compare two spellings of one tax number.
        npwp: orNull(values.npwp.replace(/\s+/g, "")),
        notes: orNull(values.notes),
        paymentTermDays: Number(values.paymentTermDays.trim()),
      });

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
