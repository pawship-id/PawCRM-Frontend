import type { Metadata } from "next";
import { ServiceForm } from "@/features/services";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Layanan baru · Master Data · Buloo",
};

export default function NewServicePage() {
  return (
    <RequirePermission feature="services" action="create">
      <ServiceForm />
    </RequirePermission>
  );
}
