import type { Metadata } from "next";
import { ServiceForm } from "@/features/services";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Layanan baru · Pengaturan · Buloo",
};

/*
  THE SAME ADDRESS FROM EVERYWHERE (22 September 2026), no query. Which module
  opened it — the Kelompok layanan to start on, the list to return to — or that
  it is "Tambah add-on", is left in the tab by `ServiceFormLink`.
*/
export default function NewServicePage() {
  return (
    <RequirePermission feature="services" action="create">
      <ServiceForm />
    </RequirePermission>
  );
}
