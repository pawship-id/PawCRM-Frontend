import type { Metadata } from "next";
import { History } from "lucide-react";

import { CustomerModulePlaceholder } from "@/features/customers";

export const metadata: Metadata = {
  title: "Riwayat · Pelanggan · Buloo",
};

/** The Riwayat tab. Ungated for the same reason Membership is. */
export default function CustomerHistoryPage() {
  return (
    <CustomerModulePlaceholder
      title="Riwayat"
      note="Kunjungan, booking, dan transaksi seluruh pelanggan dalam satu urutan waktu. Untuk sekarang, riwayat per hewan ada di profil hewannya."
      icon={History}
    />
  );
}
