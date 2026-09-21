"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pause, Pencil, Play, Trash2 } from "lucide-react";

import { Alert, Card, ConfirmDialog } from "@/components";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CASH_TRANSACTION_DETAIL_HREF,
  cashTransactionHref,
} from "@/features/cash-transactions";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { fixedCostService } from "@/services/fixedCost.service";
import type { FixedCost } from "@/types/accounting";
import { formatMoney } from "@/utils/decimal";

import {
  dueLabel,
  FIXED_COSTS_HREF,
  INTERVAL_LABEL,
  KIND_LABEL,
  formatDate,
} from "../labels";
import { PostOccurrenceDialog } from "./PostOccurrenceDialog";

/**
 * ONE FIXED COST — what it is, when it next falls due, and what it has already
 * produced.
 *
 * NOT IN THE MOCKUP. Its Biaya Tetap table has no clickable row and no row
 * action at all, so there is nothing to follow; this page takes the shape the
 * transaction detail beside it already uses — heading with the figure and the
 * status, Ubah next to a ≡ menu, then the facts in cards.
 *
 * THE ≡ MENU CARRIES WHAT THIS DOCUMENT CAN HONOUR, and here that is more than
 * a transaction's: a template has no journal entry behind it, so **Hapus** is a
 * real and safe act. What it never touches is the transactions it has already
 * posted — those were money, and money does not become un-moved because the
 * arrangement behind it ended.
 */
