"use client";

import { useState } from "react";
import Link from "next/link";
import {
  EllipsisVertical,
  Eye,
  Pencil,
  Power,
  PowerOff,
  RotateCcw,
  Trash2,
} from "lucide-react";

import { ApiError } from "@/services/api-error";
import { supplierService } from "@/services/supplier.service";
import { swalToast } from "@/lib/swal";
import {
  ConfirmDialog,
  DataTable,
  HighlightText,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { Button } from "@/components/ui/button";
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

import { formatSupplierAddress } from "../supplierAddress";
import type {
  Supplier,
  SupplierOutstandingRow,
  SupplierPurchaseRow,
  SupplierSort,
} from "@/types/api";

import { SupplierStatusBadge } from "./SupplierStatusBadge";
import { SupplierTypeBadge } from "./SupplierTypeBadge";

/** The row action awaiting confirmation, plus the supplier it targets. */
type PendingAction = {
  kind: "delete" | "restore" | "deactivate" | "activate";
  supplier: Supplier;
} | null;

/**
 * THE LIST SORTS FROM ITS COLUMN HEADERS (BO, 19 October 2026), on the server:
 * each sortable column maps to the two names SUPPLIER_SORTS knows for it, and a
 * click re-fetches page 1.
 *
 *   Supplier   — the name, A first.
 *   Termin     — the stored term, SHORTEST FIRST on the first click. Terms are
 *                read as "who wants paying soonest", so the short end is the end
 *                somebody scans from; the second click gives the longest.
 *   Penerimaan — the receipt count, most first.
 *   Sisa utang — the outstanding balance, largest first.
 *
 * Penerimaan and Sisa utang are summed by the server for those orderings only,
 * with the same definitions as the two summaries this table DISPLAYS them from
 * (useSupplierSummaries), so a header never ranks a row by a number other than
 * the one on it. Kontak, Tipe and Aksi are plain.
 */
const SORT_OPTIONS: SortOptions<SupplierSort> = {
  name: { asc: "nameAsc", desc: "nameDesc" },
  paymentTerm: { asc: "paymentTermAsc", desc: "paymentTermDesc" },
  receiptCount: {
    asc: "receiptCountAsc",
    desc: "receiptCountDesc",
    first: "desc",
  },
  outstanding: {
    asc: "outstandingAsc",
    desc: "outstandingDesc",
    first: "desc",
  },
};

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
 *
 * AND IT NOW SAYS WHEN, not only how much. One debt of ten million already a
 * month late and another falling due in June are the same number in a column and
 * completely different decisions; the split under the amount is what makes the
 * column answer "who do I pay first" rather than only "who do I owe". Both
 * figures come from the same aggregation as the total above them — a subset of
 * it, never a second opinion about it.
 */
export function SuppliersTable({
  suppliers,
  outstanding,
  purchases,
  horizonDays,
  loading,
  onChanged,
  search,
  sort,
  onSortChange,
  empty,
}: {
  suppliers: Supplier[];
  outstanding: Map<string, SupplierOutstandingRow>;
  purchases: Map<string, SupplierPurchaseRow>;
  /** The due-soon window the figures were cut at. Null until the summary lands. */
  horizonDays?: number | null;
  loading: boolean;
  onChanged: () => void;
  /** Active search term, highlighted in the searchable cells. */
  search?: string;
  /** The ordering the list is in — a SUPPLIER_SORTS name. */
  sort: SupplierSort;
  onSortChange: (sort: SupplierSort) => void;
  /** What the table says when there are no rows. */
  empty?: React.ReactNode;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  // Show the Actions column only when at least one CURRENTLY-LISTED row would
  // render a button — so a restore-only role sees the column while "show
  // deleted" is on but not while it is off. Mirrors the per-button gating below.
  //
  // "Lihat detail" needs no grant beyond the one that renders this list, so a
  // live row always has at least that. A DELETED row does not get it: the detail
  // endpoint reads live suppliers only, so the link would land on "tidak
  // ditemukan" — restoring first is what makes it reachable again.
  const rowHasActions = (supplier: Supplier) =>
    supplier.deletedAt !== null ? can("suppliers", "restore") : true;
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

  const columns: DataTableColumn<Supplier>[] = [
    {
      id: "name",
      header: "Supplier",
      cell: (supplier) => (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/purchasing/suppliers/${supplier._id}`}
              className="font-medium text-foreground hover:text-primary-hover hover:underline"
            >
              <HighlightText text={supplier.name} query={search} />
            </Link>
            <SupplierStatusBadge supplier={supplier} />
          </div>
          <p className="text-xs text-muted">
            {supplier.npwp ? (
              <HighlightText text={supplier.npwp} query={search} />
            ) : (
              // The address is parts now; the row wants one line.
              (formatSupplierAddress(supplier.address) ?? "—")
            )}
          </p>
        </>
      ),
    },
    {
      id: "contact",
      header: "Kontak",
      cellClassName: "text-xs",
      cell: (supplier) => (
        <>
          <p className="text-foreground">
            {supplier.pic?.name ? (
              <HighlightText text={supplier.pic.name} query={search} />
            ) : (
              "—"
            )}
          </p>
          <p className="text-muted">
            {supplier.phone ? (
              <HighlightText text={supplier.phone} query={search} />
            ) : (
              ""
            )}
          </p>
        </>
      ),
    },
    {
      id: "type",
      header: "Tipe",
      cell: (supplier) => <SupplierTypeBadge type={supplier.type} />,
    },
    {
      id: "paymentTerm",
      header: "Termin",
      align: "right",
      cellClassName: "text-xs",
      cell: (supplier) => `${supplier.paymentTermDays} hari`,
    },
    {
      id: "receiptCount",
      header: "Penerimaan",
      align: "right",
      cellClassName: "text-xs",
      // A supplier absent from the summary has received nothing — the API
      // returns no row rather than a row of zeros.
      cell: (supplier) => purchases.get(supplier._id)?.receiptCount ?? 0,
    },
    {
      id: "outstanding",
      header: "Sisa utang",
      align: "right",
      cell: (supplier) => {
        // Absent from the summary means owing nothing, as above.
        const debt = outstanding.get(supplier._id);
        const owed = debt?.outstanding ?? "0";
        const owedMinor = toMinor(owed) ?? 0n;
        const overdueMinor = toMinor(debt?.overdueOutstanding ?? "0") ?? 0n;
        const dueSoonMinor = toMinor(debt?.dueSoonOutstanding ?? "0") ?? 0n;

        return (
          <>
            <p
              className={cn(
                "text-sm",
                owedMinor > 0n && "font-semibold text-danger",
              )}
            >
              {owedMinor > 0n ? formatMoney(owed) : "—"}
            </p>
            {/* WHEN, under HOW MUCH — and only the halves that exist. A
                vendor owing nothing late this week gets no line at all rather
                than two zeros, which would read as data where there is none.
                Neither figure is computed here: both are subsets the server
                cut from the amount above at one instant. */}
            {overdueMinor > 0n && (
              <p className="text-xs text-danger">
                {formatMoney(debt!.overdueOutstanding)} lewat tempo
              </p>
            )}
            {dueSoonMinor > 0n && (
              <p className="text-xs text-muted">
                {formatMoney(debt!.dueSoonOutstanding)}
                {horizonDays == null
                  ? " jatuh tempo"
                  : ` ≤ ${horizonDays} hari`}
              </p>
            )}
          </>
        );
      },
    },
  ];

  if (showActions) {
    columns.push({
      id: "actions",
      header: "Aksi",
      align: "right",
      cell: (supplier) => {
        const deleted = supplier.deletedAt !== null;
        const active = isSupplierActive(supplier);

        return (
          <div className="flex items-center justify-end">
            {/* Rendered per row rather than once, because WHICH actions exist
                depends on the row's state and the role — a menu that opens
                onto nothing is worse than no menu, so the trigger only appears
                when the row actually has something to offer. */}
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
                      {/* Ungated, unlike everything below it: this
                      goes where the vendor's name already goes,
                      and seeing the row is the only grant it
                      needs. It is here as well as on the name
                      because the detail screen is where the
                      terms, the delivery history and the
                      consignment exposure live — the row shows
                      one figure of a position that has four. */}
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/dashboard/purchasing/suppliers/${supplier._id}`}
                        >
                          <Eye />
                          Lihat detail
                        </Link>
                      </DropdownMenuItem>
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
                              kind: active ? "deactivate" : "activate",
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
        );
      },
    });
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={suppliers}
        rowKey={(supplier) => supplier._id}
        sort={{ value: sort, options: SORT_OPTIONS, onChange: onSortChange }}
        loading={loading}
        loadingLabel="Memuat data supplier…"
        rowClassName={(supplier) =>
          (supplier.deletedAt !== null || !isSupplierActive(supplier)) &&
          "opacity-60"
        }
        empty={
          empty ?? (
            <p className="py-10 text-center text-sm text-muted">
              Tidak ada supplier yang cocok dengan filter ini.
            </p>
          )
        }
      />

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

const TOASTS: Record<
  NonNullable<PendingAction>["kind"],
  (n: string) => string
> = {
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
