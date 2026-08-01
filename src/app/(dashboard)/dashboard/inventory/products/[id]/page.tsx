import type { Metadata } from "next";
import Link from "next/link";

import { ProductForm } from "@/features/inventory";

export const metadata: Metadata = { title: "Edit produk · PawShip" };

/**
 * `params` is a Promise in this version of Next — awaited before use, matching
 * the other dynamic routes in the app (master/branches/[id] and friends).
 */
export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
          Edit produk
        </h1>
      </div>

      <ProductForm productId={id} />
    </div>
  );
}
