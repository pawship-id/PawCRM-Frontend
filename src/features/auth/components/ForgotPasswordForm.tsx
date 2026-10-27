"use client";

import { useState } from "react";
import Link from "next/link";

import { Alert, Button, TextField } from "@/components";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api-error";
import { validateEmail } from "@/utils/validation";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const emailError = validateEmail(email);
    setFieldError(emailError);
    if (emailError) return;

    setSubmitting(true);
    try {
      // The backend returns the SAME generic message whether or not the address
      // has an account — so we simply show whatever it returns, never revealing
      // existence.
      const result = await authService.forgotPassword(email.trim());
      setMessage(
        result.message ||
          "Kalau email ini terdaftar, link reset password sudah kami kirim. Cek kotak masuk email Anda.",
      );
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldError(error.fieldErrors.email ?? error.message);
      } else {
        setFormError("Terjadi kesalahan. Coba lagi.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (message) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">{message}</Alert>
        <Link
          href="/login"
          className="text-sm font-medium text-primary hover:text-primary-hover"
        >
          ← Kembali ke halaman masuk
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <Alert variant="error">{formError}</Alert>}

      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="nama@petshop.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldError}
        hint="Link untuk reset password akan dikirim ke email ini."
        required
        autoFocus
      />

      <Button type="submit" loading={submitting} fullWidth>
        Kirim link reset
      </Button>

      <Link
        href="/login"
        className="text-center text-sm font-medium text-primary hover:text-primary-hover"
      >
        ← Kembali ke halaman masuk
      </Link>
    </form>
  );
}
