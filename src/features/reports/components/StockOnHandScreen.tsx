"use client";

import { useMemo, useState } from "react";

import { Alert, Button, Card, Pagination, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { reportService } from "@/services/report.service";
import { formatMoney, formatQty } from "@/utils/decimal";
import { csvToXlsx, saveBlob } from "@/utils/xlsx";
import type { StockOnHandRow } from "@/types/report";

import { useStockOnHand } from "../hooks/useStockOnHand";
import { useReportLookups } from "../hooks/useReportLookups";

/**
 * Stok per Cabang — what is on every shelf and what it is worth.
 *
 * ROWS ARRIVE PER WAREHOUSE AND ARE GROUPED HERE. The API deliberately does not
 * collapse them (PCR-019: a branch may hold several warehouses), so the grouping
 * is a presentation choice and this is where it belongs — a bazaar warehouse
 * with no branch groups under "Tanpa cabang" rather than vanishing, which is the
 * whole reason the report exists.
 *
 * THE SCREEN COMPUTES NO TOTALS. `data.totals` covers the entire filtered set;
 * summing the page would produce a figure that changes as you page, looks like
 * an answer, and is not one. The per-branch subtotals below are the exception
 * and they are labelled as page-scoped for exactly that reason.
 */

const ALL = "all";
const PAGE_SIZE = 50;

/** How each exported column should be typed in the workbook. Keyed by header. */
const EXPORT_TYPES = {
  Qty: "number",
  "Stok minimum": "number",
  "HPP rata-rata": "number",
  "Nilai persediaan": "number",
} as const;

export function StockOnHandScreen() {
  const [page, setPage] = useState(1);
  const [branchId, setBranchId] = useState(ALL);
  const [warehouseId, setWarehouseId] = useState(ALL);
  const [categoryId, setCategoryId] = useState(ALL);
  const [includeZero, setIncludeZero] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const lookups = useReportLookups();

  const filters = useMemo(
    () => ({
      branchId: branchId === ALL ? undefined : branchId,
      warehouseId: warehouseId === ALL ? undefined : warehouseId,
      categoryId: categoryId === ALL ? undefined : categoryId,
      includeZero,
    }),
    [branchId, warehouseId, categoryId, includeZero],
  );

  const { data, loading, error } = useStockOnHand({
    ...filters,
    page,
    limit: PAGE_SIZE,
  });

  /** Resets to page 1 — any filter change invalidates the current offset. */
  const changeFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const groups = useMemo(() => groupByBranch(data?.items ?? []), [data]);

  /**
   * Fetches the server's CSV — the whole filtered set in one response — and
   * converts it to a typed workbook.
   *
   * NOT A PAGE-BY-PAGE WALK of the JSON endpoint: `limit` caps at 100, so a
   * six-thousand-row catalogue would be sixty requests before the file could be
   * built. The export endpoint streams the lot, selected by the same code that
   * chose the rows on screen, so the file and the screen cannot disagree.
   */
  const exportXlsx = async () => {
    setExporting(true);
    setExportError(null);

    try {
      const { blob } = await reportService.exportStockOnHand(filters);
      const workbook = await csvToXlsx(await blob.text(), {
        types: EXPORT_TYPES,
        sheetName: "Stok per Cabang",
      });
      saveBlob(workbook, "stok-per-cabang.xlsx");
    } catch (err) {
      setExportError(
        err instanceof ApiError ? err.message : "Export gagal. Coba lagi.",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card title="Filter">
        <div className="flex flex-wrap items-end gap-3">
          <FilterSelect
            id="branch"
            label="Cabang"
            value={branchId}
            allLabel="Semua cabang"
            options={lookups.branches.map((b) => ({ id: b._id, name: b.name }))}
            onChange={(value) => changeFilter(() => setBranchId(value))}
          />
          <FilterSelect
            id="warehouse"
            label="Gudang"
            value={warehouseId}
            allLabel="Semua gudang"
            options={lookups.warehouses.map((w) => ({
              id: w._id,
              name: w.name,
            }))}
            onChange={(value) => changeFilter(() => setWarehouseId(value))}
          />
          <FilterSelect
            id="category"
            label="Kategori"
            value={categoryId}
            allLabel="Semua kategori"
            options={lookups.categories.map((c) => ({
              id: c._id,
              name: c.name,
            }))}
            onChange={(value) => changeFilter(() => setCategoryId(value))}
          />

          <div className="flex items-center gap-2 pb-2">
            <Checkbox
              id="includeZero"
              checked={includeZero}
              onCheckedChange={(checked) =>
                changeFilter(() => setIncludeZero(checked === true))
              }
            />
            <Label htmlFor="includeZero" className="text-xs text-muted">
              Tampilkan yang stoknya nol
            </Label>
          </div>

          <Button
            variant="secondary"
            onClick={exportXlsx}
            disabled={exporting || loading}
            className="ml-auto"
          >
            {exporting ? <Spinner /> : null}
            Export .xlsx
          </Button>
        </div>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}
      {exportError && <Alert variant="error">{exportError}</Alert>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="Produk" value={String(data.totals.productCount)} />
            <Tile label="Total qty" value={formatQty(data.totals.qty)} />
            <Tile
              label="Nilai persediaan"
              value={formatMoney(data.totals.value)}
            />
          </div>
          {/*
            Said out loud because the tiles sit above a paged table and would
            otherwise be read as its sum.
          */}
          <p className="-mt-2 text-xs text-muted">
            Tiga angka di atas menghitung seluruh hasil filter, bukan cuma
            halaman ini.
          </p>
        </>
      )}

      <Card title="Rincian">
        <div className={cn("flex flex-col gap-6", loading && "opacity-60")}>
          {groups.length === 0 && !loading ? (
            <p className="text-sm text-muted">
              Tidak ada stok yang cocok dengan filter ini.
              {!includeZero &&
                " Produk yang stoknya nol disembunyikan — centang kotaknya kalau memang itu yang dicari."}
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.key} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="font-bold text-foreground">
                    {group.branchName}
                  </h3>
                  <span className="text-xs text-muted">
                    subtotal halaman ini: {formatMoney(group.value)}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Gudang</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Produk</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">HPP</TableHead>
                        <TableHead className="text-right">Nilai</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((row) => (
                        <TableRow key={`${row.productId}-${row.warehouseId}`}>
                          <TableCell className="text-xs text-muted">
                            {row.warehouseName ?? "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-xs">
                            {row.sku ?? "—"}
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2">
                              {row.name}
                              {row.isLow && (
                                <Badge
                                  variant="outline"
                                  className="border-destructive/30 bg-destructive/10 text-destructive"
                                >
                                  Stok minim
                                </Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted">
                            {row.categoryName ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatQty(row.qty)} {row.unit}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {/*
                              An em dash, never "Rp 0". A product with no cost
                              basis is not one worth nothing — and only the first
                              is a data problem the owner should chase.
                            */}
                            {row.hppAvg === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              formatMoney(row.hppAvg)
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.value === null ? (
                              <span className="text-muted">—</span>
                            ) : (
                              formatMoney(row.value)
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            ))
          )}
        </div>

        {data && (
          <div className="mt-4">
            <Pagination
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              unit="baris"
              unitPlural="baris"
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

/** One branch's rows on this page, plus what they add up to. */
interface BranchGroup {
  key: string;
  branchName: string;
  value: string;
  rows: StockOnHandRow[];
}

/**
 * Groups the page's rows by branch, preserving the order the API sorted them in.
 *
 * A warehouse with no branch collects under "Tanpa cabang" rather than being
 * dropped: `defaultBranchId` is nullable by design, and forgotten stock in an
 * event warehouse is exactly what this report is for.
 */
function groupByBranch(rows: StockOnHandRow[]): BranchGroup[] {
  const groups = new Map<string, BranchGroup>();

  rows.forEach((row) => {
    const key = row.branchId ?? "__none__";

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        branchName: row.branchName ?? "Tanpa cabang",
        value: "0",
        rows: [],
      });
    }

    const group = groups.get(key)!;
    group.rows.push(row);
  });

  // Subtotals are summed from the rows ON THIS PAGE and labelled as such in the
  // UI — the report-wide figures come from the API's own totals.
  groups.forEach((group) => {
    group.value = String(
      group.rows.reduce(
        (total, row) => total + Number(row.value ?? 0),
        0,
      ),
    );
  });

  return [...groups.values()];
}

function FilterSelect({
  id,
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  allLabel: string;
  options: Array<{ id: string; name: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
