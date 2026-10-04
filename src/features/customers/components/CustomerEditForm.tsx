"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  ConfirmDialog,
  Spinner,
  validateLocationFields,
} from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import type { Customer } from "@/types/api";

import {
  CustomerFormFields,
  customerFormToPayload,
  customerToForm,
  type CustomerFormValue,
} from "./CustomerFormFields";
import {
  CustomerVipBadge,
  CustomerStatusBadge,
  isCustomerActive,
} from "./CustomerVipBadge";

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
              <CustomerStatusBadge
                isActive={customer.isActive}
                deleted={customer.deletedAt !== null}
              />
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
  /*
    SEEDED ONCE, FROM THE CUSTOMER THIS SECTION WAS HANDED. Re-seeding on every
    change of `customer` would throw away what somebody is typing the moment a
    sibling section lifts a new copy up — which the danger zone does on every
    restore.
  */
  const [value, setValue] = useState<CustomerFormValue>(() =>
    customerToForm(customer),
  );
  /*
    KEPT OUTSIDE `CustomerFormValue` (2 October 2026), the same way
    `BranchEditForm` keeps `isActive` beside its other fields rather than
    inside them: `CustomerFormValue`/`customerToForm`/`customerFormToPayload`
    are the shape `CustomerCreateForm` shares, and a brand-new customer has no
    "switch this one off" to offer — only an existing one does.
  */
  const [isActive, setIsActive] = useState(() => isCustomerActive(customer));

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const disabled = customer.deletedAt !== null;

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
      /*
        THE WHOLE FORM IS SENT, not a diff. The API takes any subset but rejects
        an empty body, and working out which of a dozen fields moved is a second
        source of truth about what the user changed — the bug that reliably falls
        out of it is a cleared field that never clears, because `""` and
        "unchanged" look alike.
      */
      const updated = await customerService.update(customer._id, {
        ...customerFormToPayload(value),
        isActive,
      });
      onUpdated(updated);
      setValue(customerToForm(updated));
      setIsActive(isCustomerActive(updated));
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

      <CustomerFormFields
        value={value}
        onChange={patch}
        errors={fieldErrors}
        disabled={disabled}
      />

      <div className="flex items-center gap-2.5">
        <Checkbox
          id="customer-active"
          checked={isActive}
          disabled={disabled}
          onCheckedChange={(checked) => setIsActive(checked === true)}
        />
        <Label htmlFor="customer-active" className="font-normal">
          Aktif — pelanggan ini muncul di daftar pilihan pelanggan
        </Label>
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
