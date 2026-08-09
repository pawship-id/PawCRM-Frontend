"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Card, Spinner } from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api-error";
import { supplierService } from "@/services/supplier.service";
import { swalToast } from "@/lib/swal";
import { isSupplierActive } from "@/types/api";
import type { Supplier, UpdateSupplierInput } from "@/types/api";

import { useSupplier } from "../hooks/useSupplier";
import {
  SupplierFormFields,
  orNull,
  validateSupplierForm,
  type SupplierFormValues,
} from "./SupplierFormFields";

/** The stored supplier, as the form's string-shaped state. */
function toFormValues(supplier: Supplier): SupplierFormValues {
  return {
    name: supplier.name,
    type: supplier.type,
    pic: supplier.pic ?? "",
    phone: supplier.phone ?? "",
    email: supplier.email ?? "",
    address: supplier.address ?? "",
    npwp: supplier.npwp ?? "",
    notes: supplier.notes ?? "",
    paymentTermDays: String(supplier.paymentTermDays),
  };
}

/**
 * Edit a supplier via PATCH /suppliers/:id.
 *
 * ONLY WHAT CHANGED IS SENT, which is not micro-optimisation: the backend
 * rejects an empty body, and every field it receives is re-checked for conflicts
 * — resubmitting an unchanged NPWP would make the server ask "does another
 * supplier hold this?" on every save for no reason. It also means two people
 * editing different fields do not overwrite each other's work.
 *
 * CHANGING THE TERM OR THE TYPE IS NOT RETROACTIVE, and the hint says so:
 * receipts already posted keep the terms they were posted under. Renegotiating a
 * term changes what the NEXT invoice is dated from, which is what a purchasing
 * manager means by the change.
 */
export function SupplierEditForm({ supplierId }: { supplierId: string }) {
  const router = useRouter();
  const { supplier, loading, error: loadError, notFound } =
    useSupplier(supplierId);

  const [values, setValues] = useState<SupplierFormValues | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed the form once the supplier arrives. Keyed on the document rather than
  // run on every render, so typing is never overwritten by a re-render.
  useEffect(() => {
    if (!supplier) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValues(toFormValues(supplier));
    setIsActive(isSupplierActive(supplier));
  }, [supplier]);

  function patch(next: Partial<SupplierFormValues>) {
    setValues((prev) => (prev ? { ...prev, ...next } : prev));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supplier || !values) return;
    setFormError(null);

    const errors = validateSupplierForm(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const npwp = orNull(values.npwp.replace(/\s+/g, ""));
    const term = Number(values.paymentTermDays.trim());

    // Build the patch from what actually differs. `undefined` entries are
    // dropped by JSON.stringify, so an untouched field is never sent.
    const changes: UpdateSupplierInput = {
      name: values.name.trim() === supplier.name ? undefined : values.name.trim(),
      type: values.type === supplier.type ? undefined : values.type,
      pic: orNull(values.pic) === supplier.pic ? undefined : orNull(values.pic),
      phone:
        orNull(values.phone) === supplier.phone
          ? undefined
          : orNull(values.phone),
      email:
        orNull(values.email) === supplier.email
          ? undefined
          : orNull(values.email),
      address:
        orNull(values.address) === supplier.address
          ? undefined
          : orNull(values.address),
      npwp: npwp === supplier.npwp ? undefined : npwp,
      notes:
        orNull(values.notes) === supplier.notes
          ? undefined
          : orNull(values.notes),
      paymentTermDays: term === supplier.paymentTermDays ? undefined : term,
      isActive: isActive === isSupplierActive(supplier) ? undefined : isActive,
    };

    const touched = Object.values(changes).some(
      (value) => value !== undefined,
    );
    if (!touched) {
      // The backend answers an empty patch with a 400. Saying "nothing changed"
      // is the honest version of that, and it costs no round trip.
      swalToast("Tidak ada perubahan untuk disimpan.");
      router.push(`/dashboard/purchasing/suppliers/${supplierId}`);
      return;
    }

    setSaving(true);
    try {
      const saved = await supplierService.update(supplierId, changes);
      router.push(`/dashboard/purchasing/suppliers/${supplierId}`);
      swalToast(`Perubahan pada ${saved.name} disimpan.`);
    } catch (error) {
      if (error instanceof ApiError) {
        const fields = error.fieldErrors;
        if (Object.keys(fields).length > 0) setFieldErrors(fields);
        else setFormError(error.fullMessage);
      } else {
        setFormError("Terjadi kesalahan. Coba lagi.");
      }
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <Alert variant="error">
        Supplier tidak ditemukan. Mungkin sudah dihapus.
      </Alert>
    );
  }

  if (loadError) {
    return <Alert variant="error">{loadError}</Alert>;
  }

  if (loading || !values) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat data supplier…
      </div>
    );
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

      <Card title="Status kerja sama">
        <div className="flex items-start gap-3">
          <Checkbox
            id="supplier-active"
            checked={isActive}
            disabled={saving}
            onCheckedChange={(checked) => setIsActive(checked === true)}
          />
          <div>
            <Label htmlFor="supplier-active" className="font-normal">
              Masih bekerja sama dengan supplier ini
            </Label>
            <p className="mt-1 text-xs text-muted">
              Jika dinonaktifkan, supplier tidak muncul saat membuat penerimaan
              barang dan penerimaan baru atas namanya ditolak. Riwayat
              penerimaan dan fakturnya tetap utuh — ini bukan penghapusan.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Menyimpan…" : "Simpan perubahan"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={() =>
            router.push(`/dashboard/purchasing/suppliers/${supplierId}`)
          }
        >
          Batal
        </Button>
      </div>
    </form>
  );
}
