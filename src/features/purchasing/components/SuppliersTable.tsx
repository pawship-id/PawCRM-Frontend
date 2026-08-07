"use client";

import { useState } from "react";
import Link from "next/link";
import {
  EllipsisVertical,
  Pencil,
  Power,
  PowerOff,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { ApiError } from "@/services/api-error";
import { supplierService } from "@/services/supplier.service";
import { swalToast } from "@/lib/swal";
import { ConfirmDialog, HighlightText } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatMoney, toMinor } from "@/utils/decimal";
import { Can, usePermissions } from "@/features/permissions";
import { isSupplierActive } from "@/types/api";
import type { Supplier, SupplierOutstandingRow } from "@/types/api";
import type { SupplierPurchaseRow } from "@/types/api";

import { SupplierStatusBadge } from "./SupplierStatusBadge";
import { SupplierTypeBadge } from "./SupplierTypeBadge";

/** The row action awaiting confirmation, plus the supplier it targets. */
type PendingAction = {
  kind: "delete" | "restore" | "deactivate" | "activate";
  supplier: Supplier;
} | null;

/**
 * The supplier list table with its row actions.
 *
 * Read data flows in via props (from useSuppliers and useSupplierSummaries); the
 * lifecycle actions are owned here because each is local to a row: it opens a
 * ConfirmDialog, calls the matching service method, then asks the parent to
 * refetch. Mirrors CustomersTable.
 *
 * FOUR ACTIONS ON TWO AXES, which is what a supplier needs and a customer does
 * not:
 *   Nonaktifkan / Aktifkan — stop or resume buying. An ordinary `isActive` patch,
 *                            so it needs `suppliers:update`.
 *   Hapus / Pulihkan       — the soft delete, its own endpoints and its own
 *                            permissions.
 * A deleted row offers only Pulihkan: restoring first is what makes the other
 * three meaningful again.
 *
 * THEY LIVE BEHIND A KEBAB MENU rather than sitting inline, unlike the
 * master-data tables. Three buttons per row is what pushed the columns this
 * screen exists for — the terms and what is owed — off the right edge on a
 * laptop, and the actions are the part a user reaches for least. The trigger is
 * still one click; what it costs is a second click for the action, and what it
 * buys is that the numbers are readable without scrolling sideways.
 *
 * THE OUTSTANDING COLUMN IS THE POINT of this screen. Without it this is an
 * address book; with it, it is what somebody opens before deciding who to pay
 * this week. It is summed server-side over every unpaid invoice, so it cannot
 * drift from what the payables screen says.
 */
