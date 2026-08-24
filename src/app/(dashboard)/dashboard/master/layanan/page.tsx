import type { Metadata } from "next";
import { ServicesScreen } from "@/features/services";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Layanan · Master Data · Buloo",
};

export default function MasterServicesPage() {
  return (
    <RequirePermission feature="services">
      <ServicesScreen />
    </RequirePermission>
  );
}
