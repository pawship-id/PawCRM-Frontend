"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageCircle, Pencil, Trash2, RotateCcw } from "lucide-react";

import { ApiError } from "@/services/api-error";
import { customerService } from "@/services/customer.service";
import { swalToast } from "@/lib/swal";
import { ConfirmDialog, HighlightText } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can, usePermissions } from "@/features/permissions";
import type { Customer } from "@/types/api";
import { whatsAppLink } from "@/utils/phone";

import { CustomerVipBadge, CustomerStatusBadge } from "./CustomerVipBadge";

/** The row action that opens a confirm dialog, plus the customer it targets. */
type PendingAction = { kind: "delete" | "restore"; customer: Customer } | null;

/** "12 Jan 2025" — the mockup's Bergabung column, from `createdAt`. */
function joinedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * The customer list table, in the shape the mockup draws (buloo-navigation-v3,
 * `pelangganDaftar`): who they are, how to reach them, and the two shortcuts —
 * chat and edit — that mean a small job does not need the profile open.
 *
 * THE ROW IS THE WAY IN. Clicking anywhere on it opens the profile, which is what
 * the mockup's callout promises: a customer's page is reached from their row, not
 * from a menu. The NAME IS ALSO A REAL LINK, and that is not redundancy — the row
 * handler is a mouse affordance, while the link is what a keyboard tabs to and
 * what a screen reader announces as a destination. The handler ignores clicks that
 * landed on a control, and clicks that bubbled out of the confirm dialog's portal,
 * so the chat and edit buttons still do their own job — GroomingBookingsTable's
 * two guards, for the same two reasons.
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
 * drawing is a loss. It is icon-only here and spelled out in the profile's danger
 * zone, so the row stays quiet without hiding anything.
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
}: {
  customers: Customer[];
  loading: boolean;
  onChanged: () => void;
  /** Active search term, highlighted in the searchable cells (name, email, phone). */
  search?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  // Show the Aksi column only when at least one CURRENTLY-LISTED row would render
  // a button — so a restore-only role sees the column while "show deleted" is on
  // (deleted rows → Pulihkan) but not while it is off. Chat counts: it needs no
  // grant beyond reading the list, so any row with a readable number has one.
  const rowHasActions = (customer: Customer) =>
    customer.deletedAt !== null
      ? can("customers", "restore")
      : can("customers", "update") ||
        can("customers", "delete") ||
        whatsAppLink(customer.phone) !== null;
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
      else await customerService.restore(customer._id);
      setPending(null);
      onChanged();
      swalToast(
        kind === "delete" ? "Pelanggan dihapus." : "Pelanggan dipulihkan.",
      );
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

  if (!loading && customers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
        Belum ada pelanggan yang cocok dengan filter ini.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Kode</TableHead>
              <TableHead>Pelanggan</TableHead>
              <TableHead>Kontak</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Bergabung</TableHead>
              {showActions && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => {
              const deleted = customer.deletedAt !== null;
              const chat = whatsAppLink(customer.phone);

              return (
                <TableRow
                  key={customer._id}
                  className="cursor-pointer"
                  onClick={(event) => {
                    /*
                      TWO GUARDS, BOTH BORROWED FROM GroomingBookingsTable.

                      React bubbles events out of PORTALS, so a press inside the
                      confirm dialog this row opens would otherwise reach here
                      and navigate away from the question being answered.

                      And a click on a control inside the row is that control's,
                      not the row's — otherwise "chat" would also navigate.
                    */
                    const target = event.target as HTMLElement;
                    if (!event.currentTarget.contains(target)) return;
                    if (target.closest("a, button, input, label")) return;
                    router.push(`/dashboard/master/customers/${customer._id}`);
                  }}
                >
                  <TableCell>
                    {customer.code ? (
                      // tabular-nums, never font-mono — ui-rules §5. Keeps the
                      // column from shifting as the digits differ in width.
                      <span className="tabular-nums text-muted">
                        <HighlightText text={customer.code} query={search} />
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/dashboard/master/customers/${customer._id}`}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        <HighlightText text={customer.name} query={search} />
                      </Link>
                      {/*
                        THE TIER RIDES WITH THE NAME, where the mockup puts the
                        membership chip. It is a property of the person rather
                        than a column anybody sorts by, and most customers have
                        none — a column of dashes for the sake of one badge.
                      */}
                      {/*
                        A COMPANY SAYS SO BESIDE ITS NAME, which is where the
                        mockup puts it and where it is useful: "Toko Hewan Mitra
                        Jaya" reads as a shop either way, but plenty of companies
                        are registered under a person's name. Individuals get no
                        badge — a label on 95% of the rows is noise.
                      */}
                      {customer.kind === "company" && (
                        <Badge
                          variant="outline"
                          className="border-transparent bg-tint-warning text-warning"
                        >
                          Perusahaan
                        </Badge>
                      )}
                      {customer.vipTier && (
                        <CustomerVipBadge tier={customer.vipTier} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {/*
                      PHONE ABOVE EMAIL, both in one cell, as the mockup has it:
                      this is a shop that rings and WhatsApps people, so the
                      number is the contact and the address is the footnote.
                      tabular-nums keeps the digits from dancing between rows.
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
                  </TableCell>
                  <TableCell>
                    {customer.customerTypeName ? (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-tint-info text-info"
                      >
                        {customer.customerTypeName}
                      </Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <CustomerStatusBadge deleted={deleted} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted">
                    {joinedOn(customer.createdAt)}
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {deleted ? (
                          <Can feature="customers" action="restore">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setPending({ kind: "restore", customer })
                              }
                            >
                              <RotateCcw className="size-4" />
                              Pulihkan
                            </Button>
                          </Can>
                        ) : (
                          <>
                            {/*
                              ICON-ONLY, and each one carries its own label for
                              the people who cannot see it. Three words per row
                              across a table this wide pushed Bergabung off a
                              laptop screen; the mockup draws icons here for the
                              same reason. `size="icon"` (36px) is the floor
                              ui-rules §1.5 sets for an icon-only control, not
                              `icon-sm` — 32px is below it even before the hit
                              area is counted.

                              A NEW TAB, because WhatsApp Web replacing the list
                              loses the reader's place in it — and `rel` because
                              `target="_blank"` without it hands the opened page a
                              handle on this one.
                            */}
                            {chat && (
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                title={`Chat WhatsApp ${customer.name}`}
                              >
                                <a
                                  href={chat}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Chat WhatsApp ${customer.name}`}
                                >
                                  <MessageCircle className="size-4" />
                                </a>
                              </Button>
                            )}
                            <Can feature="customers" action="update">
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                title={`Ubah ${customer.name}`}
                              >
                                <Link
                                  href={`/dashboard/master/customers/${customer._id}/edit`}
                                  aria-label={`Ubah ${customer.name}`}
                                >
                                  <Pencil className="size-4" />
                                </Link>
                              </Button>
                            </Can>
                            <Can feature="customers" action="delete">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-danger hover:bg-danger/10 hover:text-danger"
                                title={`Hapus ${customer.name}`}
                                aria-label={`Hapus ${customer.name}`}
                                onClick={() =>
                                  setPending({ kind: "delete", customer })
                                }
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </Can>
                          </>
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
          title={
            pending.kind === "delete" ? "Hapus pelanggan" : "Pulihkan pelanggan"
          }
          confirmLabel={pending.kind === "delete" ? "Hapus" : "Pulihkan"}
          destructive={pending.kind === "delete"}
          busy={busy}
          error={actionError}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending.kind === "delete" ? (
            <>
              Hapus <strong>{pending.customer.name}</strong>? Datanya
              disembunyikan dari daftar dan emailnya bebas dipakai lagi. Bisa
              dipulihkan nanti.
            </>
          ) : (
            <>
              Pulihkan <strong>{pending.customer.name}</strong>? Ini gagal kalau
              emailnya sudah dipakai pelanggan lain.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
