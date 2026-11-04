import { grossMarginRows } from "@/features/reports/salesReports";
import type {
  SalesInvoiceReportLine,
  SalesInvoiceReportRow,
} from "@/types/report";

type Invoice = SalesInvoiceReportRow & { lines: SalesInvoiceReportLine[] };

const line = (revenue: string, cost: string | null) =>
  ({
    revenue,
    cost,
    profit: cost === null ? null : String(Number(revenue) - Number(cost)),
  }) as SalesInvoiceReportLine;

const invoice = (
  fields: Pick<Invoice, "channel" | "source" | "storeName">,
  lines: SalesInvoiceReportLine[],
) => ({ ...fields, lines }) as Invoice;

const shopee = (storeName: string) =>
  ({ channel: "marketplace", source: "shopee_import", storeName }) as const;

describe("grossMarginRows", () => {
  it("adds one row per toko, biggest first, then the total", () => {
    const rows = grossMarginRows([
      invoice(shopee("Pawship A"), [line("100000", "60000")]),
      invoice(shopee("Pawship B"), [line("300000", "150000")]),
      invoice(shopee("Pawship A"), [line("100000", "40000")]),
    ]);

    expect(rows.map((row) => [row.channel, row.profit, row.margin])).toEqual([
      ["Shopee – Pawship B", 150000, 50],
      ["Shopee – Pawship A", 100000, 50],
      ["Semua channel", 250000, 50],
    ]);
  });

  it("keeps a line without HPP in Nett sales and out of the margin", () => {
    const [row] = grossMarginRows([
      invoice(shopee("Pawship A"), [line("100000", "60000"), line("50000", null)]),
    ]);

    expect(row).toMatchObject({ revenue: 150000, cost: 60000, profit: 40000, margin: 40, missingCost: 1 });
  });

  it("gives nothing for a period with no sales", () => {
    expect(grossMarginRows([])).toEqual([]);
  });
});
