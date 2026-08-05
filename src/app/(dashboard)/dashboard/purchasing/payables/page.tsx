import type { Metadata } from "next";

import { PayablesScreen } from "@/features/purchasing";

export const metadata: Metadata = { title: "Utang Supplier · PawShip" };

export default function PayablesPage() {
  return <PayablesScreen />;
}
