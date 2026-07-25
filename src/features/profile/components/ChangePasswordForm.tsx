"use client";

import { useState } from "react";

import { Alert, Button, TextField } from "@/components";
import { ApiError } from "@/services/api-error";
import { userService } from "@/services/user.service";
import { useAuth } from "@/features/auth";
import {
  validatePassword,
  validateConfirmPassword,
  PASSWORD_MIN_LENGTH,
} from "@/utils/validation";

/**
 * Set a new password for the signed-in user via PATCH /users/:id/password.
 *
 * The backend route takes no current password (it is the administrative reset
 * endpoint), so there is deliberately no "current password" field here.
 */
export function ChangePasswordForm() {
  const { user } = useAuth();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setDone(false);

    const nextErrors: Record<string, string> = {};
    const passwordError = validatePassword(password);
    const confirmError = validateConfirmPassword(password, confirm);
    if (passwordError) nextErrors.newPassword = passwordError;
    if (confirmError) nextErrors.confirm = confirmError;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await userService.changePassword(user!._id, password);
      setPassword("");
      setConfirm("");
      setDone(true);
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
      {done && <Alert variant="success">Password changed.</Alert>}

      <TextField
        label="New password"
        type="password"
        name="newPassword"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.newPassword}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        required
      />

      <TextField
        label="Confirm new password"
        type="password"
        name="confirm"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={fieldErrors.confirm}
        required
      />

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          Change password
        </Button>
      </div>
    </form>
  );
}
