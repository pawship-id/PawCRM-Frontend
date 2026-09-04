import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import {
  ACCOUNTING_CRUMBS,
  ChartOfAccountEditForm,
} from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Ubah akun · Buloo" };

export default async function EditChartOfAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="chartOfAccounts" action="update">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              ACCOUNTING_CRUMBS.hub,
              ACCOUNTING_CRUMBS.accounts,
              { label: "Ubah akun" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Ubah akun
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Perubahan langsung berlaku untuk semua jurnal yang menunjuk akun ini.
            Akun bawaan tetap bisa diganti nama dan dinonaktifkan — hanya kode
            dan tipenya yang dikunci.
          </p>
        </div>

        <ChartOfAccountEditForm accountId={id} />
      </div>
    </RequirePermission>
  );
}
