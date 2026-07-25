"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Alert, Button, TextField } from "@/components";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api-error";
import {
  validatePassword,
  validateConfirmPassword,
  validateResetToken,
  PASSWORD_MIN_LENGTH,
} from "@/utils/validation";

export function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const tokenError = validateResetToken(token);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // A link with no/garbled token can never succeed — say so up front rather
  // than after a doomed submit.
  if (tokenError) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="error">{tokenError}</Alert>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-primary hover:text-primary-hover"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">
          Your password has been reset. You can now sign in with it.
        </Alert>
        <Link
          href="/login"
          className="text-sm font-medium text-primary hover:text-primary-hover"
        >
          Go to sign in →
        </Link>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string> = {};
    const passwordError = validatePassword(password);
    const confirmError = validateConfirmPassword(password, confirm);
    if (passwordError) nextErrors.newPassword = passwordError;
    if (confirmError) nextErrors.confirm = confirmError;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await authService.resetPassword(token, password);
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        // A used, expired or unknown token is a generic 400 from the backend.
        setFormError(
          error.message ||
            "This reset link is invalid or has expired. Request a new one.",
        );
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}

      <TextField
        label="New password"
        type="password"
        name="newPassword"
        autoComplete="new-password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.newPassword}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        required
        autoFocus
      />

      <TextField
        label="Confirm new password"
        type="password"
        name="confirm"
        autoComplete="new-password"
        placeholder="••••••••"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={fieldErrors.confirm}
        required
      />

      <Button type="submit" loading={submitting} fullWidth>
        Reset password
      </Button>
    </form>
  );
}
