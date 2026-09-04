import type { Metadata } from "next";

import { CategoriesScreen } from "@/features/categories";

export const metadata: Metadata = { title: "Kategori · Buloo" };

export default function CategoriesPage() {
  return <CategoriesScreen />;
}
