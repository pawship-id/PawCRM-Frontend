"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Button,
  LocationFields,
  TextField,
  toGeoLocation,
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
import type { VipTier } from "@/types/api";

import { VipTierSelect } from "./VipTierSelect";

/**
 * Create a customer via POST /customers, then return to the list.
 *
 * Follows the app's hand-rolled form pattern (see BranchCreateForm): local state,
 * client validation as a UX nicety, and ApiError.fieldErrors mapped onto the
 * matching inputs so backend validation (duplicate email, bad phone) surfaces
 * inline. Only the name is required — a walk-in can be recorded with just a name.
 * The optional fields send `null` when blank so the backend stores them unset.
 */
export function CustomerCreateForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  // The address's pin — what a service priced by Zona is quoted from (17 September 2026).
  const [location, setLocation] = useState<LocationFieldsValue>({ lat: "", lng: "" });
  const [vipTier, setVipTier] = useState<VipTier | "">("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      const created = await customerService.create({
        name: name.trim(),
        email: email.trim() === "" ? null : email.trim(),
        phone: phone.trim() === "" ? null : phone.trim(),
        address: address.trim() === "" ? null : address.trim(),
        location: toGeoLocation(location),
        vipTier: vipTier === "" ? null : vipTier,
      });
      // Redirect first, then fire the toast so it rides along on the list screen.
      router.push("/dashboard/master/customers");
      swalToast(`${created.name} has been created.`);
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Row 1: name & email */}
        <TextField
          label="Customer name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          required
        />
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="Optional"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />

        {/* Row 2: phone & VIP tier */}
        <TextField
          label="Phone"
          type="tel"
          name="phone"
          autoComplete="tel"
          placeholder="Optional"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={fieldErrors.phone}
        />
        <VipTierSelect
          value={vipTier}
          onChange={setVipTier}
          error={fieldErrors.vipTier}
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
          />
        </div>

        {/* Row 4: the address's pin — paste "lat, lng" from Google Maps. */}
        <LocationFields value={location} onChange={setLocation} errors={fieldErrors} />
        <p className="text-xs text-muted sm:col-span-2">
          Titik alamat dipakai untuk menentukan zona antar-jemput dari jarak ke cabang.
        </p>
      </div>

      {/* Stacks on small screens (Create on top, Cancel below); row on sm+. */}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="ghost"
          className="w-full sm:w-auto"
          onClick={() => router.push("/dashboard/master/customers")}
        >
          Cancel
        </Button>
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          Create customer
        </Button>
      </div>
    </form>
  );
}
