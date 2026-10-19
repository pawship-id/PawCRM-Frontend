"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EllipsisVertical,
  Eye,
  Pencil,
  Power,
  PowerOff,
  Trash2,
  RotateCcw,
} from "lucide-react";

import { ApiError } from "@/services/api-error";
import { customerService } from "@/services/customer.service";
import { swalToast } from "@/lib/swal";
import {
  ConfirmDialog,
  DataTable,
  HighlightText,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Can, usePermissions } from "@/features/permissions";
import type { Customer, CustomerSort } from "@/types/api";

import {
  CustomerVipBadge,
  CustomerStatusBadge,
  isCustomerActive,
} from "./CustomerVipBadge";

/** The row action that opens a confirm dialog, plus the customer it targets. */
type PendingAction = {
  kind: "delete" | "restore" | "deactivate" | "activate";
  customer: Customer;
} | null;

/** "12 Jan 2025" — the mockup's Bergabung column, from `createdAt`. */
function joinedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * THE LIST SORTS FROM ITS COLUMN HEADERS (BO, 20 October 2026), on the server:
 * each sortable column maps to the two names CUSTOMER_SORTS knows for it, and a
 * click re-fetches page 1.
 *
 *   Kode      — the stored `code`, A first. A customer with no code yet sorts
 *               before every code ascending and after them descending (MongoDB
 *               orders `null` lowest); the backfill, not the sort, fixes that.
 *   Pelanggan — the stored `name`, A first.
 *   Bergabung — `createdAt`, the date the cell prints, NEWEST first on the first
 *               click — which is also the list's default ordering.
 *
 * Kontak, Kategori, Status and Aksi are plain: Kontak is two fields in one
 * cell, and Kategori and Status are labels the server could only order by the
 * id or flag behind them.
 */
const SORT_OPTIONS: SortOptions<CustomerSort> = {
  code: { asc: "codeAsc", desc: "codeDesc" },
  name: { asc: "nameAsc", desc: "nameDesc" },
  joined: { asc: "oldest", desc: "newest", first: "desc" },
};

/** Keeps a click on a control inside the row from also opening the row. */
const stop = (event: React.MouseEvent) => event.stopPropagation();

/**
 * The customer list table, in the shape the mockup draws (buloo-navigation-v3,
 * `pelangganDaftar`), rendered through the shared `DataTable` (ui-rules §10).
 *
 * THE ROW IS THE WAY IN. Clicking anywhere on it (or Enter on a focused row)
 * opens the profile — `DataTable`'s `onRowClick`. The NAME IS ALSO A REAL LINK,
 * and that is not redundancy — the row handler is a mouse affordance, while the
 * link is what a keyboard tabs to and what a screen reader announces as a
 * destination. The name link and the kebab STOP THEIR CLICKS, so opening the
 * menu or picking from it (React bubbles out of the menu's portal too) never
 * also navigates — the same stops `RowLinkMenu` carries. The confirm dialog is
 * rendered beside the table, not inside a row, so nothing in it can bubble into
 * one.
 *
 * EVERY COLUMN THE MOCKUP DRAWS IS REAL NOW (27 September 2026). Kategori is
 * `customerTypeName`, filed from Pengaturan › Tipe pelanggan — it arrives beside
 * its id on every row, so the table prints a word while the form edits a
 * reference. Kode is allocated by the shared counter when a customer is
 * registered.
 *
 * A DASH IN THE KODE CELL IS NOT A FAILED LOAD. Customers registered before the
 * series existed carry no code until `seeds/backfillCustomerCodes.js` has been
 * run against that deployment, and inventing one for them would look exactly
 * like a number the shop had printed on a card years ago.
 *
 * DELETE STAYS ON THE ROW, unlike the mockup, which moves it into the form. The
 * mockup is right that deleting is not list work, but the list is where somebody
 * clearing up duplicates does it, and taking a working button away to match a
 * drawing is a loss.
 *
 * NONAKTIFKAN / AKTIFKAN JOINED THE MENU (2 October 2026), the same two axes
 * `SuppliersTable` already has: Hapus/Pulihkan is the soft delete, its own
 * endpoints and its own permission; Nonaktifkan/Aktifkan is an ordinary
 * `isActive` patch gated on `customers:update` — the same grant Ubah already
 * needs — and only hides the customer from another module's picker (POS,
 * booking, the sales invoice form). A deleted row offers neither: restoring
 * first is what makes them meaningful again.
 *
 * THE MENU IS ITS OWN, NOT `RowLinkMenu`: that one draws its separator above
 * every action, and here Nonaktifkan belongs with the links while only Hapus is
 * set apart.
 *
 * Read data flows in via props (from useCustomers); the lifecycle actions (delete,
 * restore) are owned here because they are local to a row: each opens a
 * ConfirmDialog, calls the matching service method, and then asks the parent to
 * refetch via `onChanged`. Mirrors PetsTable.
 */
