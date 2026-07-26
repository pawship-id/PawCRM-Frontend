"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, RotateCcw } from "lucide-react";

import { ApiError } from "@/services/api-error";
import { customerService } from "@/services/customer.service";
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
import { Can, usePermissions } from "@/features/permissions";
import type { Customer } from "@/types/api";

import { CustomerVipBadge, CustomerStatusBadge } from "./CustomerVipBadge";

/** The row action that opens a confirm dialog, plus the customer it targets. */
type PendingAction = { kind: "delete" | "restore"; customer: Customer } | null;

/**
 * The customer list table (shadcn/ui Table) with its row actions.
 *
 * Read data flows in via props (from useCustomers); the lifecycle actions
 * (delete, restore) are owned here because they are local to a row: each opens a
 * ConfirmDialog, calls the matching service method, and then asks the parent to
 * refetch via `onChanged`. Edit is a plain link to the per-customer route.
 * Mirrors BranchesTable.
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
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  // Show the Actions column only when at least one CURRENTLY-LISTED row would
  // render a button — so a restore-only role sees the column while "show
  // deleted" is on (deleted rows → Restore) but not while it is off (live rows
  // → Edit/Delete, which that role lacks). Mirrors the per-button gating below.
  const rowHasActions = (customer: Customer) =>
    customer.deletedAt !== null
      ? can("customers", "restore")
      : can("customers", "update") || can("customers", "delete");
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
      swalToast(kind === "delete" ? "Customer deleted." : "Customer restored.");
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loading && customers.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        No customers match the current filters.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>VIP tier</TableHead>
              <TableHead>Status</TableHead>
              {showActions && (
                <TableHead className="text-right">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => {
              const deleted = customer.deletedAt !== null;
              return (
                <TableRow key={customer._id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      <HighlightText text={customer.name} query={search} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
                      {customer.email ? (
                        <HighlightText text={customer.email} query={search} />
                      ) : (
                        "—"
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
                      {customer.phone ? (
                        <HighlightText text={customer.phone} query={search} />
                      ) : (
                        "—"
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <CustomerVipBadge tier={customer.vipTier} />
                  </TableCell>
                  <TableCell>
                    <CustomerStatusBadge deleted={deleted} />
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
                              Restore
                            </Button>
                          </Can>
                        ) : (
                          <>
                            <Can feature="customers" action="update">
                              <Button variant="ghost" size="sm" asChild>
                                <Link
                                  href={`/dashboard/master/customers/${customer._id}`}
                                >
                                  <Pencil className="size-4" />
                                  Edit
                                </Link>
                              </Button>
                            </Can>
                            <Can feature="customers" action="delete">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:bg-danger/10 hover:text-danger"
                                onClick={() =>
                                  setPending({ kind: "delete", customer })
                                }
                              >
                                <Trash2 className="size-4" />
                                Delete
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
            pending.kind === "delete" ? "Delete customer" : "Restore customer"
          }
          confirmLabel={pending.kind === "delete" ? "Delete" : "Restore"}
          destructive={pending.kind === "delete"}
          busy={busy}
          error={actionError}
          onConfirm={runAction}
          onCancel={closeDialog}
        >
          {pending.kind === "delete" ? (
            <>
              Delete <strong>{pending.customer.name}</strong>? They will be
              hidden from the list and their email freed for reuse. You can
              restore them later.
            </>
          ) : (
            <>
              Restore <strong>{pending.customer.name}</strong>? This may fail if
              their email has since been taken by another customer.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
