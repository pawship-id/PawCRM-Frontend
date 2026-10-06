import type { Metadata } from "next";

import { CashBankOpeningScreen } from "@/features/settings";

export const metadata: Metadata = {
  title: "Saldo Awal Kas & Bank · Data Awal · Buloo",
};

/**
 * Ungated like the Data Awal page it hangs under: the screen reads
 * `openingBalances:read` itself and says so where the reader holds none.
 */
export default function CashBankOpeningPage() {
  return <CashBankOpeningScreen />;
}
