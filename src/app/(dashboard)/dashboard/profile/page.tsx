import type { Metadata } from "next";
import { Card } from "@/components";
import {
  ProfileSummary,
  ProfileForm,
  ChangePasswordForm,
  SignOutEverywhereForm,
} from "@/features/profile";

export const metadata: Metadata = { title: "Profil saya · Buloo" };

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Profil saya</h1>
        <p className="mt-1 text-sm text-muted">
          Atur data akun dan password Anda.
        </p>
      </div>

      <Card title="Akun">
        <ProfileSummary />
      </Card>

      <Card
        title="Data diri"
        description="Ubah nama, email, dan nomor HP Anda."
      >
        <ProfileForm />
      </Card>

      <Card
        title="Password"
        description="Ganti password yang Anda pakai untuk masuk."
      >
        <ChangePasswordForm />
      </Card>

      {/*
        LAST ON THE PAGE, under the password. The two belong together — somebody
        who has just changed their password is exactly who needs to push the old
        one off every other device — and putting it above the forms would make
        the first thing on a profile page a way to sign yourself out of it.

        Copy in Bahasa (ui-rules §12), like every card above it.
      */}
      <Card
        title="Sesi perangkat"
        description="Keluar dari semua perangkat yang sedang masuk pakai akun ini."
      >
        <SignOutEverywhereForm />
      </Card>
    </div>
  );
}