export function SuppliersTable({
  suppliers,
  outstanding,
  purchases,
  loading,
  onChanged,
  search,
}: {
  suppliers: Supplier[];
  outstanding: Map<string, SupplierOutstandingRow>;
  purchases: Map<string, SupplierPurchaseRow>;
  loading: boolean;
  onChanged: () => void;
  /** Active search term, highlighted in the searchable cells. */
  search?: string;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  // Show the Actions column only when at least one CURRENTLY-LISTED row would
  // render a button — so a restore-only role sees the column while "show
  // deleted" is on but not while it is off. Mirrors the per-button gating below.
  const rowHasActions = (supplier: Supplier) =>
    supplier.deletedAt !== null
      ? can("suppliers", "restore")
      : can("suppliers", "update") || can("suppliers", "delete");
  const showActions = suppliers.some(rowHasActions);

  function closeDialog() {
    if (busy) return;
    setPending(null);
    setActionError(null);
  }

  async function runAction() {
    if (!pending) return;
    setBusy(true);
    setActionError(null);
    try {
      const { kind, supplier } = pending;

      if (kind === "delete") await supplierService.remove(supplier._id);
      else if (kind === "restore") await supplierService.restore(supplier._id);
      else {
        // Deactivating is an ordinary field edit, not its own verb — see the
        // service. `activate` and `deactivate` differ only in the value sent.
        await supplierService.update(supplier._id, {
          isActive: kind === "activate",
        });
      }

      setPending(null);
      onChanged();
      swalToast(TOASTS[kind](supplier.name));
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.fullMessage
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loading && suppliers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        Tidak ada supplier yang cocok dengan filter ini.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>Kontak</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead className="text-right">Termin</TableHead>
              <TableHead className="text-right">Penerimaan</TableHead>
              <TableHead className="text-right">Sisa utang</TableHead>
              {showActions && (
                <TableHead className="text-right">Aksi</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.map((supplier) => {
              const deleted = supplier.deletedAt !== null;
              const active = isSupplierActive(supplier);
              // A supplier absent from the summary owes nothing / has received
              // nothing — the API returns no row rather than a row of zeros.
              const owed = outstanding.get(supplier._id)?.outstanding ?? "0";
              const owedMinor = toMinor(owed) ?? 0n;
              const receiptCount =
                purchases.get(supplier._id)?.receiptCount ?? 0;

              return (
                <TableRow
                  key={supplier._id}
                  className={cn((deleted || !active) && "opacity-60")}
                >
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/purchasing/suppliers/${supplier._id}`}
                        className="font-medium text-foreground hover:text-primary-hover hover:underline"
                      >
                        <HighlightText text={supplier.name} query={search} />
                      </Link>
                      <SupplierStatusBadge supplier={supplier} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {supplier.npwp ? (
                        <HighlightText text={supplier.npwp} query={search} />
                      ) : (
                        (supplier.address ?? "—")
                      )}
                    </p>
                  </TableCell>

                  <TableCell className="text-xs">
                    <p className="text-foreground">
                      {supplier.pic ? (
                        <HighlightText text={supplier.pic} query={search} />
                      ) : (
                        "—"
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      {supplier.phone ? (
                        <HighlightText text={supplier.phone} query={search} />
                      ) : (
                        ""
                      )}
                    </p>
                  </TableCell>

                  <TableCell>
                    <SupplierTypeBadge type={supplier.type} />
                  </TableCell>

                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {supplier.paymentTermDays} hari
                  </TableCell>

                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {receiptCount}
                  </TableCell>

                  <TableCell
                    className={cn(
                      "text-right font-mono text-sm tabular-nums",
                      owedMinor > 0n && "font-semibold text-danger",
                    )}
                  >
                    {owedMinor > 0n ? formatMoney(owed) : "—"}
                  </TableCell>

                  {showActions && (
                    <TableCell>
                      <div className="flex items-center justify-end">
                        {/* Rendered per row rather than once, because WHICH
                            actions exist depends on the row's state and the
                            role — a menu that opens onto nothing is worse than
                            no menu, so the trigger only appears when the row
                            actually has something to offer. */}
                        {rowHasActions(supplier) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                // The icon alone carries no name, so the label
                                // says which row this menu belongs to — a
                                // screen-reader user hearing twenty identical
                                // "Aksi" buttons has learnt nothing.
                                aria-label={`Aksi untuk ${supplier.name}`}
                              >
                                <EllipsisVertical className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent>
                              {deleted ? (
                                <Can feature="suppliers" action="restore">
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setPending({ kind: "restore", supplier })
                                    }
                                  >
                                    <RotateCcw />
                                    Pulihkan
                                  </DropdownMenuItem>
                                </Can>
                              ) : (
                                <>
                                  <Can feature="suppliers" action="update">
                                    <DropdownMenuItem asChild>
                                      <Link
                                        href={`/dashboard/purchasing/suppliers/${supplier._id}/edit`}
                                      >
                                        <Pencil />
                                        Ubah
                                      </Link>
                                    </DropdownMenuItem>
                                  </Can>
                                  <Can feature="suppliers" action="update">
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        setPending({
                                          kind: active
                                            ? "deactivate"
                                            : "activate",
                                          supplier,
                                        })
                                      }
                                    >
                                      {active ? <PowerOff /> : <Power />}
                                      {active ? "Nonaktifkan" : "Aktifkan"}
                                    </DropdownMenuItem>
                                  </Can>
                                  <Can feature="suppliers" action="delete">
                                    {/* Separated and tinted: deleting is the
                                        one item here that is not a toggle, and
                                        it sits next to one that looks like it
                                        does the same thing. */}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onSelect={() =>
                                        setPending({ kind: "delete", supplier })
                                      }
                                    >
                                      <Trash2 />
                                      Hapus
                                    </DropdownMenuItem>
                                  </Can>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pending && (
        <ConfirmDialog
          title={DIALOGS[pending.kind].title}
          confirmLabel={DIALOGS[pending.kind].confirmLabel}
          destructive={pending.kind === "delete"}
          busy={busy}
          error={actionError}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {DIALOGS[pending.kind].body(pending.supplier.name)}
        </ConfirmDialog>
      )}
    </>
  );
}

const TOASTS: Record<NonNullable<PendingAction>["kind"], (n: string) => string> =
  {
    delete: (name) => `${name} dihapus.`,
    restore: (name) => `${name} dipulihkan.`,
    deactivate: (name) => `${name} dinonaktifkan.`,
    activate: (name) => `${name} diaktifkan lagi.`,
  };

/**
 * Each dialog says what will happen to the DOCUMENTS, not just to the row. The
 * difference between deactivating and deleting a supplier is invisible in a list
 * — both make the vendor stop appearing — so the wording is the only thing that
 * tells a user which one they are about to do.
 */
const DIALOGS: Record<
  NonNullable<PendingAction>["kind"],
  {
    title: string;
    confirmLabel: string;
    body: (name: string) => React.ReactNode;
  }
> = {
  delete: {
    title: "Hapus supplier",
    confirmLabel: "Hapus",
    body: (name) => (
      <>
        Hapus <strong>{name}</strong>? Riwayat penerimaan dan fakturnya tetap
        utuh dan tetap menyebut supplier ini — hanya datanya yang disembunyikan
        dari daftar. Bisa dipulihkan lagi nanti.
      </>
    ),
  },
  restore: {
    title: "Pulihkan supplier",
    confirmLabel: "Pulihkan",
    body: (name) => (
      <>
        Pulihkan <strong>{name}</strong>? Bisa gagal jika nama atau NPWP-nya
        sudah dipakai supplier lain sejak dihapus.
      </>
    ),
  },
  deactivate: {
    title: "Nonaktifkan supplier",
    confirmLabel: "Nonaktifkan",
    body: (name) => (
      <>
        Nonaktifkan <strong>{name}</strong>? Supplier ini tidak akan muncul lagi
        saat membuat penerimaan barang, dan penerimaan baru atas namanya akan
        ditolak. Datanya tidak dihapus dan bisa diaktifkan lagi kapan saja.
      </>
    ),
  },
  activate: {
    title: "Aktifkan supplier",
    confirmLabel: "Aktifkan",
    body: (name) => (
      <>
        Aktifkan <strong>{name}</strong> lagi? Supplier ini akan muncul kembali
        saat membuat penerimaan barang.
      </>
    ),
  },
};
