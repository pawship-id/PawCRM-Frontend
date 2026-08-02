import type { Metadata } from "next";

import { ReceiptsScreen } from "@/features/purchasing";

export const metadata: Metadata = { title: "Penerimaan Barang · PawShip" };

export default function ReceiptsPage() {
  return <ReceiptsScreen />;
}
