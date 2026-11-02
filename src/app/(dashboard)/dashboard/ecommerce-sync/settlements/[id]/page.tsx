import type { Metadata } from "next";

import { SettlementDetailScreen } from "@/features/ecommerce";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Pencairan · E-commerce · Buloo",
};

export const dynamic = "force-dynamic";

export default async function EcommerceSettlementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="ecommerce">
      <SettlementDetailScreen id={id} />
    </RequirePermission>
  );
}
