import { permanentRedirect } from "next/navigation";

/** The create form, at its new address under Kas & Bank. See ../page.tsx. */
export default function LegacyNewCashTransactionPage() {
  permanentRedirect("/dashboard/keuangan/kas-bank/transaksi/new");
}
