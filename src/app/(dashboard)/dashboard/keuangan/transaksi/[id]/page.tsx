import { permanentRedirect } from "next/navigation";

/** One transaction, at its new address under Kas & Bank. See ../page.tsx. */
export default async function LegacyCashTransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  permanentRedirect(`/dashboard/keuangan/kas-bank/transaksi/${id}`);
}
