"use client";

import { useCallback, useEffect, useState } from "react";

import { Alert, Breadcrumb, FilterPills, Pagination, Spinner, TextareaField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { posOfflineService } from "@/services/posOffline.service";
import type { OfflineSubmission } from "@/types/posOffline";
import { formatMoney } from "@/utils/decimal";

type Lens = "needs_review" | "flagged" | "done";

const LENSES: Array<{ value: Lens; label: string }> = [
  { value: "needs_review", label: "Gagal terkirim" },
  { value: "flagged", label: "Ditandai" },
  { value: "done", label: "Selesai" },
];

const REASON_LABELS: Record<string, string> = {
  total_mismatch: "Total berbeda",
  number_conflict: "Nomor bentrok",
  shift_invalid: "Shift tidak cocok",
  device_invalid: "Perangkat tidak dikenal",
  paid_at_invalid: "Jam tidak wajar",
  posting_failed: "Gagal diposting",
  negative_stock: "Stok minus",
  price_changed: "Harga berubah",
  shift_closed: "Shift sudah tutup",
};

function timeOf(value: string | null): string {
  if (!value) return "—";
  const at = new Date(value);
  return Number.isNaN(at.getTime())
    ? "—"
    : at.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function queryOf(lens: Lens) {
  if (lens === "needs_review") return { status: "needs_review" };
  if (lens === "flagged") return { status: "synced", open: true };
  return { open: false };
}

/**
 * KASIR › PERLU DICEK (POS offline mode, 19 October 2026).
 *
 * Sales a till rang up offline that the server could not post as they were
 * ("Gagal terkirim"), and posted sales that should still be looked at
 * ("Ditandai": stock taken below zero, a price that differed from today's
 * catalogue, a shift closed before they arrived). Nothing here was lost —
 * every one of them was stored the moment it arrived.
 */
export function OfflineReviewScreen() {
  const [lens, setLens] = useState<Lens>("needs_review");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<OfflineSubmission[] | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<OfflineSubmission | null>(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      const result = await posOfflineService.listSubmissions({ ...queryOf(lens), page, limit: 20 });
      setRows(result.items);
      setTotalPages(result.pagination.totalPages || 1);
      setTotal(result.pagination.total);
    } catch {
      setError("Daftar tidak bisa dimuat. Coba lagi.");
    }
  }, [lens, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function resolve(row: OfflineSubmission, action: "retry" | "accept" | "reject", text: string | null = null) {
    setBusyId(row._id);
    try {
      const result = await posOfflineService.resolve(row._id, { action, note: text });
      swalToast(
        action === "retry"
          ? result.status === "synced"
            ? `${row.transactionNumber} berhasil diposting.`
            : `${row.transactionNumber} masih belum bisa diposting.`
          : action === "accept"
            ? "Ditandai sudah dicek."
            : `${row.transactionNumber} ditolak.`,
        action === "retry" && result.status !== "synced" ? "error" : "success",
        action === "retry" && result.status !== "synced" ? 6000 : 3000,
      );
      setRejecting(null);
      setNote("");
      await load();
    } catch (err) {
      swalToast(err instanceof ApiError ? (err.reason ?? err.message) : "Gagal. Coba lagi.", "error", 6000);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb items={[{ label: "Kasir", href: "/dashboard/pos" }, { label: "Perlu dicek" }]} />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">Transaksi offline perlu dicek</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Transaksi dari kasir offline yang belum bisa diposting apa adanya, atau
          yang sudah terposting tapi perlu dilihat (stok minus, harga berubah).
          Tidak ada yang hilang — semua tersimpan sejak diterima.
        </p>
      </div>

      <FilterPills
        ariaLabel="Jenis tinjauan"
        options={LENSES.map((option) => ({ value: option.value, label: option.label }))}
        value={lens}
        onChange={(value: Lens) => {
          setLens(value);
          setPage(1);
        }}
      />

      {error && <Alert variant="error">{error}</Alert>}

      {rows === null && !error ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat…
        </div>
      ) : rows && rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Tidak ada yang perlu dicek. Semua beres.</p>
      ) : rows ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. transaksi</TableHead>
                <TableHead>Waktu</TableHead>
                <TableHead>Kasir</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Catatan</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const notes = [...row.reasons, ...row.flags];
                return (
                  <TableRow key={row._id}>
                    <TableCell className="font-semibold tabular-nums">{row.transactionNumber}</TableCell>
                    <TableCell className="tabular-nums">{timeOf(row.paidAt)}</TableCell>
                    <TableCell>{row.cashierName ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(row.grandTotal)}</TableCell>
                    <TableCell className="max-w-md">
                      <ul className="space-y-1">
                        {notes.map((item, index) => (
                          <li key={index} className="text-sm">
                            <span className="mr-1 rounded-full bg-tint-warning px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                              {REASON_LABELS[item.code] ?? item.code}
                            </span>
                            {item.message}
                          </li>
                        ))}
                        {row.resolutionNote && (
                          <li className="text-sm text-muted">Catatan: {row.resolutionNote}</li>
                        )}
                      </ul>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {row.status === "needs_review" && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              disabled={busyId === row._id}
                              onClick={() => void resolve(row, "retry")}
                            >
                              Coba lagi
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              disabled={busyId === row._id}
                              onClick={() => setRejecting(row)}
                            >
                              Tolak
                            </Button>
                          </>
                        )}
                        {row.status === "synced" && row.reviewOpen && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={busyId === row._id}
                            onClick={() => void resolve(row, "accept")}
                          >
                            Tandai sudah dicek
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {totalPages > 1 && <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          unit="transaksi"
          unitPlural="transaksi"
          onPageChange={setPage}
        />}

      {rejecting && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm">
            Tolak <span className="font-semibold tabular-nums">{rejecting.transactionNumber}</span>?
            Transaksi ini tidak akan diposting. Tulis apa yang sudah dilakukan,
            mis. &quot;uang dikembalikan ke pelanggan&quot;.
          </p>
          <TextareaField label="Alasan" value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setRejecting(null)}>
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!note.trim() || busyId === rejecting._id}
              onClick={() => void resolve(rejecting, "reject", note.trim())}
            >
              Tolak transaksi
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
