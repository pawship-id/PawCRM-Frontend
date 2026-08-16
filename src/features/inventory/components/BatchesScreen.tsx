"use client";

import { useCallback, useState } from "react";

import { Alert, Spinner } from "@/components";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/decimal";

import {
  DEFAULT_BATCHES_QUERY,
  useBatches,
  type BatchesQuery,
} from "../hooks/useBatches";
import { useBatchSummary } from "../hooks/useBatchSummary";
import { useWarehouseOptions } from "../hooks/useWarehouseOptions";
import { BatchesTable } from "./BatchesTable";
import { BatchesToolbar } from "./BatchesToolbar";

/**
 * Every lot across the catalogue, ordered by how soon it expires.
 *
 * WHY THIS IS A SCREEN AND NOT A TAB. The batch tab on the stock card answers
 * "which lots does THIS product have" — a question you ask while looking at one
 * item. This screen answers the opposite one: "what in the whole shop is about
 * to go bad", which is a question you ask on a Monday morning with no particular
 * product in mind, and which nobody would find by clicking through products one
 * at a time.
 *
 * THREE REQUESTS, THREE DIFFERENT QUESTIONS:
 *
 *   /product-batches/summary  — the tiles. Counts across EVERY matching lot, and
 *                               a value no client can compute for itself.
 *   /product-batches/expiring — the alert list. Live lots that have a date,
 *                               cumulative, already-expired ones at the top.
 *   /product-batches          — the audit list. Everything, including exhausted
 *                               lots and the consignment ones that never expire.
 *
 * The list swaps between the last two; `useBatches` owns that choice and the
 * toolbar explains it. The tiles never swap — their buckets are fixed at 7 and
 * 30 days, which is what they are labelled with.
 *
 * ALREADY-EXPIRED LOTS ARE COUNTED SEPARATELY, not folded into "expiring soon".
 * Stock that expired last week and is still sellable on a shelf is the most
 * urgent thing this module can report; burying it under thirty rows that can
 * wait a month is how it stays on the shelf.
 */
export function BatchesScreen() {
  const [query, setQueryState] = useState<BatchesQuery>(DEFAULT_BATCHES_QUERY);
  const [page, setPage] = useState(1);
  const [refreshKey] = useState(0);

  const warehouses = useWarehouseOptions();
  const summary = useBatchSummary(query.warehouseId, refreshKey);
  const list = useBatches(query, page, refreshKey);

  /** Any filter change is a new question, so it starts at page 1. */
  const setQuery = useCallback((patch: Partial<BatchesQuery>) => {
    setQueryState((prev) => ({ ...prev, ...patch }));
    setPage(1);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {summary.error && <Alert variant="error">{summary.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Sudah lewat tanggal"
          value={summary.summary?.expired.count}
          loading={summary.loading}
          note="masih ada sisa stok"
          tone={summary.summary?.expired.count ? "danger" : "default"}
        />
        <Stat
          label={`Kritis — kurang ${summary.summary?.criticalDays ?? 7} hari`}
          value={summary.summary?.critical.count}
          loading={summary.loading}
          note="batch perlu tindakan minggu ini"
          tone={summary.summary?.critical.count ? "danger" : "default"}
        />
        <Stat
          label={`Perhatian — ${summary.summary?.withinDays ?? 30} hari`}
          value={summary.summary?.soon.count}
          loading={summary.loading}
          note="masih bisa dijual normal"
          tone={summary.summary?.soon.count ? "warning" : "default"}
        />
        <Stat
          label="Nilai berisiko"
          value={
            summary.summary ? formatMoney(summary.summary.atRisk.value) : undefined
          }
          loading={summary.loading}
          note="sisa qty × harga beli batch, ketiga bucket di atas"
        />
      </div>

      {/* Separate from the list's own error: the warehouse filter can fail to
          load while the report itself renders perfectly well. */}
      {warehouses.error && <Alert variant="error">{warehouses.error}</Alert>}

      {/* `total` is gone: the pager under the table already prints "N lot",
          and two copies of one number a screen apart is one of them being
          wrong the moment a request is in flight. */}
      <BatchesToolbar
        query={query}
        warehouses={warehouses.warehouses}
        auditMode={!list.alertMode}
        onChange={setQuery}
      />

      {list.error && <Alert variant="error">{list.error}</Alert>}

      {list.loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat daftar batch…
        </div>
      ) : (
        <BatchesTable
          batches={list.batches}
          page={list.pagination.page}
          totalPages={list.pagination.totalPages}
          total={list.pagination.total}
          searching={query.search.trim() !== ""}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  loading,
  note,
  tone = "default",
}: {
  label: string;
  /** Undefined until the summary lands, or after it fails. */
  value?: string | number;
  loading: boolean;
  note?: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-surface p-4",
        tone === "danger" && "border-danger/40 bg-danger/5",
        tone === "warning" && "border-secondary/50 bg-secondary/10",
        tone === "default" && "border-border",
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 tabular-nums text-xl font-semibold",
          tone === "danger" && "text-danger",
        )}
      >
        {/* Never a zero while the answer is still in flight — a tile that reads
            "0 sudah lewat tanggal" and then changes its mind has already told
            somebody there was nothing to do. */}
        {value ?? (loading ? "…" : "—")}
      </p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}