export function FixedCostDetail({ fixedCost }: { fixedCost: FixedCost }) {
  const router = useRouter();

  const [posting, setPosting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paused = !fixedCost.isActive;
  const masuk = fixedCost.direction === "in";
  const due = dueLabel(fixedCost);

  /*
    ONLY THE REQUEST IS INSIDE THE `try`, and that is not tidiness.

    Everything after it — the toast, the redirect — runs because the server
    already said yes. Wrapped in the same `catch`, a hiccup in any of them would
    report "Gagal menghapus" for a delete that SUCCEEDED, and leave somebody
    looking at a page for a record that no longer exists. A failure to announce
    a result is not a failure to produce one.
  */
  async function setActive(isActive: boolean) {
    setBusy(true);
    setError(null);

    try {
      await fixedCostService.update(fixedCost._id, { isActive });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Gagal mengubah status. Coba lagi.",
      );
      setBusy(false);
      return;
    }

    setBusy(false);
    swalToast(isActive ? "Biaya tetap diaktifkan." : "Biaya tetap dijeda.");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError(null);

    try {
      await fixedCostService.remove(fixedCost._id);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Gagal menghapus biaya tetap. Coba lagi.",
      );
      setBusy(false);
      return;
    }

    swalToast(`${fixedCost.name} dihapus.`);
    router.push(FIXED_COSTS_HREF);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold">{fixedCost.name}</h1>
            {/*
              THE STATUS STAYS IN THE HEADING. A paused schedule whose page
              looks ordinary is the one mistake this screen cannot afford —
              somebody would read a due date that nothing is going to honour.
            */}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                paused
                  ? "bg-tint-neutral text-muted"
                  : "bg-tint-success text-success",
              )}
            >
              {paused ? "Nonaktif" : "Aktif"}
            </span>
            {due && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  due.tone === "danger"
                    ? "bg-tint-danger text-danger-ink"
                    : "bg-tint-warning text-warning",
                )}
              >
                {due.text}
              </span>
            )}
          </div>
          <p
            className={cn(
              "mt-1 text-base font-bold tabular-nums",
              masuk && !paused && "text-success",
              paused && "text-muted",
            )}
          >
            {formatMoney(fixedCost.amount)}{" "}
            <span className="text-sm font-medium text-muted">
              · {INTERVAL_LABEL[fixedCost.interval].toLowerCase()}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/*
            CATAT SITS HERE TOO, and only while something is due — the same rule
            the list follows. A schedule opened because its badge said "3×
            belum dicatat" should not send somebody back to the list to act.
          */}
          {!paused && fixedCost.dueCount > 0 && (
            <Can feature="fixedCosts" action="post">
              <Button size="sm" onClick={() => setPosting(true)}>
                Catat
              </Button>
            </Can>
          )}

          <Can feature="fixedCosts" action="update">
            <Button variant="secondary" size="sm" asChild>
              {/* ONE EDIT URL FOR BOTH DOCUMENTS — see the route for why it
                  has to try rather than know. */}
              <Link
                href={`${CASH_TRANSACTION_DETAIL_HREF}/${fixedCost._id}/edit`}
              >
                <Pencil className="size-4" />
                Ubah
              </Link>
            </Button>
          </Can>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Tindakan lain"
                disabled={busy}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/*
                PAUSED RATHER THAN DELETED is the act somebody usually wants: a
                lease on hold, a subscription suspended for a quiet season. The
                row keeps its due date, so resuming it does not silently skip
                what it missed.
              */}
              <Can feature="fixedCosts" action="update">
                <DropdownMenuItem onSelect={() => setActive(paused)}>
                  {paused ? (
                    <>
                      <Play className="size-4" />
                      Aktifkan lagi
                    </>
                  ) : (
                    <>
                      <Pause className="size-4" />
                      Jeda biaya tetap
                    </>
                  )}
                </DropdownMenuItem>
              </Can>
              <Can feature="fixedCosts" action="delete">
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-4" />
                  Hapus biaya tetap
                </DropdownMenuItem>
              </Can>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {paused && (
        <Alert variant="info">
          Dijeda — jatuh temponya tidak dihitung dan tidak bisa dicatat sampai
          diaktifkan lagi.
        </Alert>
      )}

      <Card title="Detail biaya tetap">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Field label="Tipe">{KIND_LABEL[fixedCost.kind]}</Field>
          <Field label="Pengulangan">{INTERVAL_LABEL[fixedCost.interval]}</Field>
          <Field label="Mulai">{formatDate(fixedCost.startDate)}</Field>
          <Field label="Jatuh tempo berikutnya">
            {formatDate(fixedCost.nextDueAt)}
          </Field>
          <Field label={masuk ? "Pengirim" : "Penerima"}>
            {fixedCost.partyName ?? "—"}
          </Field>
          <Field label="Akun Kas & Bank">{fixedCost.accountName ?? "—"}</Field>
          <Field label="Cabang">{fixedCost.branchName ?? "—"}</Field>
          <Field label="No. referensi">{fixedCost.ref ?? "—"}</Field>
          <Field label="Keterangan" className="sm:col-span-2">
            {fixedCost.note ?? "—"}
          </Field>
        </dl>
      </Card>

      <Card title="Rincian akun">
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Akun</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead className="text-right">Nilai</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fixedCost.lines.map((line, index) => {
                const account = fixedCost.counterAccounts.find(
                  (row) => row.id === line.accountId,
                );
                return (
                  <TableRow key={`${line.accountId}-${index}`}>
                    <TableCell className="px-4 py-2.5 text-sm">
                      {account ? `${account.code} · ${account.name}` : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-sm">
                      {line.memo ?? "—"}
                    </TableCell>
                    <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums">
                      {formatMoney(line.amount)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={2}
                  className="px-4 py-2.5 text-right text-xs font-semibold tracking-widest text-muted uppercase"
                >
                  Total
                </TableCell>
                <TableCell className="px-4 py-2.5 text-right text-sm font-bold tabular-nums">
                  {formatMoney(fixedCost.amount)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/*
        WHAT IT HAS ACTUALLY PRODUCED. The count is the schedule's own record of
        money that moved, and the link is the proof — a template's claim to have
        been paid is worth exactly as much as the transaction behind it.
      */}
      <Card title="Riwayat">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <Field label="Sudah dicatat">
            {fixedCost.postedCount === 0
              ? "Belum pernah"
              : `${fixedCost.postedCount}×`}
          </Field>
          <Field label="Terakhir dicatat">
            {fixedCost.lastPostedAt ? formatDate(fixedCost.lastPostedAt) : "—"}
          </Field>
          <Field label="Transaksi terakhir" className="sm:col-span-2">
            {fixedCost.lastTransactionId ? (
              <Link
                href={cashTransactionHref(fixedCost.lastTransactionId)}
                className="rounded-md font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                Buka transaksinya →
              </Link>
            ) : (
              "—"
            )}
          </Field>
        </dl>
      </Card>

      <PostOccurrenceDialog
        fixedCost={posting ? fixedCost : null}
        onClose={() => setPosting(false)}
        onPosted={() => router.refresh()}
      />

      {/* Rendered only while the act is pending — the component is always open
          and `onCancel` is how it shuts. */}
      {confirmDelete && (
        <ConfirmDialog
          title={`Hapus ${fixedCost.name}?`}
          confirmLabel="Hapus"
          destructive
          busy={busy}
          error={error}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        >
          {fixedCost.postedCount > 0
            ? `Jadwalnya hilang dari daftar. ${fixedCost.postedCount} transaksi yang sudah dicatat dari sini TIDAK ikut terhapus — itu uang yang benar-benar bergerak.`
            : "Jadwalnya hilang dari daftar. Belum ada transaksi yang dicatat dari sini."}
        </ConfirmDialog>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium tracking-widest text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-foreground">{children}</dd>
    </div>
  );
}
