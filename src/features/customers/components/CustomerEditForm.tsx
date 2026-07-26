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
import { customerService } from "@/services/customer.service";
import { swalToast } from "@/lib/swal";
import {
  validateCustomerName,
  validateOptionalEmail,
  validateCustomerPhone,
  validateCustomerAddress,
} from "@/utils/validation";
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
            : "Could not load this customer.",
        );
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-6">
      {/* The header stays visible while the body loads. */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">
            Edit Customer
          </h1>
          {customer && (
            <>
              <CustomerStatusBadge deleted={customer.deletedAt !== null} />
              {customer.vipTier && <CustomerVipBadge tier={customer.vipTier} />}
            </>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          {customer
            ? `Update ${customer.name}'s details and VIP tier.`
            : "Update this customer's details and VIP tier."}
        </p>
      </div>

      {loadError ? (
        <Alert variant="error">{loadError}</Alert>
      ) : !customer ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
          <Spinner /> Loading form edit customer...
        </div>
      ) : (
        <>
          <Card title="Details" description="Contact details and VIP tier.">
            <DetailsSection customer={customer} onUpdated={setCustomer} />
          </Card>

          <Card
            title="Danger zone"
            description="Remove this customer or restore a removed one."
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
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const updated = await customerService.update(customer._id, {
        name: name.trim(),
        email: email.trim() === "" ? null : email.trim(),
        phone: phone.trim() === "" ? null : phone.trim(),
        address: address.trim() === "" ? null : address.trim(),
        vipTier: vipTier === "" ? null : vipTier,
      });
      onUpdated(updated);
      swalToast("Customer updated.");
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
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
          This customer is deleted. Restore them in the danger zone to edit.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Row 1: name & email */}
        <TextField
          label="Customer name"
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
          placeholder="Optional"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          hint="Leave blank to remove."
          disabled={disabled}
        />

        {/* Row 2: phone & VIP tier */}
        <TextField
          label="Phone"
          type="tel"
          name="phone"
          placeholder="Optional"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={fieldErrors.phone}
          hint="Leave blank to remove."
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
            label="Address"
            name="address"
            placeholder="Optional"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            error={fieldErrors.address}
            hint="Leave blank to remove."
            disabled={disabled}
          />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/master/customers")}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          loading={saving}
          disabled={disabled}
          className="w-full sm:w-auto"
        >
          Save changes
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
        swalToast("Customer deleted.");
        return;
      }
      const updated = await customerService.restore(customer._id);
      onUpdated(updated);
      setPending(null);
      swalToast("Customer restored.");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {deleted ? (
        <Button variant="secondary" onClick={() => setPending("restore")}>
          Restore customer
        </Button>
      ) : (
        <Button
          variant="secondary"
          className="bg-danger text-danger-foreground hover:bg-danger/90"
          onClick={() => setPending("delete")}
        >
          Delete customer
        </Button>
      )}

      {pending && (
        <ConfirmDialog
          title={pending === "delete" ? "Delete customer" : "Restore customer"}
          confirmLabel={pending === "delete" ? "Delete" : "Restore"}
          destructive={pending === "delete"}
          busy={busy}
          error={error}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending === "delete" ? (
            <>
              Delete <strong>{customer.name}</strong>? They will be hidden from
              the list and their email freed for reuse. You can restore them
              later.
            </>
          ) : (
            <>
              Restore <strong>{customer.name}</strong>? This may fail if their
              email has since been taken by another customer.
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
