import type { Metadata } from "next";
import { CustomersScreen } from "@/features/customers";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Customer · Master Data · Buloo",
};

export default function MasterCustomersPage() {
  return (
    <RequirePermission feature="customers">
      <CustomersScreen />
    </RequirePermission>
  );
}
