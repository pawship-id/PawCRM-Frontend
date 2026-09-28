"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Alert, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import type { CustomerInvoiceListSummary } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

/**
 * What this customer is worth to the shop, and what they still owe — the mockup's
 * "Nilai pelanggan" section.
 *
 * IT IS THE RECEIVABLES SUMMARY, FILTERED TO ONE CUSTOMER. `GET
 * /customer-invoices/summary?customerId=…` already computes revenue, collected,
 * outstanding and overdue over whatever filter it is handed, so this section asks
 * the exact question the Piutang screen asks, about one person. Nothing is summed
 * here: a total added up in the browser would only cover the page it could see,
 * and would disagree with the same figure on the receivables screen.
 *
 * WHAT IT IS NOT: lifetime value. The mockup's LTV is every rupiah the customer
 * ever spent, and this is only the part that went onto an INVOICE — a cash sale at
 * the till never becomes one. The two are different numbers, so this section says
 * which one it is showing rather than borrowing the more flattering label. The
 * pending rows below spell out what is still missing.
 *
 * ITS OWN GRANT. Rendered inside `<Can feature="customerInvoices" action="read">`
 * by the profile, because receivables are a manager's screen — the till's own
 * plafon check (`/pos/customers/:id/credit`) is gated on `posTransactions:create`
 * instead, and is a different question: may this person take goods on account.
 */
export function CustomerValueSection({ customerId }: { customerId: string }) {
  const [summary, setSummary] = useState<CustomerInvoiceListSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    customerInvoiceService
      .summary({ customerId })
      .then((result) => {
        if (!active) return;
        setSummary(result);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Angka faktur pelanggan ini tidak bisa dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted">
        <Spinner /> Memuat angka faktur…
      </div>
    );
  }

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!summary) return null;

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Nilai faktur"
          value={formatMoney(summary.revenue.amount)}
          caption={`${summary.revenue.invoiceCount} faktur`}
        />
        <Figure
          label="Sudah dibayar"
          value={formatMoney(summary.collected.amount)}
        />
        <Figure
          label="Piutang berjalan"
          value={formatMoney(summary.outstanding.amount)}
          caption={`${summary.outstanding.invoiceCount} faktur belum lunas`}
        />
        <Figure
          label="Lewat jatuh tempo"
          value={formatMoney(summary.overdue.amount)}
          caption={`${summary.overdue.invoiceCount} faktur`}
          /* The one figure that is a problem rather than a fact, and the only one
             coloured — if everything is coloured, nothing is. */
          tone={summary.overdue.invoiceCount > 0 ? "danger" : undefined}
        />
      </dl>

      <p className="text-xs text-muted">
        Hanya penjualan yang menjadi faktur. Transaksi kasir yang langsung lunas
        tidak menerbitkan faktur, jadi tidak ikut dihitung di sini —{" "}
        <Link
          href="/dashboard/sales/invoice"
          className="text-primary underline-offset-2 hover:underline"
        >
          rinciannya ada di Penjualan › Faktur
        </Link>
        .
      </p>

      {/*
        THE MOCKUP'S OTHER THREE, AND WHAT EACH WAITS FOR. Badged rather than
        invented: an LTV made up from one page of transactions is indistinguishable
        from a real one, and it is the figure somebody would quote to a customer.
      */}
      <dl className="grid gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-3">
        <Pending
          label="Lifetime value"
          blockedBy="Belum ada agregasi omzet per pelanggan lintas kasir dan faktur"
        />
        <Pending
          label="Rata-rata per kunjungan"
          blockedBy="Menunggu lifetime value dan jumlah kunjungan"
        />
        <Pending
          label="Produk paling sering dibeli"
          blockedBy="Belum ada rekap item per pelanggan"
        />
      </dl>
    </div>
  );
}

function Figure({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption?: string;
  tone?: "danger";
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`text-lg font-semibold tabular-nums ${
          tone === "danger" ? "text-danger" : "text-foreground"
        }`}
      >
        {value}
      </dd>
      {caption && <p className="text-xs text-muted">{caption}</p>}
    </div>
  );
}

function Pending({ label, blockedBy }: { label: string; blockedBy: string }) {
  return (
    <div aria-disabled="true" className="opacity-60">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        {label}
        <Badge variant="outline" className="font-normal">
          Segera
        </Badge>
      </dt>
      <dd className="mt-0.5 text-xs text-muted">{blockedBy}</dd>
    </div>
  );
}
