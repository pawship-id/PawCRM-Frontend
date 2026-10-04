import type { Metadata } from "next";
import { Card } from "@/components";
import {
  ProfileSummary,
  ProfileForm,
  ChangePasswordForm,
  SignOutEverywhereForm,
} from "@/features/profile";

export const metadata: Metadata = { title: "My profile · Buloo" };

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">My profile</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your account details and password.
        </p>
      </div>

      <Card title="Account">
        <ProfileSummary />
      </Card>

      <Card
        title="Profile details"
        description="Update your name, email and phone number."
      >
        <ProfileForm />
      </Card>

      <Card
        title="Password"
        description="Choose a new password for signing in."
      >
        <ChangePasswordForm />
      </Card>

      {/*
        LAST ON THE PAGE, under the password. The two belong together — somebody
        who has just changed their password is exactly who needs to push the old
        one off every other device — and putting it above the forms would make
        the first thing on a profile page a way to sign yourself out of it.

        Copy in Bahasa (ui-rules §12) although the cards above are still English:
        those are on the migration list, and matching them would add one more
        string to translate later.
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
