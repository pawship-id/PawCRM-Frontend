"use client";

import Link from "next/link";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/permissions";
// Not from `@/components` — `PageHeading` is still a purchasing-local component
// awaiting promotion (ui-rules §15).
import { PageHeading } from "@/features/purchasing";

import { useFixedCost } from "../hooks/useFixedCost";
import { FIXED_COSTS_HREF } from "../labels";
import { FixedCostForm } from "./FixedCostForm";

/**
 * UBAH BIAYA TETAP, reached at `/kas-bank/transaksi/:id/edit`.
 *
 * ONE EDIT URL FOR BOTH DOCUMENTS (21 September 2026, on request). The route
 * renders `CashTransactionEditScreen` first; when that id turns out not to be a
 * transaction, this takes its place. The two live in different collections and
 * their ids are indistinguishable, so trying one and then the other is what
 * makes a single URL possible at all.
 *
 * THE GRANT IS CHECKED HERE, NOT ON THE ROUTE, and it has to be: the route
 * cannot know which document it is about until one of the two fetches answers,
 * and gating it on `cashTransactions:update` would lock out somebody who may
 * edit schedules and not transactions.
 */
export function FixedCostEditScreen({ id }: { id: string }) {
  const { can } = usePermissions();
  const { fixedCost, loading, error } = useFixedCost(id);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat…
      </div>
    );
  }

  /*
    NOT FOUND IN EITHER COLLECTION — this is the end of the line, so the message
    names both rather than only the one that happened to be tried last.
  */
  if (error || !fixedCost) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <p className="font-medium text-foreground">
          Transaksi atau biaya tetap ini tidak ditemukan.
        </p>
        <Button variant="secondary" asChild>
          <Link href={FIXED_COSTS_HREF}>← Semua biaya tetap</Link>
        </Button>
      </div>
    );
  }

  if (!can("fixedCosts", "update")) {
    return (
      <Alert variant="error">
        Kamu belum punya akses untuk mengubah biaya tetap. Minta admin
        menambahkan izinnya.
      </Alert>
    );
  }

  return (
    <>
      {/* BARE TEXT, not a <p>: `PageHeading` wraps its children in one already. */}
      <PageHeading
        crumbs={[
          { label: "Keuangan", href: "/dashboard/keuangan" },
          { label: "Kas & Bank", href: "/dashboard/keuangan/kas-bank" },
          { label: "Biaya Tetap", href: FIXED_COSTS_HREF },
          { label: fixedCost.name },
        ]}
        title={`Ubah ${fixedCost.name}`}
      >
        Mengubah jadwal ini tidak menyentuh transaksi yang sudah dicatat
        darinya — itu uang yang benar-benar bergerak.
      </PageHeading>
      <div className="mt-5">
        <FixedCostForm fixedCost={fixedCost} />
      </div>
    </>
  );
}
