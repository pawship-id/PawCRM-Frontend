"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, RotateCcw } from "lucide-react";

import { ApiError } from "@/services/api-error";
import { paymentChannelService } from "@/services/paymentChannel.service";
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
import type { PaymentChannel } from "@/types/api";

import { CHANNEL_TYPE_LABELS } from "../hooks/usePaymentChannels";

type PendingAction = {
  kind: "delete" | "restore";
  channel: PaymentChannel;
} | null;

/**
 * The channel list table.
 *
 * ONE FLAT TABLE, not four grouped sections. The server already returns them
 * ordered by tab, so the Tipe column reads as a grouping without the markup —
 * and a settings screen for six rows does not need four headings to scan.
 */
export function PaymentChannelsTable({
  channels,
  loading,
  onChanged,
  search,
  accountLabels,
  branchLabels,
}: {
  channels: PaymentChannel[];
  loading: boolean;
  onChanged: () => void;
  search?: string;
  /** accountId → "1102 · Bank". Missing ids fall back to a dash. */
  accountLabels: Map<string, string>;
  /** branchId → branch name. */
  branchLabels: Map<string, string>;
}) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { can } = usePermissions();

  const rowHasActions = (channel: PaymentChannel) =>
    channel.deletedAt !== null
      ? can("paymentChannels", "restore")
      : can("paymentChannels", "update") || can("paymentChannels", "delete");
  const showActions = channels.some(rowHasActions);

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
      const { kind, channel } = pending;
      if (kind === "delete") await paymentChannelService.remove(channel._id);
      else await paymentChannelService.restore(channel._id);
      setPending(null);
      onChanged();
      swalToast(kind === "delete" ? "Channel dihapus." : "Channel dipulihkan.");
    } catch (error) {
      // `reason` first — the restore refusal's message is a headline and the
      // useful half is in `reason`.
      setActionError(
        error instanceof ApiError
          ? (error.reason ?? error.message)
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!loading && channels.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
        Belum ada channel pembayaran. Tambah yang pertama supaya kasir punya
        pilihan saat menerima uang.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table className={loading ? "opacity-60" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Tipe</TableHead>
              <TableHead>Nama</TableHead>
              <TableHead>Akun</TableHead>
              <TableHead>Cabang</TableHead>
              <TableHead className="text-right">MDR</TableHead>
              <TableHead>Status</TableHead>
              {showActions && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((channel) => {
              const deleted = channel.deletedAt !== null;

              return (
                <TableRow key={channel._id}>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-transparent bg-navy-100 text-primary"
                    >
                      {CHANNEL_TYPE_LABELS[channel.type]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">
                      <HighlightText text={channel.name} query={search} />
                    </div>
                    {channel.requiresReference && (
                      <span className="text-xs text-muted">
                        Wajib no. referensi
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted">
                    {accountLabels.get(channel.accountId) ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted">
                    {channel.branchId === null
                      ? "Semua cabang"
                      : (branchLabels.get(channel.branchId) ?? "—")}
                  </TableCell>
                  {/* tabular-nums so the column does not shift — ui-rules §5. */}
                  <TableCell className="text-right tabular-nums text-muted">
                    {channel.mdrPercent > 0 ? `${channel.mdrPercent}%` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "border-transparent",
                        deleted || !channel.isActive
                          ? "bg-muted/40 text-muted"
                          : "bg-success/12 text-success",
                      )}
                    >
                      {deleted
                        ? "Terhapus"
                        : channel.isActive
                          ? "Aktif"
                          : "Tidak aktif"}
                    </Badge>
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {deleted ? (
                          <Can feature="paymentChannels" action="restore">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setPending({ kind: "restore", channel })
                              }
                            >
                              <RotateCcw className="size-4" />
                              Pulihkan
                            </Button>
                          </Can>
                        ) : (
                          <>
                            <Can feature="paymentChannels" action="update">
                              <Button variant="ghost" size="sm" asChild>
                                <Link
                                  href={`/dashboard/keuangan/kas-bank/${channel._id}`}
                                >
                                  <Pencil className="size-4" />
                                  Ubah
                                </Link>
                              </Button>
                            </Can>
                            <Can feature="paymentChannels" action="delete">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-danger hover:bg-danger/10 hover:text-danger"
                                onClick={() =>
                                  setPending({ kind: "delete", channel })
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
            pending.kind === "delete" ? "Hapus channel" : "Pulihkan channel"
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
              Hapus <strong>{pending.channel.name}</strong>? Transaksi lama yang
              memakai channel ini tetap utuh dan tetap bisa dibaca — yang hilang
              cuma pilihannya untuk transaksi baru. Kalau cuma mau berhenti
              dipakai sementara, lebih tepat ditandai tidak aktif lewat Ubah.
            </>
          ) : (
            <>
              Pulihkan <strong>{pending.channel.name}</strong>? Ini gagal kalau
              sudah ada channel lain dengan nama sama di tipe yang sama.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
