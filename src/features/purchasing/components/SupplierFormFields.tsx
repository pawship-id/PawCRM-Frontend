"use client";

import { Card, TextField } from "@/components";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  validateSupplierAddress,
  validateSupplierEmail,
  validateSupplierName,
  validateSupplierNotes,
  validateSupplierNpwp,
  validateSupplierPaymentTerm,
  validateSupplierPhone,
  validateSupplierPic,
} from "@/utils/validation";
import type { SupplierType } from "@/types/api";

/**
 * The fields shared by the create and edit supplier forms.
 *
 * Extracted rather than duplicated: the two forms differ in what they SUBMIT (a
 * POST of everything versus a PATCH of what changed) and in whether they can
 * deactivate, but the inputs themselves are identical, and two copies of a
 * fifteen-field form is how a validation rule ends up applied on one screen and
 * not the other.
 *
 * Fully controlled — the parent owns the state and the submit; this owns the
 * layout, the labels and the hints.
 */
export interface SupplierFormValues {
  name: string;
  type: SupplierType;
  pic: string;
  phone: string;
  email: string;
  address: string;
  npwp: string;
  notes: string;
  paymentTermDays: string;
}

/**
 * The cooperation model, spelled out. The hint under each is not decoration: it
 * is the difference between goods that create a debt on arrival and goods that
 * do not, and choosing wrong is only discovered weeks later as a payable nobody
 * expected.
 */
export const SUPPLIER_TYPES: Array<{
  value: SupplierType;
  label: string;
  hint: string;
}> = [
  {
    value: "beli_putus",
    label: "Beli putus",
    hint: "Barang jadi milik toko saat diterima — penerimaan membuat faktur utang.",
  },
  {
    value: "konsinyasi",
    label: "Konsinyasi",
    hint: "Barang dititipkan; masih milik supplier sampai laku. Tidak membuat utang saat diterima.",
  },
  {
    value: "both",
    label: "Keduanya",
    hint: "Tipe ditentukan per penerimaan.",
  },
];

export function SupplierFormFields({
  values,
  errors,
  disabled = false,
  onChange,
}: {
  values: SupplierFormValues;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (patch: Partial<SupplierFormValues>) => void;
}) {
  const activeType = SUPPLIER_TYPES.find((type) => type.value === values.type);

  return (
    <>
      <Card title="Identitas">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Nama supplier"
              name="name"
              value={values.name}
              onChange={(event) => onChange({ name: event.target.value })}
              error={errors.name}
              placeholder="PT Sumber Pakan Sejahtera"
              disabled={disabled}
              required
            />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier-type">
                Tipe kerja sama<span className="text-danger"> *</span>
              </Label>
              <Select
                value={values.type}
                disabled={disabled}
                onValueChange={(value) =>
                  onChange({ type: value as SupplierType })
                }
              >
                <SelectTrigger
                  id="supplier-type"
                  aria-label="Tipe kerja sama"
                  aria-invalid={errors.type ? true : undefined}
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPLIER_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type ? (
                <p role="alert" className="text-xs text-danger">
                  {errors.type}
                </p>
              ) : (
                activeType && (
                  <p className="text-xs text-muted">{activeType.hint}</p>
                )
              )}
            </div>
          </div>

          <TextField
            label="Alamat"
            name="address"
            value={values.address}
            onChange={(event) => onChange({ address: event.target.value })}
            error={errors.address}
            placeholder="Jl. Rungkut Industri 21, Surabaya"
            disabled={disabled}
          />
        </div>
      </Card>

      <Card title="Kontak & administrasi">
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Penanggung jawab"
            name="pic"
            value={values.pic}
            onChange={(event) => onChange({ pic: event.target.value })}
            error={errors.pic}
            placeholder="Pak Hendra"
            disabled={disabled}
          />
          <TextField
            label="Telepon"
            name="phone"
            value={values.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
            error={errors.phone}
            placeholder="031-8877-221"
            disabled={disabled}
          />
          <TextField
            label="Email"
            name="email"
            type="email"
            value={values.email}
            onChange={(event) => onChange({ email: event.target.value })}
            error={errors.email}
            placeholder="sales@supplier.co.id"
            disabled={disabled}
          />
          <TextField
            label="NPWP"
            name="npwp"
            value={values.npwp}
            onChange={(event) => onChange({ npwp: event.target.value })}
            error={errors.npwp}
            className="tabular-nums"
            placeholder="01.234.567.8-901.000"
            disabled={disabled}
          />
          <TextField
            label="Termin pembayaran"
            name="paymentTermDays"
            inputMode="numeric"
            value={values.paymentTermDays}
            onChange={(event) =>
              onChange({ paymentTermDays: event.target.value })
            }
            error={errors.paymentTermDays}
            // The field that quietly drives the payables screen: it is what
            // turns an invoice date into a due date, and therefore what decides
            // which rows show up as overdue.
            hint="Hari sampai jatuh tempo. 0 = bayar saat terima."
            disabled={disabled}
            required
          />
          <TextField
            label="Catatan"
            name="notes"
            value={values.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            error={errors.notes}
            placeholder="opsional"
            disabled={disabled}
          />
        </div>
      </Card>
    </>
  );
}

/**
 * Runs every field validator; returns the errors keyed by field name — which is
 * the same key `ApiError.fieldErrors` uses, so a client error and a server one
 * land in the same slot and the form needs only one error state.
 *
 * The client rules are a nicety, not the authority: every one of them also runs
 * on the server, and the ones that cannot run here at all (a duplicate name, a
 * duplicate NPWP) come back as a 409 the caller maps in.
 */
export function validateSupplierForm(
  values: SupplierFormValues,
): Record<string, string> {
  const errors: Record<string, string> = {};

  const checks: Array<[keyof SupplierFormValues, string | undefined]> = [
    ["name", validateSupplierName(values.name)],
    ["pic", validateSupplierPic(values.pic)],
    ["phone", validateSupplierPhone(values.phone)],
    ["email", validateSupplierEmail(values.email)],
    ["address", validateSupplierAddress(values.address)],
    ["npwp", validateSupplierNpwp(values.npwp)],
    ["notes", validateSupplierNotes(values.notes)],
    ["paymentTermDays", validateSupplierPaymentTerm(values.paymentTermDays)],
  ];

  checks.forEach(([field, message]) => {
    if (message) errors[field] = message;
  });

  return errors;
}

/**
 * Trims a value and returns `null` for the empty case — the payload shape the
 * API expects for a clearable field. `""` would be stored as neither absent nor
 * present; `null` means "no value", which is what an emptied input meant.
 */
export function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
