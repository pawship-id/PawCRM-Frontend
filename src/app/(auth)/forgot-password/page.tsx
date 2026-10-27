import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth";

export const metadata: Metadata = { title: "Lupa password · Buloo" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-extrabold text-foreground">
          Lupa password?
        </h1>
        <p className="mt-1 text-sm text-muted">
          Masukkan email Anda, nanti kami kirimkan link untuk reset password.
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
