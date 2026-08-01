import type { Metadata } from "next";
import Link from "next/link";

import { OpnameSheet } from "@/features/inventory";

export const metadata: Metadata = { title: "Lembar opname · PawShip" };

export default async function OpnameSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/inventory/opname"
          className="text-xs text-muted hover:text-foreground"
        >
          ← Stok Opname
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Lembar penghitungan
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Isi jumlah fisik hasil hitungan. Angka sistem dan HPP sudah dikunci
          sejak lembar ini dibuka.
        </p>
      </div>

      <OpnameSheet opnameId={id} />
    </div>
  );
}
