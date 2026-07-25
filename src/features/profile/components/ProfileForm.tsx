"use client";

import { useState } from "react";

import { Alert, Button, TextField } from "@/components";
import { ApiError } from "@/services/api-error";
import { userService } from "@/services/user.service";
import { useAuth } from "@/features/auth";
import {
  validateEmail,
  validateFullName,
  validatePhone,
} from "@/utils/validation";

/**
 * Edit the signed-in user's own profile via PATCH /users/:id. On success the
 * cached user in the auth context is replaced so the header and read view update
 * without a re-fetch.
 */
export function ProfileForm() {
  const { user, setUser } = useAuth();

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaved(false);

    const nextErrors: Record<string, string> = {};
    const nameError = validateFullName(fullName);
    const emailError = validateEmail(email);
    const phoneError = validatePhone(phone);
    if (nameError) nextErrors.fullName = nameError;
    if (emailError) nextErrors.email = emailError;
    if (phoneError) nextErrors.phone = phoneError;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const updated = await userService.updateProfile(user!._id, {
        fullName: fullName.trim(),
        email: email.trim(),
        // Empty string clears the phone on the backend (nullable).
        phone: phone.trim() === "" ? null : phone.trim(),
      });
      setUser(updated);
      setSaved(true);
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
      {saved && <Alert variant="success">Profile updated.</Alert>}

      <TextField
        label="Full name"
        name="fullName"
        autoComplete="name"
        value={fullName}
        onChange={(e) => {
          setFullName(e.target.value);
          setSaved(false);
        }}
        error={fieldErrors.fullName}
        required
      />

      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setSaved(false);
        }}
        error={fieldErrors.email}
        required
      />

      <TextField
        label="Phone"
        type="tel"
        name="phone"
        autoComplete="tel"
        placeholder="Optional"
        value={phone ?? ""}
        onChange={(e) => {
          setPhone(e.target.value);
          setSaved(false);
        }}
        error={fieldErrors.phone}
        hint="Leave blank to remove."
      />

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
