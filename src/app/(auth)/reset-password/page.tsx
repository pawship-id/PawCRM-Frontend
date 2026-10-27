import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth";
import { Spinner } from "@/components";

export const metadata: Metadata = { title: "Buat password baru · Buloo" };

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-extrabold text-foreground">
          Buat password baru
        </h1>
        <p className="mt-1 text-sm text-muted">
          Pilih password baru untuk akun Anda.
        </p>
      </div>
      {/* ResetPasswordForm reads the ?token= via useSearchParams, which requires
          a Suspense boundary in Next.js. */}
      <Suspense
        fallback={
          <div className="flex justify-center py-6 text-primary">
            <Spinner />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
