import type { Metadata } from "next";

import { CategoriesScreen } from "@/features/categories";

export const metadata: Metadata = { title: "Kategori · PawShip" };

export default function CategoriesPage() {
  return <CategoriesScreen />;
}
