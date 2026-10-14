"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Download } from "lucide-react";

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
import { reportService } from "@/services/report.service";
import { toScopeWarehouses } from "@/features/sales";
import type { CustomerInvoiceFilterOptions } from "@/types/api";
import type { SalesInvoiceReportRow } from "@/types/report";
import { isoDate } from "@/utils/date";
import { exportToXlsx, type XlsxColumn } from "@/utils/xlsx";

/**
 * Laporan › Penjualan per invoice — a DIALOG on the hub, not a page (14 October
 * 2026, on request): the report has nothing to show on screen, only a file to
 * hand over, so a page of its own was a click that led to a form.
 *
 * One row per faktur in the period: when, where, for whom, the breakdown from
 * subtotal down to PPN, and where it stands (dibayar, sisa, status). The
 * per-product view is its own report.
 *
 * THE PERIOD IS ALWAYS BOUNDED. The server refuses an export without both
 * dates, and a year is the widest it takes.
 */

type Status = SalesInvoiceReportRow["status"];

const STATUS_LABEL: Record<Status, string> = {
  unpaid: "Belum lunas",
  partial: "Lunas sebagian",
  paid: "Lunas",
  void: "Batal",
};

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as Status[]).map((value) => ({
  value,
  label: STATUS_LABEL[value],
}));

/** Every status but Batal — the server's own default, said out loud. */
const DEFAULT_STATUSES: Status[] = ["unpaid", "partial", "paid"];

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

const num = (value: string | null) => (value === null ? null : Number(value));

/**
 * The file's columns, in the order a faktur is read: who and when, then the
 * money top to bottom, then where it stands.
 */
const COLUMNS: (XlsxColumn<SalesInvoiceReportRow> & { about: string })[] = [
  {
    header: "No. faktur",
    value: (r) => r.invoiceNumber,
    width: 22,
    about: "Nomor faktur",
  },
  {
    header: "Tanggal faktur",
    value: (r) => r.invoiceDate,
    type: "date",
    width: 14,
    about: "Tanggal faktur diterbitkan",
  },
  {
    header: "Jatuh tempo",
    value: (r) => r.dueDate,
    type: "date",
    width: 14,
    about: "Batas pembayaran",
  },
  {
    header: "Cabang",
    value: (r) => r.branchName,
    width: 18,
    about: "Cabang penerbit",
  },
  {
    header: "Gudang",
    value: (r) => r.warehouseName,
    width: 18,
    about: "Gudang asal barang (kosong untuk faktur jasa saja)",
  },
  {
    header: "Pelanggan",
    value: (r) => r.customerName,
    width: 24,
    about: "Nama pelanggan",
  },
  {
    header: "No. HP",
    value: (r) => r.customerPhone,
    width: 16,
    about: "Nomor HP pelanggan",
  },
  {
    header: "Sumber",
    value: (r) => (r.source === "pos_bridge" ? "Kasir" : "Manual"),
    about: "Dibuat dari kasir atau manual di back office",
  },
  {
    header: "Channel",
    value: (r) => (r.channel === "marketplace" ? "Marketplace" : "Manual"),
    about: "Channel penjualan",
  },
  {
    header: "Jumlah baris",
    value: (r) => r.lineCount,
    type: "number",
    about: "Banyaknya baris produk/layanan",
  },
  {
    header: "Total qty",
    value: (r) => num(r.qtyTotal),
    type: "number",
    about: "Jumlah qty semua baris",
  },
  {
    header: "Subtotal",
    value: (r) => num(r.subtotal),
    type: "number",
    width: 14,
    about: "Qty × harga, sebelum diskon",
  },
  {
    header: "Diskon baris",
    value: (r) => num(r.itemDiscount),
    type: "number",
    width: 14,
    about: "Total diskon per baris",
  },
  {
    header: "Diskon faktur",
    value: (r) => num(r.invoiceDiscount),
    type: "number",
    width: 14,
    about: "Diskon di level faktur",
  },
  {
    header: "Biaya lain",
    value: (r) => num(r.otherCharges),
    type: "number",
    width: 14,
    about: "Ongkir, packaging, dll.",
  },
  {
    header: "DPP",
    value: (r) => num(r.dpp),
    type: "number",
    width: 14,
    about: "Dasar pengenaan pajak",
  },
  {
    header: "Tarif PPN (%)",
    value: (r) => r.taxRate,
    type: "number",
    about: "Tarif PPN saat faktur terbit",
  },
  {
    header: "PPN",
    value: (r) => num(r.tax),
    type: "number",
    width: 14,
    about: "PPN keluaran",
  },
  {
    header: "Total",
    value: (r) => num(r.total),
    type: "number",
    width: 16,
    about: "Total tagihan",
  },
  {
    header: "Dibayar",
    value: (r) => num(r.paidAmount),
    type: "number",
    width: 16,
    about: "Yang sudah dibayar",
  },
  {
    header: "Sisa tagihan",
    value: (r) => num(r.outstandingAmount),
    type: "number",
    width: 16,
    about: "Total − dibayar (0 untuk faktur batal)",
  },
  {
    header: "Status",
    value: (r) => STATUS_LABEL[r.status],
    width: 16,
    about: "Belum lunas / Lunas sebagian / Lunas / Batal",
  },
  {
    header: "Lewat jatuh tempo",
    value: (r) => (r.isOverdue ? "Ya" : "Tidak"),
    about: "Belum lunas dan sudah lewat jatuh tempo",
  },
  {
    header: "Dibuat oleh",
    value: (r) => r.createdByName,
    width: 18,
    about: "Kasir / admin yang membuat",
  },
  {
    header: "Catatan",
    value: (r) => r.notes,
    width: 30,
    about: "Catatan faktur",
  },
  {
    header: "Alasan batal",
    value: (r) => r.voidReason,
    width: 24,
    about: "Diisi hanya untuk faktur batal",
  },
];

