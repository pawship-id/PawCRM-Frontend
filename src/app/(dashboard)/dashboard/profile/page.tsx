import type { Metadata } from "next";
import { Card } from "@/components";
import {
  ProfileSummary,
  ProfileForm,
  ChangePasswordForm,
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
    </div>
  );
}
