import type { Metadata } from "next";

import { Card } from "@/components";
import { UserCreateForm } from "@/features/users";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Pengguna baru · Pengaturan · Buloo" };

export default function NewUserPage() {
  return (
    <RequirePermission feature="users" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Tambah pengguna</h1>
          <p className="mt-1 text-sm text-muted">
            Buat akun staf baru, lengkap dengan peran dan akses cabangnya.
          </p>
        </div>

        <Card>
          <UserCreateForm />
        </Card>
      </div>
    </RequirePermission>
  );
}
