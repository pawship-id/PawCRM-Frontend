"use client";

import {
  CheckRow,
  CheckRowGroup,
  FilterSelect,
  LocationFields,
  SelectField,
  TextField,
  TextareaField,
  toGeoLocation,
  toLocationFieldsValue,
  type LocationFieldsValue,
} from "@/components";
import { useCustomerTypeList } from "@/features/settings";
import type {
  CreateCustomerInput,
  Customer,
  CustomerKind,
  VipTier,
} from "@/types/api";

import { VipTierSelect } from "./VipTierSelect";

/**
 * Everything the Pelanggan form holds, as one object.
 *
 * STRINGS, NOT THE API's NULLS, because that is what an input holds: a cleared
 * field is `""` on screen and `null` in the database, and mixing the two is how
 * a form starts rendering the word "null" in a box. `toPayload` below is the one
 * place the translation happens.
 */
export interface CustomerFormValue {
  name: string;
  kind: CustomerKind;
  customerTypeId: string;
  phone: string;
  email: string;
  address: string;
  location: LocationFieldsValue;
  taxId: string;
  picName: string;
  vipTier: VipTier | "";
  notes: string;
  notifications: {
    bookingReminder: boolean;
    membershipRenewal: boolean;
    promo: boolean;
  };
}

/** A blank form — the defaults a new customer is born with. */
export function emptyCustomerForm(): CustomerFormValue {
  return {
    name: "",
    kind: "individual",
    customerTypeId: "",
    phone: "",
    email: "",
    address: "",
    location: { lat: "", lng: "" },
    taxId: "",
    picName: "",
    vipTier: "",
    notes: "",
    // The mockup's own: the two service messages on, marketing off. Promo is
    // opted INTO, never out of.
    notifications: {
      bookingReminder: true,
      membershipRenewal: true,
      promo: false,
    },
  };
}

/** An existing customer, as the form holds it. */
export function customerToForm(customer: Customer): CustomerFormValue {
  return {
    name: customer.name,
    kind: customer.kind,
    customerTypeId: customer.customerTypeId ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    address: customer.address ?? "",
    location: toLocationFieldsValue(customer.location),
    taxId: customer.taxId ?? "",
    picName: customer.picName ?? "",
    vipTier: customer.vipTier ?? "",
    notes: customer.notes ?? "",
    notifications: { ...customer.notifications },
  };
}

/**
 * The form as the API takes it — trimmed, with every emptied field as `null`.
 *
 * NPWP AND PIC ARE CLEARED WHEN THE CUSTOMER IS A PERSON. The form hides those
 * two for an individual, and a hidden field that keeps its old value is the
 * worst kind: nothing on screen says the record still carries a tax number, and
 * the next person to look at the profile finds one on a private customer. So
 * correcting Perusahaan → Perorangan actually removes them.
 */
export function customerFormToPayload(
  value: CustomerFormValue,
): CreateCustomerInput {
  const company = value.kind === "company";
  const blankToNull = (text: string) => (text.trim() === "" ? null : text.trim());

  return {
    name: value.name.trim(),
    kind: value.kind,
    customerTypeId: value.customerTypeId === "" ? null : value.customerTypeId,
    phone: blankToNull(value.phone),
    email: blankToNull(value.email),
    address: blankToNull(value.address),
    location: toGeoLocation(value.location),
    taxId: company ? blankToNull(value.taxId) : null,
    picName: company ? blankToNull(value.picName) : null,
    vipTier: value.vipTier === "" ? null : value.vipTier,
    notes: blankToNull(value.notes),
    notifications: value.notifications,
  };
}

const KINDS = [
  { value: "individual", label: "Perorangan" },
  { value: "company", label: "Perusahaan" },
];

/**
 * The Pelanggan form's fields, shared by the create and the edit screen.
 *
 * ONE COMPONENT FOR BOTH, which is the whole point of the file. The two screens
 * differ in what they do with the answer — POST or PATCH, where they return to,
 * whether a danger zone follows — and in nothing else. Kept apart, they drifted:
 * before this, the create form had no address pin and the edit form had no way
 * to record that a customer is a company.
 *
 * FIELD ORDER IS ui-rules §16's Form Entitas: the name first and full width,
 * then what KIND of customer this is, then how to reach them, then the optional
 * attributes, with Catatan last. Jenis and Kategori lead because they change what
 * the rest of the form shows.
 *
 * KATEGORI IS THE TENANT'S OWN LIST, read from Pengaturan › Tipe pelanggan
 * through that feature's own hook — not a copy of it. A shop that has never
 * opened that page has no categories, and the field says so rather than sitting
 * there as an empty dropdown somebody clicks three times.
 *
 * NPWP AND PIC APPEAR FOR A COMPANY ONLY. They are the two facts a company has
 * and a person does not, and on a person's form they would be two fields nobody
 * can fill in — see `customerFormToPayload` for what happens to them when a
 * record changes kind.
 */
