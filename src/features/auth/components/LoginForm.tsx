"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert, Button, TextField } from "@/components";
import { ApiError } from "@/services/api-error";
import { validateEmail, validateRequired } from "@/utils/validation";
import { useAuth } from "../hooks/useAuth";

const DASHBOARD_HOME = "/dashboard/profile";

export interface LoginFormProps {
  /**
   * Where to go after signing in. The page validates this against the proxy's
   * `?next=` and only allows in-dashboard paths, so it cannot be an open
   * redirect. Defaults to the profile home.
   */
  redirectTo?: string;
}

export function LoginForm({ redirectTo = DASHBOARD_HOME }: LoginFormProps) {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Record<string, string> = {};
    const emailError = validateEmail(email);
    const passwordError = validateRequired(password, "Password");
    if (emailError) nextErrors.email = emailError;
    if (passwordError) nextErrors.password = passwordError;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      router.replace(redirectTo);
    } catch (error) {
      if (error instanceof ApiError && error.isValidationError) {
        setFieldErrors(error.fieldErrors);
      } else if (error instanceof ApiError) {
        // 401 is the deliberately generic "Invalid email or password".
        setFormError(error.message);
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
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="you@clinic.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email}
        required
        autoFocus
      />

      <TextField
        label="Password"
        type="password"
        name="password"
        autoComplete="current-password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
        required
      />

      <div className="flex justify-end -mt-1">
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-primary hover:text-primary-hover"
        >
          Forgot password?
        </Link>
      </div>

      <Button type="submit" loading={submitting} fullWidth>
        Sign in
      </Button>
    </form>
  );
}
