"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Download, Info } from "lucide-react";

import {
  FilterDateRange,
  FilterMultiSelect,
  namedOptions,
  scopeSummary,
  warehousesAfterBranches,
  warehousesOffered,
  type DatePreset,
} from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { toScopeWarehouses } from "@/features/sales";
import type { CustomerInvoiceFilterOptions } from "@/types/api";
import { isoDate } from "@/utils/date";
import { exportToXlsx, type XlsxColumn } from "@/utils/xlsx";

/**
 * THE LAPORAN › PENJUALAN EXPORT DIALOG — one component for every sales
 * report, so they all ask the same questions in the same place (14 October
 * 2026, on request). A report is a `SalesReportDefinition` (see
 * `../salesReports.ts`); this draws the rest.
 *
 * A DIALOG ON THE HUB, not a page: these reports have nothing to show on
 * screen, only a file to hand over, so a page of their own was a click that led
 * to a form. A bottom sheet on a phone, a centred modal from `sm` up.
 *
 * THE PERIOD IS ALWAYS BOUNDED. The server refuses an export without both
 * dates, and a year is the widest it takes.
 */

/** A file column, plus the line that explains it in "Lihat isi kolom". */
export type SalesReportColumn<Row> = XlsxColumn<Row> & { about: string };

/** The period and cabang/gudang every sales report is asked for. */
export interface SalesReportScope {
  dateFrom: string;
  dateTo: string;
  branchIds: string[];
  warehouseIds: string[];
}

export interface SalesReportDefinition<Row, Choice extends string> {
  title: string;
  description: string;
  /** The file's name before `_<from>_<to>.xlsx`; also the sheet's name. */
  fileName: string;
  /** What one row is, for "Laporan diunduh — 12 faktur." */
  rowNoun: string;
  /**
   * What the file does NOT account for yet, stated beside the button that
   * makes it — a gap nobody is told about is read as a wrong number.
   */
  note?: string;
  columns: SalesReportColumn<Row>[];
  /** The one filter particular to this report — Status, Tipe… */
  choice: {
    label: string;
    options: { value: Choice; label: string }[];
    defaults: Choice[];
    summary: (values: Choice[]) => string;
  };
  fetch: (scope: SalesReportScope, choices: Choice[]) => Promise<Row[]>;
}

/** The presets above the two dates, read off the browser's clock. */
function presets(now = new Date()): DatePreset[] {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  // Monday to Sunday, the week the server's own `week` means.
  const monday = d - ((now.getDay() + 6) % 7);
  return [
    { label: "Hari ini", from: isoDate(now), to: isoDate(now) },
    {
      label: "Minggu ini",
      from: isoDate(new Date(y, m, monday)),
      to: isoDate(new Date(y, m, monday + 6)),
    },
    {
      label: "Bulan ini",
      from: isoDate(new Date(y, m, 1)),
      to: isoDate(new Date(y, m + 1, 0)),
    },
    {
      label: "Bulan lalu",
      from: isoDate(new Date(y, m - 1, 1)),
      to: isoDate(new Date(y, m, 0)),
    },
  ];
}