export function CustomerFormFields({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: CustomerFormValue;
  onChange: (patch: Partial<CustomerFormValue>) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const { types, loading, error } = useCustomerTypeList();

  const categoryOptions = [
    { value: "", label: "Tanpa kategori" },
    ...types.map((type) => ({ value: type._id, label: type.name })),
  ];

  /**
   * What the Kategori field says when it cannot offer anything. An empty
   * dropdown with no explanation is a control people press repeatedly; this
   * names the page that fills it.
   */
  const categoryHint = error
    ? "Daftar tipe pelanggan tidak bisa dimuat."
    : !loading && types.length === 0
      ? "Belum ada tipe pelanggan. Tambahkan dulu di Pengaturan › Tipe pelanggan."
      : "Daftarnya diatur di Pengaturan › Tipe pelanggan.";

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Nama pelanggan"
        name="name"
        value={value.name}
        onChange={(event) => onChange({ name: event.target.value })}
        error={errors.name}
        disabled={disabled}
        required
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Jenis pelanggan"
          value={value.kind}
          onChange={(kind) => onChange({ kind: kind as CustomerKind })}
          options={KINDS}
          disabled={disabled}
          error={errors.kind}
          hint="Perusahaan menambah kolom NPWP dan PIC."
        />
        {/*
          `FilterSelect layout="form"` is this app's searchable full-width picker
          — ui-rules §16. `active={false}` because a chosen category is an answer,
          not an applied filter, and the navy trigger would announce one.
        */}
        <FilterSelect
          layout="form"
          label="Kategori pelanggan"
          ariaLabel="Kategori pelanggan"
          value={value.customerTypeId}
          options={categoryOptions}
          onChange={(customerTypeId) => onChange({ customerTypeId })}
          placeholder={loading ? "Memuat…" : "Tanpa kategori"}
          active={false}
          disabled={disabled || loading || types.length === 0}
          disabledHint={categoryHint}
          hint={categoryHint}
          error={errors.customerTypeId}
        />

        <TextField
          label="WhatsApp / telepon"
          type="tel"
          name="phone"
          autoComplete="tel"
          placeholder="Opsional"
          value={value.phone}
          onChange={(event) => onChange({ phone: event.target.value })}
          error={errors.phone}
          disabled={disabled}
        />
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Opsional"
          value={value.email}
          onChange={(event) => onChange({ email: event.target.value })}
          error={errors.email}
          disabled={disabled}
        />

        <div className="sm:col-span-2">
          <TextField
            label="Alamat"
            name="address"
            placeholder="Opsional"
            value={value.address}
            onChange={(event) => onChange({ address: event.target.value })}
            error={errors.address}
            disabled={disabled}
          />
        </div>

        {/* The address's pin — paste "lat, lng" from Google Maps. */}
        <LocationFields
          value={value.location}
          onChange={(location) => onChange({ location })}
          errors={errors}
          disabled={disabled}
        />
        <p className="text-xs text-muted sm:col-span-2">
          Titik alamat dipakai untuk menentukan zona antar-jemput dari jarak ke
          cabang.
        </p>

        {value.kind === "company" && (
          <>
            <TextField
              label="NPWP"
              name="taxId"
              placeholder="Opsional"
              value={value.taxId}
              onChange={(event) => onChange({ taxId: event.target.value })}
              error={errors.taxId}
              disabled={disabled}
            />
            <TextField
              label="PIC (contact person)"
              name="picName"
              placeholder="Opsional"
              value={value.picName}
              onChange={(event) => onChange({ picName: event.target.value })}
              error={errors.picName}
              disabled={disabled}
            />
          </>
        )}

        <VipTierSelect
          value={value.vipTier}
          onChange={(vipTier) => onChange({ vipTier })}
          error={errors.vipTier}
          disabled={disabled}
        />
      </div>

      {/* Catatan last, as §16 has it — an internal note, not published copy. */}
      <TextareaField
        label="Catatan"
        name="notes"
        value={value.notes}
        onChange={(event) => onChange({ notes: event.target.value })}
        error={errors.notes}
        disabled={disabled}
        hint="Muncul di layar kasir dan di kartu booking."
      />

      <div>
        <h3 className="text-base font-bold text-foreground">Pengingat</h3>
        <p className="mt-0.5 text-xs text-muted">
          Belum ada yang mengirim — pilihan di sini tersimpan sebagai izin dari
          pelanggan, dan dipakai begitu WhatsApp otomatis dibangun.
        </p>
        <CheckRowGroup className="mt-1">
          <CheckRow
            label="Kirim pengingat booking"
            description="WhatsApp H-1 sebelum jadwalnya."
            checked={value.notifications.bookingReminder}
            onCheckedChange={(bookingReminder) =>
              onChange({
                notifications: { ...value.notifications, bookingReminder },
              })
            }
            disabled={disabled}
          />
          <CheckRow
            label="Tawarkan perpanjangan membership"
            description="30 hari sebelum masa berlakunya berakhir."
            checked={value.notifications.membershipRenewal}
            onCheckedChange={(membershipRenewal) =>
              onChange({
                notifications: { ...value.notifications, membershipRenewal },
              })
            }
            disabled={disabled}
          />
          <CheckRow
            label="Kirim promo"
            description="Blast promo bulanan. Mati secara bawaan — promo diminta, bukan ditolak."
            checked={value.notifications.promo}
            onCheckedChange={(promo) =>
              onChange({ notifications: { ...value.notifications, promo } })
            }
            disabled={disabled}
          />
        </CheckRowGroup>
      </div>
    </div>
  );
}
