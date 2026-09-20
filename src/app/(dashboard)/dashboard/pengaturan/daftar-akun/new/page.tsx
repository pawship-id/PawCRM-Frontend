import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import {
  ACCOUNTING_CRUMBS,
  ChartOfAccountCreateForm,
} from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Akun baru · Pengaturan · Buloo" };

export default function NewChartOfAccountPage() {
  return (
    <RequirePermission feature="chartOfAccounts" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            /*
              PENGATURAN IS A LABEL, NOT A LINK, because /dashboard/pengaturan
              has no page of its own — it is a nav group. A crumb that looked
              clickable and went nowhere would be worse than one that reads as
              the section it is.
            */
            items={[
              { label: "Pengaturan" },
              ACCOUNTING_CRUMBS.accounts,
              { label: "Akun baru" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Akun baru
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Akun baru bisa langsung dipakai sebagai tujuan posting begitu
            disimpan. Kodenya yang dipakai modul lain untuk menemukannya, jadi
            pilih nomor yang mengikuti pola daftar akun yang sudah ada.
            Kategorinya sudah ditentukan Buloo — itu yang menentukan di baris
            mana akun ini muncul di Laba Rugi atau Neraca, dan tipe akunnya
            mengikuti kategori itu.
          </p>
        </div>

        <ChartOfAccountCreateForm />
      </div>
    </RequirePermission>
  );
}
