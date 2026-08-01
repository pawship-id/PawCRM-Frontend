import type { Metadata } from "next";
import Link from "next/link";

import { ProductForm } from "@/features/inventory";

export const metadata: Metadata = { title: "Produk baru · PawShip" };

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/dashboard/inventory/products"
          className="text-xs text-muted hover:text-foreground"
        >
          ← Produk &amp; Varian
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Produk baru
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pilih bentuknya dulu: produk biasa, produk yang punya varian, atau
          bundle. Bentuk ini dikunci setelah produk dibuat.
        </p>
      </div>

      <ProductForm />
    </div>
  );
}
