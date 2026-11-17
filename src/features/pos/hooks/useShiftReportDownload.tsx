"use client";

import { useState, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";

import { useTenant } from "@/features/tenant";
import { posService } from "@/services/pos.service";
import type { PosShift, PosTransaction } from "@/types/api";

import {
  ShiftPaymentReport,
  type ShiftReportData,
} from "../components/ShiftPaymentReport";

/** A shift is hundreds of sales at most; the list endpoint caps a page at 100. */
const MAX_PAGES = 20;

async function paidSalesOf(shiftId: string): Promise<PosTransaction[]> {
  const all: PosTransaction[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await posService.listTransactions({
      shiftId,
      status: "paid",
      page,
      limit: 100,
    });
    all.push(...result.items);
    if (page >= result.pagination.totalPages) break;
  }
  return all;
}

/**
 * The branch and cashier names of a shift, which `PosShift` carries only as
 * ids. Read from the shift list (the one endpoint that resolves them), by the
 * shift's own opening instant so it is one row.
 */
async function namesOf(
  shift: PosShift,
): Promise<{ branchName: string | null; cashierName: string | null }> {
  try {
    const page = await posService.listShifts({
      branchId: shift.branchId,
      openedFrom: shift.openedAt,
      openedTo: shift.openedAt,
      limit: 10,
    });
    const row = page.items.find((item) => item._id === shift._id);
    return {
      branchName: row?.branchName ?? null,
      cashierName: row?.cashierName ?? null,
    };
  } catch {
    return { branchName: null, cashierName: null };
  }
}

/**
 * Unduh laporan pembayaran kasir — one shift as an A4 PDF (17 November 2026).
 *
 * Loads the shift's figures, puts the sheet straight under `body` for one
 * print, and opens the browser's print dialog, where "Simpan sebagai PDF" is
 * the download. The same mechanism as the struk's Unduh PDF, for the reasons
 * `print/receipt.css` gives: printing from inside a dialog put the sheet in the
 * wrong place on the paper.
 *
 * Render `portal` somewhere in the caller's tree; it is null except while
 * printing.
 */
export function useShiftReportDownload(): {
  download: (
    shiftId: string,
    known?: { branchName?: string | null; cashierName?: string | null },
  ) => Promise<void>;
  /** The shift being prepared, for a spinner on its button. */
  loadingId: string | null;
  error: string | null;
  portal: ReactNode;
} {
  const { tenant } = useTenant();
  const [data, setData] = useState<ShiftReportData | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(
    shiftId: string,
    known: { branchName?: string | null; cashierName?: string | null } = {},
  ) {
    setLoadingId(shiftId);
    setError(null);

    let next: ShiftReportData;
    try {
      const report = await posService.xReport(shiftId);
      const shift = report.shift;
      const [names, sales] = await Promise.all([
        known.branchName && known.cashierName
          ? { branchName: known.branchName, cashierName: known.cashierName }
          : namesOf(shift),
        // Without `posTransactions:read` the summary still prints.
        paidSalesOf(shiftId).catch(() => null),
      ]);

      next = {
        shift,
        report,
        tenantName: tenant?.name ?? null,
        branchName: known.branchName ?? names.branchName,
        cashierName: known.cashierName ?? names.cashierName,
        sales,
        printedAt: new Date().toISOString(),
      };
    } catch {
      setError("Laporan shift gagal dimuat. Coba lagi.");
      setLoadingId(null);
      return;
    }

    setLoadingId(null);

    const previousTitle = document.title;
    flushSync(() => setData(next));
    // The browser names the saved PDF after the page title.
    document.title = `Laporan Pembayaran ${next.shift.shiftNumber}`;

    window.addEventListener(
      "afterprint",
      () => {
        document.title = previousTitle;
        setData(null);
      },
      { once: true },
    );

    window.print();
  }

  const portal =
    data && typeof document !== "undefined"
      ? createPortal(
          <div data-print-root>
            <ShiftPaymentReport data={data} />
          </div>,
          document.body,
        )
      : null;

  return { download, loadingId, error, portal };
}
