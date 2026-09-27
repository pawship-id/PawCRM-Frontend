"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, Card, validateLocationFields } from "@/components";
import { ApiError } from "@/services/api-error";
import { customerService } from "@/services/customer.service";
import { swalToast } from "@/lib/swal";
import {
  validateCustomerName,
  validateOptionalEmail,
  validateCustomerPhone,
  validateCustomerAddress,
} from "@/utils/validation";

import {
  CustomerFormFields,
  customerFormToPayload,
  emptyCustomerForm,
  type CustomerFormValue,
} from "./CustomerFormFields";

/**
 * Create a customer via POST /customers, then return to the list.
 *
 * THE FIELDS ARE `CustomerFormFields`, shared with the edit screen. This file
 * holds only what is different about creating one: where it posts, where it goes
 * afterwards, and the toast. Before they were shared, the two drifted — the
 * create form had no address pin, which meant every customer registered at the
 * counter arrived without the coordinate a zone-priced service is quoted from.
 *
 * Client validation is a UX nicety; `ApiError.fieldErrors` is the authority and
 * maps onto the matching inputs, so a duplicate email or a category that has
 * since been retired surfaces on the field it belongs to.
 */
export function CustomerCreateForm() {
  const router = useRouter();

  const [value, setValue] = useState<CustomerFormValue>(emptyCustomerForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function patch(change: Partial<CustomerFormValue>) {
    setValue((prev) => ({ ...prev, ...change }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string> = {};
    const nameError = validateCustomerName(value.name);
    const emailError = validateOptionalEmail(value.email);
    const phoneError = validateCustomerPhone(value.phone);
    const addressError = validateCustomerAddress(value.address);
    if (nameError) nextErrors.name = nameError;
    if (emailError) nextErrors.email = emailError;
    if (phoneError) nextErrors.phone = phoneError;
    if (addressError) nextErrors.address = addressError;
    Object.assign(nextErrors, validateLocationFields(value.location));
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const created = await customerService.create(customerFormToPayload(value));
      // Redirect first, then fire the toast so it rides along on the list screen.
      router.push("/dashboard/master/customers");
      swalToast(`${created.name} tersimpan.`);
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

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}

      <Card
        title="Identitas"
        description="Data pemilik. Hewannya didaftarkan setelah pelanggan ini tersimpan."
      >
        <CustomerFormFields
          value={value}
          onChange={patch}
          errors={fieldErrors}
        />
      </Card>

      {/* Stacks on small screens (Simpan on top, Batal below); row on sm+. */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/master/customers")}
        >
          Batal
        </Button>
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Simpan pelanggan
        </Button>
      </div>
    </form>
  );
}