export function SalesReportDialog<Row, Choice extends string>({
  report,
  open,
  onOpenChange,
}: {
  report: SalesReportDefinition<Row, Choice>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [options, setOptions] = useState<CustomerInvoiceFilterOptions | null>(
    null,
  );
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [choices, setChoices] = useState<Choice[]>(report.choice.defaults);
  // Opens on Bulan ini — the period a sales report is most often asked for.
  const [range, setRange] = useState(() => {
    const month = presets()[2];
    return { from: month.from, to: month.to };
  });
  const [busy, setBusy] = useState(false);
  const [showColumns, setShowColumns] = useState(false);

  /*
    FETCHED ON FIRST OPEN, not with the hub: most visits never open this.
    NO ERROR STATE, as in `useReportLookups` — a lookup that fails leaves
    "Semua cabang", which still exports the unfiltered file.
  */
  useEffect(() => {
    if (!open || options) return;
    let live = true;
    customerInvoiceService
      .filterOptions()
      .then((result) => {
        if (live) setOptions(result);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, options]);

  const branches = options?.branches ?? [];
  const warehouses = toScopeWarehouses(options?.warehouses ?? []);
  const ready = Boolean(range.from && range.to) && choices.length > 0;

  async function download() {
    if (!ready) return;
    setBusy(true);
    try {
      const rows = await report.fetch(
        { dateFrom: range.from, dateTo: range.to, branchIds, warehouseIds },
        choices,
      );
      await exportToXlsx(
        report.columns,
        rows,
        `${report.fileName}_${range.from}_${range.to}.xlsx`,
        { sheetName: report.title },
      );
      swalToast(
        rows.length === 0
          ? "Tidak ada penjualan di periode ini — file berisi judul kolom saja."
          : `Laporan diunduh — ${rows.length.toLocaleString("id-ID")} ${report.rowNoun}.`,
      );
      onOpenChange(false);
    } catch (err) {
      swalToast(
        err instanceof ApiError ? err.fullMessage : "Laporan gagal diunduh.",
        "error",
        6000,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      {/*
        A BOTTOM SHEET ON A PHONE, a centred modal from `sm` up — the shape
        `RecordSheet` already uses. Header and buttons stay put and only the
        fields between them scroll: the stock dialog has no height cap, so on
        a phone the Unduh button sat somewhere below the screen.
      */}
      <DialogContent className="top-auto bottom-0 flex max-h-[90dvh] max-w-none translate-y-0 flex-col gap-0 rounded-t-2xl rounded-b-none p-0 sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-y-1/2 sm:rounded-2xl">
        <DialogHeader className="border-b border-border px-4 pt-5 pb-4 pr-12 text-left sm:px-6 sm:pt-6">
          <DialogTitle>{report.title}</DialogTitle>
          <DialogDescription>{report.description}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
            <FilterDateRange
              layout="field"
              label="Periode (tanggal faktur)"
              from={range.from}
              to={range.to}
              presets={presets()}
              onApply={setRange}
            />
            <FilterMultiSelect
              layout="field"
              label="Cabang"
              values={branchIds}
              options={namedOptions(branches)}
              formatValue={(ids) =>
                scopeSummary(ids, branches, "Semua cabang", "cabang")
              }
              onApply={(next) => {
                setBranchIds(next);
                setWarehouseIds(
                  warehousesAfterBranches(warehouses, next, warehouseIds),
                );
              }}
              onReset={() => setBranchIds([])}
            />
            <FilterMultiSelect
              layout="field"
              label="Gudang"
              values={warehouseIds}
              options={namedOptions(
                warehousesOffered(warehouses, branchIds, warehouseIds),
              )}
              formatValue={(ids) =>
                scopeSummary(ids, warehouses, "Semua gudang", "gudang")
              }
              onApply={setWarehouseIds}
              onReset={() => setWarehouseIds([])}
            />
            <FilterMultiSelect<Choice>
              layout="field"
              label={report.choice.label}
              className="sm:col-span-2"
              values={choices}
              options={report.choice.options}
              formatValue={report.choice.summary}
              onApply={setChoices}
              onReset={() => setChoices(report.choice.defaults)}
            />
          </div>

          {report.note && (
            <p className="flex items-start gap-2 text-sm text-muted">
              <Info
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              {report.note}
            </p>
          )}

          {/*
            FOLDED BEHIND A BUTTON, not dropped: the column list is what tells
            somebody what the file holds before they download it. A plain text
            button rather than a bordered <details> — a card around a table
            inside a dialog was three frames deep (14 October 2026, on request).
          */}
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="link"
              className="h-auto min-h-11 self-start px-0"
              aria-expanded={showColumns}
              aria-controls={`${report.fileName}-columns`}
              onClick={() => setShowColumns((value) => !value)}
            >
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  showColumns && "rotate-180",
                )}
              />
              {`${showColumns ? "Sembunyikan" : "Lihat"} isi kolom (${report.columns.length})`}
            </Button>

            {showColumns && (
              <div
                id={`${report.fileName}-columns`}
                className="flex flex-col gap-3"
              >
                {/*
                  SCROLLS INSIDE ITSELF, header pinned. The height goes on the
                  table's own container — it already scrolls sideways, so a
                  sticky header only pins against a scroller at that level.
                */}
                <div className="overflow-hidden rounded-xl border border-border [&_[data-slot=table-container]]:max-h-56 [&_[data-slot=table-container]]:overflow-y-auto sm:[&_[data-slot=table-container]]:max-h-64">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-surface">
                      <TableRow>
                        <TableHead className="w-[38%]">Kolom</TableHead>
                        <TableHead>Penjelasan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.columns.map((column) => (
                        <TableRow key={column.header}>
                          <TableCell className="whitespace-normal align-top font-semibold text-foreground">
                            {column.header}
                          </TableCell>
                          <TableCell className="whitespace-normal align-top text-muted">
                            {column.about}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side by side on a phone too: two stacked full-width buttons cost a
            third of a short screen. */}
        <DialogFooter className="grid grid-cols-2 gap-2 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex sm:px-6 sm:pb-4">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={download}
            disabled={!ready || busy}
          >
            <Download className="size-4" />
            {busy ? "Menyiapkan…" : "Unduh Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