export function CustomersTable({
  customers,
  loading,
  onChanged,
  search,
  sort,
  onSortChange,
}: {
  customers: Customer[];
  loading: boolean;
  onChanged: () => void;
  /** Active search term, highlighted in the searchable cells (name, email, phone). */
  search?: string;
  /** The ordering the list is in now — a name from the server's CUSTOMER_SORTS. */
  sort: CustomerSort;
  onSortChange: (sort: CustomerSort) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  /*
    A LIVE ROW ALWAYS HAS ONE — Detail, which needs no grant beyond the
    `customers:read` this table already required (28 September 2026). Only a
    DELETED row can come up empty: there is no profile to open for one, so the
    column is worth drawing only if it can be restored.
  */
  const rowHasActions = (customer: Customer) =>
    customer.deletedAt === null || can("customers", "restore");
  const showActions = customers.some(rowHasActions);

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
      const { kind, customer } = pending;
      if (kind === "delete") await customerService.remove(customer._id);
      else if (kind === "restore") await customerService.restore(customer._id);
      else {
        // Deactivating is an ordinary field edit, not its own verb — see the
        // service. "activate" and "deactivate" differ only in the value sent,
        // the same shape SuppliersTable already uses for its own isActive.
        await customerService.update(customer._id, {
          isActive: kind === "activate",
        });
      }
      setPending(null);
      onChanged();
      swalToast(TOASTS[kind](customer.name));
    } catch (error) {
      // `reason` first — deleting a customer that still has pets is refused with
      // a 409 whose message is only the headline; the count of what is in the way
      // is in `reason`. See CustomerEditForm's DangerSection.
      setActionError(
        error instanceof ApiError
          ? (error.reason ?? error.message)
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  const columns: DataTableColumn<Customer>[] = [
    {
      id: "code",
      header: "Kode",
      cell: (customer) =>
        customer.code ? (
          // tabular-nums, never font-mono — ui-rules §5. Keeps the column from
          // shifting as the digits differ in width.
          <span className="tabular-nums text-muted">
            <HighlightText text={customer.code} query={search} />
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      id: "name",
      header: "Pelanggan",
      cell: (customer) => (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/dashboard/master/customers/${customer._id}`}
            onClick={stop}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            <HighlightText text={customer.name} query={search} />
          </Link>
          {/*
            A COMPANY SAYS SO BESIDE ITS NAME, which is where the mockup puts it
            and where it is useful: "Toko Hewan Mitra Jaya" reads as a shop
            either way, but plenty of companies are registered under a person's
            name. Individuals get no badge — a label on 95% of the rows is noise.
          */}
          {customer.kind === "company" && (
            <Badge
              variant="outline"
              className="border-transparent bg-tint-warning text-warning"
            >
              Perusahaan
            </Badge>
          )}
          {/*
            THE TIER RIDES WITH THE NAME, where the mockup puts the membership
            chip. It is a property of the person rather than a column, and most
            customers have none — a column of dashes for the sake of one badge.
          */}
          {customer.vipTier && <CustomerVipBadge tier={customer.vipTier} />}
        </div>
      ),
    },
    {
      id: "contact",
      header: "Kontak",
      cell: (customer) => (
        <>
          {/*
            PHONE ABOVE EMAIL, both in one cell, as the mockup has it: this is a
            shop that rings and WhatsApps people, so the number is the contact
            and the address is the footnote. tabular-nums keeps the digits from
            dancing between rows.
          */}
          <div className="tabular-nums text-foreground">
            {customer.phone ? (
              <HighlightText text={customer.phone} query={search} />
            ) : (
              <span className="text-muted">—</span>
            )}
          </div>
          <div className="text-xs text-muted">
            {customer.email ? (
              <HighlightText text={customer.email} query={search} />
            ) : (
              "—"
            )}
          </div>
        </>
      ),
    },
    {
      id: "category",
      header: "Kategori",
      cell: (customer) =>
        customer.customerTypeName ? (
          <Badge
            variant="outline"
            className="border-transparent bg-tint-info text-info"
          >
            {customer.customerTypeName}
          </Badge>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: (customer) => (
        <CustomerStatusBadge
          isActive={customer.isActive}
          deleted={customer.deletedAt !== null}
        />
      ),
    },
    {
      id: "joined",
      header: "Bergabung",
      cellClassName: "whitespace-nowrap text-muted tabular-nums",
      cell: (customer) => joinedOn(customer.createdAt),
    },
  ];

  if (showActions) {
    columns.push({
      id: "actions",
      header: "Aksi",
      align: "right",
      cell: (customer) => {
        const deleted = customer.deletedAt !== null;
        const active = isCustomerActive(customer);
        /*
          ONE KEBAB PER ROW (28 September 2026, on request), matching
          BranchesTable and PetOptionsTable. DETAIL IS UNGATED beyond the
          `customers:read` this table already required, so a reader opens the
          menu and finds exactly one row rather than a button opening onto
          nothing.

          ⚠️ CHAT IS NOT HERE, and deliberately: it lives on the profile alone
          (on request). It was the one action in this cell that left the app
          entirely, and putting it a keystroke away from Hapus in a menu is
          worse than having it as its own icon.
        */
        return (
          <div className="flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="size-9"
                  disabled={busy}
                  onClick={stop}
                  // Names the row: twenty identical "Aksi" buttons tell a
                  // screen reader nothing.
                  aria-label={`Aksi untuk ${customer.name}`}
                >
                  <EllipsisVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" onClick={stop}>
                {deleted ? (
                  /*
                    A DELETED CUSTOMER HAS NO PROFILE to open and nothing to
                    edit — restoring is the only move left, so it is the only
                    row here.
                  */
                  <Can feature="customers" action="restore">
                    <DropdownMenuItem
                      onSelect={() => setPending({ kind: "restore", customer })}
                    >
                      <RotateCcw />
                      Pulihkan
                    </DropdownMenuItem>
                  </Can>
                ) : (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/master/customers/${customer._id}`}>
                        <Eye />
                        Detail
                      </Link>
                    </DropdownMenuItem>
                    <Can feature="customers" action="update">
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/dashboard/master/customers/${customer._id}/edit`}
                        >
                          <Pencil />
                          Ubah
                        </Link>
                      </DropdownMenuItem>
                    </Can>
                    <Can feature="customers" action="update">
                      <DropdownMenuItem
                        onSelect={() =>
                          setPending({
                            kind: active ? "deactivate" : "activate",
                            customer,
                          })
                        }
                      >
                        {active ? <PowerOff /> : <Power />}
                        {active ? "Nonaktifkan" : "Aktifkan"}
                      </DropdownMenuItem>
                    </Can>
                    <Can feature="customers" action="delete">
                      {/* Separated and tinted: deleting is the one item here
                          that is not a toggle, and it sits next to one that
                          looks like it does the same thing — the same
                          separator SuppliersTable draws for the same reason. */}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setPending({ kind: "delete", customer })}
                      >
                        <Trash2 />
                        Hapus
                      </DropdownMenuItem>
                    </Can>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    });
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={customers}
        rowKey={(customer) => customer._id}
        sort={{ value: sort, options: SORT_OPTIONS, onChange: onSortChange }}
        loading={loading}
        loadingLabel="Memuat daftar pelanggan…"
        onRowClick={(customer) =>
          router.push(`/dashboard/master/customers/${customer._id}`)
        }
        empty={
          <p className="py-10 text-center text-sm text-muted">
            Belum ada pelanggan yang cocok dengan filter ini.
          </p>
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
          {DIALOGS[pending.kind].body(pending.customer.name)}
        </ConfirmDialog>
      )}
    </>
  );
}

const TOASTS: Record<NonNullable<PendingAction>["kind"], (name: string) => string> =
  {
    delete: (name) => `${name} dihapus.`,
    restore: (name) => `${name} dipulihkan.`,
    deactivate: (name) => `${name} dinonaktifkan.`,
    activate: (name) => `${name} diaktifkan lagi.`,
  };

/**
 * Each dialog says what will happen, not just what the row will look like —
 * the difference between deactivating and deleting a customer is invisible
 * in the list (both make them stop appearing as a picker option), so the
 * wording is the only thing that tells a user which one they are about to
 * do. Mirrors SuppliersTable's own DIALOGS map.
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
    title: "Hapus pelanggan",
    confirmLabel: "Hapus",
    body: (name) => (
      <>
        Hapus <strong>{name}</strong>? Datanya disembunyikan dari daftar dan
        emailnya bebas dipakai lagi. Bisa dipulihkan nanti.
      </>
    ),
  },
  restore: {
    title: "Pulihkan pelanggan",
    confirmLabel: "Pulihkan",
    body: (name) => (
      <>
        Pulihkan <strong>{name}</strong>? Ini gagal kalau emailnya sudah
        dipakai pelanggan lain.
      </>
    ),
  },
  deactivate: {
    title: "Nonaktifkan pelanggan",
    confirmLabel: "Nonaktifkan",
    body: (name) => (
      <>
        Nonaktifkan <strong>{name}</strong>? Pelanggan ini tidak akan muncul
        lagi sebagai pilihan di kasir, booking, atau faktur penjualan.
        Datanya dan riwayatnya tidak dihapus, dan bisa diaktifkan lagi kapan
        saja.
      </>
    ),
  },
  activate: {
    title: "Aktifkan pelanggan",
    confirmLabel: "Aktifkan",
    body: (name) => (
      <>
        Aktifkan <strong>{name}</strong> lagi? Pelanggan ini akan muncul
        kembali sebagai pilihan di kasir, booking, dan faktur penjualan.
      </>
    ),
  },
};
