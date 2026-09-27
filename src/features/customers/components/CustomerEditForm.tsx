"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  ConfirmDialog,
  LocationFields,
  Spinner,
  TextField,
  toGeoLocation,
  toLocationFieldsValue,
  validateLocationFields,
  type LocationFieldsValue,
} from "@/components";
import { ApiError } from "@/services/api-error";
import { customerService } from "@/services/customer.service";
import { swalToast } from "@/lib/swal";
import {
  validateCustomerName,
  validateOptionalEmail,
  validateCustomerPhone,
  validateCustomerAddress,
} from "@/utils/validation";
import { CustomerPetsSection } from "@/features/pets";
import type { Customer, VipTier } from "@/types/api";

import { VipTierSelect } from "./VipTierSelect";
import { CustomerVipBadge, CustomerStatusBadge } from "./CustomerVipBadge";

/**
 * Edit an existing customer. Mirrors BranchEditForm: the details (name, email,
 * phone, address, VIP tier) go through a single PATCH /customers/:id, and the
 * soft-delete lifecycle (delete / restore) lives in its own danger-zone Card.
 *
 * It fetches the customer on mount, then hands it to each section. Sections lift
 * their result back via `onUpdated` so the header badges and siblings stay in
 * sync without a refetch.
 */
export function CustomerEditForm({ id }: { id: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    customerService
      .getById(id)
      .then((result) => {
        if (active) setCustomer(result);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Data pelanggan ini tidak bisa dimuat.",
        );
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-6">
      {/*
        The header stays visible while the body loads. THE TRAIL GOES BACK TO THE
        PROFILE, not to the list: this route is one level under it now
        (`/master/customers/:id/edit`), and somebody who came here from a customer's
        page is returning to that page rather than to two hundred rows.
      */}
      <div>
        <Breadcrumb
          items={[
            { label: "Pelanggan", href: "/dashboard/master/customers" },
            ...(customer
              ? [
                  {
                    label: customer.name,
                    href: `/dashboard/master/customers/${customer._id}`,
                  },
                ]
              : []),
            { label: "Ubah" },
          ]}
        />
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-foreground">
            {customer ? `Ubah ${customer.name}` : "Ubah pelanggan"}
          </h1>
          {customer && (
            <>
              <CustomerStatusBadge deleted={customer.deletedAt !== null} />
              {customer.vipTier && <CustomerVipBadge tier={customer.vipTier} />}
            </>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          Data pemilik dan tier VIP-nya. Data hewan diubah dari kartunya
          masing-masing.
        </p>
      </div>

      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : !customer ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Spinner /> Memuat data pelanggan…
        </div>
      ) : (
        <>
          <Card title="Identitas" description="Kontak dan tier VIP.">
            <DetailsSection customer={customer} onUpdated={setCustomer} />
          </Card>

          {/*
            Between the details and the danger zone on purpose: it is context for
            the delete below it. Removing a customer is refused while any of these
            animals is still listed, and reading that after seeing them is what
            makes the refusal make sense.
          */}
          <Card
            title="Hewan"
            description="Hewan yang terdaftar atas nama pelanggan ini. Yang sudah tidak dirawat tetap ditampilkan — riwayatnya masih di sini."
          >
            <CustomerPetsSection
              customerId={customer._id}
              customerName={customer.name}
              disabled={customer.deletedAt !== null}
            />
          </Card>

          <Card
            title="Hapus pelanggan"
            description="Menghapus pelanggan ini, atau memulihkan yang sudah dihapus."
          >
            <DangerSection customer={customer} onUpdated={setCustomer} />
          </Card>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DetailsSection({
  customer,
  onUpdated,
}: {
  customer: Customer;
  onUpdated: (customer: Customer) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  // The address's pin — what a service priced by Zona is quoted from (17 September 2026).
  const [location, setLocation] = useState<LocationFieldsValue>(() =>
    toLocationFieldsValue(customer.location),
  );
  const [vipTier, setVipTier] = useState<VipTier | "">(customer.vipTier ?? "");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const disabled = customer.deletedAt !== null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string> = {};
    const nameError = validateCustomerName(name);
    const emailError = validateOptionalEmail(email);
    const phoneError = validateCustomerPhone(phone);
    const addressError = validateCustomerAddress(address);
    if (nameError) nextErrors.name = nameError;
    if (emailError) nextErrors.email = emailError;
    if (phoneError) nextErrors.phone = phoneError;
    if (addressError) nextErrors.address = addressError;
    Object.assign(nextErrors, validateLocationFields(location));
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const updated = await customerService.update(customer._id, {
        name: name.trim(),
        email: email.trim() === "" ? null : email.trim(),
        phone: phone.trim() === "" ? null : phone.trim(),
        address: address.trim() === "" ? null : address.trim(),
        location: toGeoLocation(location),
        vipTier: vipTier === "" ? null : vipTier,
      });
      onUpdated(updated);
      swalToast("Perubahan pelanggan tersimpan.");
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
          Pelanggan ini sudah dihapus. Pulihkan dulu di bagian bawah halaman
          sebelum datanya bisa diubah.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Row 1: name & email */}
        <TextField
          label="Nama pelanggan"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          disabled={disabled}
          required
        />
        <TextField
          label="Email"
          type="email"
          name="email"
          placeholder="Opsional"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          hint="Kosongkan untuk menghapus."
          disabled={disabled}
        />

        {/* Row 2: phone & VIP tier */}
        <TextField
          label="Telepon / WhatsApp"
          type="tel"
          name="phone"
          placeholder="Opsional"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={fieldErrors.phone}
          hint="Kosongkan untuk menghapus."
          disabled={disabled}
        />
        <VipTierSelect
          value={vipTier}
          onChange={setVipTier}
          error={fieldErrors.vipTier}
          disabled={disabled}
        />

        {/* Row 3: address (full width) */}
        <div className="sm:col-span-2">
          <TextField
            label="Alamat"
            name="address"
            placeholder="Opsional"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={fieldErrors.address}
            hint="Kosongkan untuk menghapus."
            disabled={disabled}
          />
        </div>

        {/* Row 4: the address's pin — paste "lat, lng" from Google Maps. */}
        <LocationFields
          value={location}
          onChange={setLocation}
          errors={fieldErrors}
          disabled={disabled}
        />
        <p className="text-xs text-muted sm:col-span-2">
          Titik alamat dipakai untuk menentukan zona antar-jemput dari jarak ke cabang.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() =>
            router.push(`/dashboard/master/customers/${customer._id}`)
          }
        >
          Batal
        </Button>
        <Button
          type="submit"
          loading={saving}
          disabled={disabled}
          className="w-full sm:w-auto"
        >
          Simpan pelanggan
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

type DangerAction = "delete" | "restore" | null;

function DangerSection({
  customer,
  onUpdated,
}: {
  customer: Customer;
  onUpdated: (customer: Customer) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<DangerAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleted = customer.deletedAt !== null;

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
        await customerService.remove(customer._id);
        router.push("/dashboard/master/customers");
        swalToast("Pelanggan dihapus.");
        return;
      }
      const updated = await customerService.restore(customer._id);
      onUpdated(updated);
      setPending(null);
      swalToast("Pelanggan dipulihkan.");
    } catch (err) {
      /*
        `reason` FIRST, and it is not cosmetic. Deleting a customer that still has
        pets is refused with a 409 whose `message` is only the headline ("Cannot
        delete customer") — the half that says what to do ("3 pet(s) still belong
        to this customer; delete or reassign them first") lives in `reason`.
        Showing the headline alone leaves somebody staring at a button that will
        not work with nothing on screen explaining why.
      */
      setError(
        err instanceof ApiError
          ? (err.reason ?? err.message)
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {deleted ? (
        <Button variant="secondary" onClick={() => setPending("restore")}>
          Pulihkan pelanggan
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="bg-danger text-danger-foreground hover:bg-danger/90"
          onClick={() => setPending("delete")}
        >
          Hapus pelanggan
        </Button>
      )}

      {pending && (
        <ConfirmDialog
          title={
            pending === "delete" ? "Hapus pelanggan" : "Pulihkan pelanggan"
          }
          confirmLabel={pending === "delete" ? "Hapus" : "Pulihkan"}
          destructive={pending === "delete"}
          busy={busy}
          error={error}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending === "delete" ? (
            <>
              Hapus <strong>{customer.name}</strong>? Datanya disembunyikan dari
              daftar dan emailnya bebas dipakai lagi. Bisa dipulihkan nanti.
            </>
          ) : (
            <>
              Pulihkan <strong>{customer.name}</strong>? Ini gagal kalau emailnya
              sudah dipakai pelanggan lain.
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
