"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button as UIButton } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import type {
  CustomerInvoiceDetail,
  CustomerInvoiceListRow,
  CustomerInvoiceStatusFilter,
} from "@/types/api";

import { useCustomerInvoices } from "../hooks/useCustomerInvoices";
import { useReceivableFilterOptions } from "../hooks/useReceivableFilterOptions";
import { InvoiceListFooter } from "./InvoiceListFooter";
import { InvoiceScopeCard } from "./InvoiceScopeCard";
import { InvoiceStatCards } from "./InvoiceStatCards";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { ReceivablesTable } from "./ReceivablesTable";
import { ReceivablesToolbar } from "./ReceivablesToolbar";
import { SalesModuleHeader } from "./SalesModuleHeader";
import { VoidInvoiceDialog } from "./VoidInvoiceDialog";

/** A row action in progress, holding the full invoice its dialog needs. */
type RowAction =
  | { kind: "pay"; invoice: CustomerInvoiceDetail }
  | { kind: "void"; invoice: CustomerInvoiceDetail };

/**
 * The Penjualan › Faktur tab — the September 2026 layout.
 *
 * TOP TO BOTTOM, THE ORDER A READER ASKS IN: whose books and which days (the
 * read-only scope card), how that went (the four cards), which invoices (search,
 * and the filter panel — where cabang, gudang and periode are changed), and the
 * invoices themselves, with what can be done to each.
 *
 * THE CARDS ARE THE SERVER'S, from `/customer-invoices/summary` asked with the
 * list's own filter — never a sum of the page on screen, which would grow as the
 * user paged.
 *
 * ROW ACTIONS OPEN THE SAME DIALOGS THE DETAIL SCREEN USES. Both need the full
 * invoice (its payments, its outstanding figure as of now), which a list row does
 * not carry, so the row is read first and the dialog opens on what came back. A
 * payment or a void then refetches the rows AND the cards — both move.
 */
export function ReceivablesScreen() {
  const {
    invoices,
    pagination,
    query,
    loading,
    error,
    summary,
    summaryFailed,
    summaryStale,
    setQuery,
    refetch,
  } = useCustomerInvoices();
  const options = useReceivableFilterOptions();

  const [action, setAction] = useState<RowAction | null>(null);
  // A double click on Bayar must not open two reads racing to one dialog.
  const opening = useRef(false);

  async function openAction(kind: RowAction["kind"], row: CustomerInvoiceListRow) {
    if (opening.current) return;
    opening.current = true;

    try {
      const invoice = await customerInvoiceService.getById(row._id);
      setAction({ kind, invoice });
    } catch (err) {
      swalToast(
        err instanceof ApiError
          ? err.message
          : `${row.invoiceNumber} tidak bisa dibuka. Coba lagi.`,
        "error",
      );
    } finally {
      opening.current = false;
    }
  }

  /**
   * A balance card, opened into the invoices behind its number.
   *
   * THE DATE RANGE AND THE PANEL'S OTHER FILTERS ARE LIFTED TOO, not only the
   * status set. The card counts every late invoice in the scope, whenever it was
   * raised; a table still bounded to this month would list fewer rows than the
   * card just promised. The scope (cabang, gudang) stays, because the card
   * honours it.
   */
  function drill(statuses: CustomerInvoiceStatusFilter[], label: string) {
    setQuery({
      statuses,
      period: "all",
      dateFrom: "",
      dateTo: "",
      search: "",
      createdBy: [],
      sources: [],
    });
    swalToast(`Menampilkan semua faktur ${label}, tanpa batas tanggal.`);
  }

  const closeAction = (open: boolean) => {
    if (!open) setAction(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <SalesModuleHeader
        action={
          /*
            GATED SEPARATELY FROM THE PAGE. Raising an invoice cuts stock and
            posts two journal entries, so a collections user sees every bill and
            no way to create one. The route carries the same gate.
          */
          <Can feature="customerInvoices" action="create">
            <UIButton asChild size="lg">
              <Link href="/dashboard/sales/new">
                <Plus className="size-4" />
                Buat faktur
              </Link>
            </UIButton>
          </Can>
        }
      />

      {/* What the cards below are ABOUT — read-only; changed in the panel. */}
      <InvoiceScopeCard
        query={query}
        options={options}
        summary={summary}
        summaryStale={summaryStale}
      />

      <InvoiceStatCards
        summary={summary}
        failed={summaryFailed}
        onDrill={drill}
      />

      <ReceivablesToolbar query={query} onChange={setQuery} options={options} />

      {error && <Alert variant="error">{error}</Alert>}

      {!error && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {loading && invoices.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Spinner /> Memuat daftar faktur…
            </div>
          ) : (
            <>
              <ReceivablesTable
                invoices={invoices}
                loading={loading}
                search={query.search}
                sort={query.sort}
                onSort={(sort) => setQuery({ sort })}
                onPay={(row) => openAction("pay", row)}
                onVoid={(row) => openAction("void", row)}
              />
              <InvoiceListFooter
                page={pagination.page}
                pageSize={query.pageSize}
                total={pagination.total}
                totalPages={pagination.totalPages}
                onPageChange={(page) => setQuery({ page })}
                onPageSizeChange={(pageSize) => setQuery({ pageSize })}
              />
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted">
        Faktur dan pembayaran tidak bisa diubah atau dihapus — setiap pembayaran
        memposting jurnal yang permanen. Koreksi dilakukan dengan jurnal
        pembalik.
      </p>

      {action?.kind === "pay" && (
        <RecordPaymentDialog
          invoice={action.invoice}
          open
          onOpenChange={closeAction}
          onPaid={refetch}
        />
      )}

      {action?.kind === "void" && (
        <VoidInvoiceDialog
          invoice={action.invoice}
          open
          onOpenChange={closeAction}
          onVoided={refetch}
        />
      )}
    </div>
  );
}
