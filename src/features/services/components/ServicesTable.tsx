"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, RotateCcw } from "lucide-react";

import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import { swalToast } from "@/lib/swal";
import { ConfirmDialog, HighlightText } from "@/components";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Can, usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";
import type { Service } from "@/types/api";

/** The row action that opens a confirm dialog, plus the service it targets. */
type PendingAction = { kind: "delete" | "restore"; service: Service } | null;

/** Minutes as something a person reads — "1 jam 30 mnt", not "90". */
function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} mnt`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours} jam` : `${hours} jam ${rest} mnt`;
}

/**
 * Whether the service is offered, retired, or soft-deleted.
 *
 * Deleted wins over retired when both are true: a record that should not exist is
 * a more urgent thing to say than one that is merely no longer sold. Every badge
 * carries a word — ui-rules §1.3.
 */
function ServiceStatusBadge({
  isActive,
  deleted,
}: {
  isActive: boolean;
  deleted: boolean;
}) {
  const { label, className } = deleted
    ? { label: "Terhapus", className: "bg-muted/40 text-muted" }
    : isActive
      ? { label: "Ditawarkan", className: "bg-success/12 text-success" }
      : { label: "Tidak aktif", className: "bg-muted/40 text-muted" };

  return (
    <Badge variant="outline" className={cn("border-transparent", className)}>
      {label}
    </Badge>
  );
}

/**
 * The service list table with its row actions.
 *
 * Read data flows in via props (from useServices); the lifecycle actions are
 * owned here because they are local to a row. Mirrors PetsTable.
 */
export function ServicesTable({
  services,
  loading,
  onChanged,
  search,
}: {
  services: Service[];
  loading: boolean;
  onChanged: () => void;
  /** Active search term, highlighted in the searchable cells (name, code). */
  search?: string;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  const rowHasActions = (service: Service) =>
    service.deletedAt !== null
      ? can("services", "restore")
      : can("services", "update") || can("services", "delete");
  const showActions = services.some(rowHasActions);

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
      const { kind, service } = pending;
      if (kind === "delete") await serviceService.remove(service._id);
      else await serviceService.restore(service._id);
      setPending(null);
      onChanged();
      swalToast(kind === "delete" ? "Layanan dihapus." : "Layanan dipulihkan.");
    } catch (error) {
      // `reason` first: the delete refusal's message is only a headline, and the
      // count of bundles in the way — the part that says what to do — is in
      // `reason`. Same rule as the customer delete guard.
      setActionError(
        error instanceof ApiError
          ? (error.reason ?? error.message)
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loading && services.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
        Belum ada layanan yang cocok dengan filter ini.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Kode</TableHead>
              <TableHead className="text-right">Harga</TableHead>
              <TableHead>Durasi</TableHead>
              <TableHead>Status</TableHead>
              {showActions && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((service) => {
              const deleted = service.deletedAt !== null;

              return (
                <TableRow key={service._id}>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      <HighlightText text={service.name} query={search} />
                    </div>
                    {service.taxExempt && (
                      <span className="text-xs text-muted">Tanpa PPN</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-muted">
                      {service.code ? (
                        <HighlightText text={service.code} query={search} />
                      ) : (
                        "—"
                      )}
                    </span>
                  </TableCell>
                  {/* tabular-nums so the column does not shift as digit widths
                      differ — ui-rules §5. Right-aligned because it is money. */}
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatMoney(service.price)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted">
                    {formatDuration(service.durationMin)}
                  </TableCell>
                  <TableCell>
                    <ServiceStatusBadge
                      isActive={service.isActive}
                      deleted={deleted}
                    />
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {deleted ? (
                          <Can feature="services" action="restore">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setPending({ kind: "restore", service })
                              }
                            >
                              <RotateCcw className="size-4" />
                              Pulihkan
                            </Button>
                          </Can>
                        ) : (
                          <>
                            <Can feature="services" action="update">
                              <Button variant="ghost" size="sm" asChild>
                                <Link
                                  href={`/dashboard/master/layanan/${service._id}`}
                                >
                                  <Pencil className="size-4" />
                                  Ubah
                                </Link>
                              </Button>
                            </Can>
                            <Can feature="services" action="delete">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:bg-danger/10 hover:text-danger"
                                onClick={() =>
                                  setPending({ kind: "delete", service })
                                }
                              >
                                <Trash2 className="size-4" />
                                Hapus
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
            pending.kind === "delete" ? "Hapus layanan" : "Pulihkan layanan"
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
              Hapus <strong>{pending.service.name}</strong>? Ini ditolak kalau
              masih dipakai paket bundling. Kalau layanannya cuma berhenti
              ditawarkan, lebih tepat ditandai tidak aktif lewat Ubah — namanya
              tetap muncul di struk-struk lama.
            </>
          ) : (
            <>
              Pulihkan <strong>{pending.service.name}</strong>? Ini gagal kalau
              kodenya sudah dipakai layanan lain.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
