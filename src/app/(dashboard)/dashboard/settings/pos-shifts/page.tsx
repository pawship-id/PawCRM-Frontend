import type { Metadata } from "next";
import { CashierShiftsScreen } from "@/features/settings";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Shift Kasir · Pengaturan · Buloo",
};

export default function CashierShiftsPage() {
  return (
    <RequirePermission feature="posShifts">
      <CashierShiftsScreen />
    </RequirePermission>
  );
}