export function SalesInvoiceReportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [options, setOptions] = useState<CustomerInvoiceFilterOptions | null>(
    null,
  );
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<Status[]>(DEFAULT_STATUSES);
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
  const ready = Boolean(range.from && range.to) && statuses.length > 0;

  async function download() {
    if (!ready) return;
    setBusy(true);
    try {
      const { rows } = await reportService.salesInvoices({
        dateFrom: range.from,
        dateTo: range.to,
        branchIds,
        warehouseIds,
        statuses,
      });
      await exportToXlsx(
        COLUMNS,
        rows,
        `penjualan-per-invoice_${range.from}_${range.to}.xlsx`,
        { sheetName: "Penjualan per invoice" },
      );
      swalToast(
        rows.length === 0
          ? "Tidak ada faktur di periode ini — file berisi judul kolom saja."
          : `Laporan diunduh — ${rows.length.toLocaleString("id-ID")} faktur.`,
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
          <DialogTitle>Penjualan per invoice</DialogTitle>
          <DialogDescription>
            Satu baris per faktur: total, diskon, pajak, dan status bayar.
            Diunduh sebagai Excel.
          </DialogDescription>
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
            <FilterMultiSelect<Status>
              layout="field"
              label="Status"
              className="sm:col-span-2"
              values={statuses}
              options={STATUS_OPTIONS}
              formatValue={(values) =>
                values.length === DEFAULT_STATUSES.length &&
                DEFAULT_STATUSES.every((s) => values.includes(s))
                  ? "Semua kecuali batal"
                  : values.length === STATUS_OPTIONS.length
                    ? "Semua"
                    : values.map((v) => STATUS_LABEL[v]).join(", ")
              }
              onApply={setStatuses}
              onReset={() => setStatuses(DEFAULT_STATUSES)}
            />
          </div>

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
              aria-controls="sales-invoice-columns"
              onClick={() => setShowColumns((value) => !value)}
            >
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  showColumns && "rotate-180",
                )}
              />
              {`${showColumns ? "Sembunyikan" : "Lihat"} isi kolom (${COLUMNS.length})`}
            </Button>

            {showColumns && (
              <div id="sales-invoice-columns" className="flex flex-col gap-3">
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
                      {COLUMNS.map((column) => (
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
