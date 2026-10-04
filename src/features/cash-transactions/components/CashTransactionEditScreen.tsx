"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert, Breadcrumb, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { ACCOUNTING_CRUMBS } from "@/features/accounting";
import { usePermissions } from "@/features/permissions";

import { useCashTransaction } from "../hooks/useCashTransaction";
import {
  CASH_TRANSACTIONS_HREF,
  cashTransactionHref,
  directionTitle,
  kindLabel,
} from "../labels";
import { CashTransactionEditForm } from "./CashTransactionEditDialog";

/**
 * UBAH TRANSAKSI — a page, not a dialog, on request (20 September 2026).
 *
 * WHY IT EARNED ONE. An expense's editor is a document: a header of eight
 * fields and a row table that can run to twenty accounts, with a reason field
 * under it. That was already spilling past a dialog's height on a laptop, and a
 * form somebody scrolls inside a scrolling overlay is a form where the buttons
 * are never where the eye expects them.
 *
 * THE FORM IS THE SAME CODE the dialog renders (`chrome="page"`); only the
 * chrome differs. The dialog survives for the invoice's payment page, where the
 * edit is a step inside a different document's journey and bouncing out to Kas
 * & Bank would lose the invoice being read.
 *
 * SAVING RETURNS TO THE TRANSACTION, not to the list: an edit is checked against
 * the thing it changed, and the detail page is where the new journal links are.
 */
export function CashTransactionEditScreen({
  transactionId,
  onNotFound,
}: {
  transactionId: string;
  /**
   * CALLED WHEN THE ID IS NOT A TRANSACTION — how `/transaksi/:id/edit` serves
   * fixed costs too (21 September 2026, on request: one edit URL for both).
   *
   * THE PROBE IS THIS SCREEN'S OWN FETCH, not an extra one before it. Editing a
   * transaction is the common case and pays nothing for the merge; only a fixed
   * cost costs a second request, and the first was going to be made anyway.
   *
   * With a handler the "tidak ditemukan" panel is suppressed and the spinner
   * stays up, because the caller is about to swap this screen out — a flash of
   * "Transaksi tidak ditemukan" before a fixed cost renders would be a lie.
   */
  onNotFound?: () => void;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const { transaction, loading, error, notFound, refetch } =
    useCashTransaction(transactionId);

  useEffect(() => {
    if (notFound) onNotFound?.();
  }, [notFound, onNotFound]);

  const detailHref = cashTransactionHref(transactionId);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat transaksi…
      </div>
    );
  }

  if (notFound) {
    if (onNotFound) {
      return (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat…
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center">
        <p className="font-medium text-foreground">Transaksi tidak ditemukan.</p>
        <Button variant="secondary" asChild>
          <Link href={CASH_TRANSACTIONS_HREF}>← Semua transaksi</Link>
        </Button>
      </div>
    );
  }

  if (error || !transaction) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="error">
          {error ?? "Gagal memuat transaksi. Coba lagi."}
        </Alert>
        <div>
          <Button variant="secondary" onClick={refetch}>
            Coba lagi
          </Button>
        </div>
      </div>
    );
  }

  /*
    THE GRANT IS CHECKED HERE, NOT ON THE ROUTE, since `/transaksi/:id/edit`
    began serving fixed costs too (21 September 2026): the route cannot know
    which document it is about until this fetch answers, so gating it on
    `cashTransactions:update` would have locked out somebody who may edit
    schedules and not transactions.

    AFTER `notFound`, and that order is load-bearing. A fixed cost's id reaches
    this screen first and must fall through to the fixed cost editor — telling
    its owner they lack a transaction grant would refuse them a document that is
    not a transaction.
  */
  if (!can("cashTransactions", "update")) {
    return (
      <Alert variant="error">
        Kamu belum punya akses untuk mengubah transaksi. Minta admin
        menambahkan izinnya.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            ACCOUNTING_CRUMBS.hub,
            ACCOUNTING_CRUMBS.cashBank,
            { label: "Transaksi", href: ACCOUNTING_CRUMBS.cashBank.href },
            { label: directionTitle(transaction), href: detailHref },
            { label: "Ubah" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground tabular-nums">
          Ubah {directionTitle(transaction).toLowerCase()}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {kindLabel(transaction.kind)}
        </p>
      </div>

      <Card>
        <CashTransactionEditForm
          // Remounted when the stored version moves under it — a save elsewhere
          // must not leave this form editing a draft of the old one.
          key={`${transaction._id}-${transaction.updatedAt}`}
          transaction={transaction}
          chrome="page"
          onClose={() => router.push(detailHref)}
          onSaved={() => router.push(detailHref)}
        />
      </Card>
    </div>
  );
}
