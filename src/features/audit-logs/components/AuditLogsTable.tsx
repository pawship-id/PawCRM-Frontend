"use client";

import Link from "next/link";

import { DataTable, HighlightText, type DataTableColumn } from "@/components";
import { formatMoney } from "@/utils/decimal";
import type { AuditLog } from "@/types/api";

import { entityHref } from "../constants";
import { AuditActionBadge } from "./AuditActionBadge";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

/**
 * The document the act was on, by the number people know it by. The keys are the
 * ones the server searches (DOCUMENT_NUMBER_KEYS in auditLog.repository.js) —
 * the parent document first, so a payment row names its invoice.
 */
const DOCUMENT_KEYS = [
  "invoiceNumber",
  "returnNumber",
  "receiptNumber",
  "opnameNumber",
  "transferNumber",
  "entryNumber",
  "number",
] as const;

export function documentNumber(log: AuditLog): string | null {
  const meta = log.metadata ?? {};
  for (const key of DOCUMENT_KEYS) {
    const value = text(meta[key]);
    if (value) return value;
  }
  return null;
}

/**
 * One line of what changed, in figures — READ FROM WHAT THE TRAIL RECORDED at
 * the time, never from the document as it is now. Generic on purpose: every
 * emitter writes the same handful of keys (amount, total, previousTotal,
 * reason), so one reader covers them without a case per action.
 */
export function describe(log: AuditLog): string | null {
  const meta = log.metadata ?? {};
  const parts: (string | null)[] = [];

  if (
    text(meta.paymentNumber) &&
    text(meta.paymentNumber) !== documentNumber(log)
  ) {
    parts.push(text(meta.paymentNumber));
  }

  if (text(meta.previousTotal) && text(meta.total)) {
    parts.push(
      `Total ${formatMoney(text(meta.previousTotal))} → ${formatMoney(text(meta.total))}`,
    );
  } else if (text(meta.computed) && text(meta.amount)) {
    parts.push(
      `${formatMoney(text(meta.computed))} → ${formatMoney(text(meta.amount))}`,
    );
  } else if (text(meta.amount)) {
    parts.push(formatMoney(text(meta.amount)));
  } else if (text(meta.total) ?? text(meta.totalAmount)) {
    parts.push(
      `Total ${formatMoney(text(meta.total) ?? text(meta.totalAmount))}`,
    );
  } else if (text(meta.totalDiffValue)) {
    parts.push(`Selisih ${formatMoney(text(meta.totalDiffValue))}`);
  }

  parts.push(text(meta.supplierName), text(meta.channelName));

  const after = meta.after;
  if (
    log.action === "tenant_identity_updated" &&
    after &&
    typeof after === "object"
  ) {
    const fields = Object.keys(after);
    if (fields.length) parts.push(`Diubah: ${fields.join(", ")}`);
  }

  const headline = parts.filter(Boolean).join(" · ");
  const reason = text(meta.reason) ?? text(meta.notes);
  const tail = reason ? `Alasan: ${reason}` : null;

  return [headline || null, tail].filter(Boolean).join(" — ") || null;
}

/**
 * Riwayat perubahan — READ-ONLY. An audit record is immutable, so there are no
 * row actions; the document number links to the document itself where it has a
 * page. `search` (a document number, matched on the server) is highlighted in
 * the Dokumen cell so the reader sees why each row was returned.
 */
export function AuditLogsTable({
  logs,
  loading,
  search,
}: {
  logs: AuditLog[];
  loading: boolean;
  search?: string;
}) {
  const columns: DataTableColumn<AuditLog>[] = [
    {
      id: "when",
      header: "Waktu",
      cellClassName: "whitespace-nowrap text-muted tabular-nums",
      cell: (log) => formatWhen(log.createdAt),
    },
    {
      id: "actor",
      header: "Pengguna",
      cell: (log) => (
        <>
          <div className="font-medium">
            {log.userId?.fullName ?? "Pengguna terhapus"}
          </div>
          {log.branchId?.name && (
            <div className="text-xs text-muted">{log.branchId.name}</div>
          )}
        </>
      ),
    },
    {
      id: "action",
      header: "Aktivitas",
      cell: (log) => <AuditActionBadge action={log.action} />,
    },
    {
      id: "document",
      header: "Dokumen",
      cellClassName: "whitespace-nowrap tabular-nums",
      cell: (log) => {
        const number = documentNumber(log);
        if (!number) return <span className="text-muted">—</span>;
        const href = entityHref(log.entityType, log.entityId);
        const label = <HighlightText text={number} query={search} />;
        return href ? (
          <Link
            href={href}
            className="rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {label}
          </Link>
        ) : (
          label
        );
      },
    },
    {
      id: "details",
      header: "Detail",
      cellClassName: "text-muted",
      cell: (log) => describe(log) ?? "—",
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={logs}
      rowKey={(log) => log._id}
      loading={loading}
      loadingLabel="Memuat riwayat…"
      empty="Belum ada perubahan yang cocok dengan filter ini."
    />
  );
}
