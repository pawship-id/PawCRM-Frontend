"use client";

import Link from "next/link";

import { Card } from "@/components";
import { Badge } from "@/components/ui/badge";

import { SettingsPageHeader } from "./SettingsHeader";

/**
 * Pengaturan › Tipe supplier — what the two axes on a vendor MEAN
 * (23 September 2026).
 *
 * READ-ONLY, AND THAT IS THE FEATURE. The mockup draws an editable list, and
 * the one thing a tenant must not be able to do here is invent a third
 * cooperation type: `beli_putus` and `konsinyasi` are not labels, they decide
 * WHEN A DEBT IS RECORDED — an outright purchase owes the supplier the moment
 * the goods arrive, a consignment owes nothing until they sell. A type with no
 * rule behind it would be a vendor group that quietly posts nothing.
 *
 * SO THE PAGE ANSWERS THE QUESTION THE CARD ASKS instead: which types exist,
 * what each does to the books, and where they are set — on the supplier itself.
 * A shop that wants to GROUP its vendors already has Kategori Supplier, in
 * Pembelian, and the page says so rather than leaving somebody to find out.
 */
const COOPERATION = [
  {
    label: "Beli putus",
    badge: "b-navy" as const,
    what: "Barang jadi milik toko begitu diterima.",
    books:
      "Utang ke supplier tercatat saat penerimaan barang dibuat, dan dilunasi lewat faktur pembelian.",
  },
  {
    label: "Konsinyasi",
    badge: "b-orange" as const,
    what: "Barang dititipkan; yang tidak laku bisa dikembalikan.",
    books:
      "Penerimaan barang tidak mencatat utang sama sekali. Yang jadi kewajiban adalah barang yang sudah terjual.",
  },
  {
    label: "Keduanya",
    badge: "b-grey" as const,
    what: "Supplier yang menjual putus sekaligus menitipkan barang.",
    books:
      "Dipilih per penerimaan barang, bukan per supplier — yang menentukan pencatatan adalah pilihan di dokumen itu.",
  },
];

const ENTITY = [
  {
    label: "Perusahaan",
    what: "PT, CV, atau badan usaha lain.",
    books: "Dipakai di dokumen dan untuk memilah supplier ber-NPWP.",
  },
  {
    label: "Perorangan",
    what: "Supplier atas nama pribadi.",
    books: "Tidak mengubah pencatatan; hanya keterangan di profil supplier.",
  },
];

export function SupplierTypesScreen() {
  return (
    <div className="flex flex-col gap-6">
      <SettingsPageHeader
        tab="umum"
        title="Tipe supplier"
        description="Dua sumbu yang menempel di tiap supplier. Diatur di profil suppliernya masing-masing, bukan di sini — yang satu menentukan kapan utang tercatat, jadi daftarnya tidak bisa ditambah sendiri."
      />

      <Card
        title="Bentuk kerja sama"
        description="Menentukan kapan utang ke supplier tercatat. Dipilih di profil supplier, dan bisa ditimpa per penerimaan barang."
      >
        <ul className="divide-y divide-border">
          {COOPERATION.map((row) => (
            <li key={row.label} className="flex flex-col gap-1 py-3 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-foreground">
                  {row.label}
                </span>
                <Badge variant="outline">Bawaan sistem</Badge>
              </div>
              <p className="text-sm text-muted">{row.what}</p>
              <p className="text-sm text-foreground">{row.books}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Badan usaha"
        description="Keterangan di profil supplier. Tidak mengubah pencatatan."
      >
        <ul className="divide-y divide-border">
          {ENTITY.map((row) => (
            <li key={row.label} className="flex flex-col gap-1 py-3 first:pt-0">
              <span className="font-semibold text-foreground">{row.label}</span>
              <p className="text-sm text-muted">{row.what}</p>
              <p className="text-sm text-foreground">{row.books}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Mau mengelompokkan supplier?"
        description="Itu pertanyaan yang berbeda, dan daftarnya memang bisa diubah."
      >
        <p className="text-sm text-muted">
          Kelompok seperti Makanan, Perlengkapan, atau Obat diatur di{" "}
          <Link
            href="/dashboard/purchasing/supplier-categories"
            className="rounded font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Pembelian › Kategori Supplier
          </Link>
          , dan tenant boleh menambah sendiri sebanyak yang perlu.
        </p>
      </Card>
    </div>
  );
}
