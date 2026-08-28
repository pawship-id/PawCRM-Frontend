import { render, screen, within } from "@testing-library/react";

import { InvoiceItemsTable } from "@/features/sales/components/InvoiceItemsTable";
import type { CustomerInvoiceDetail } from "@/types/api";

/**
 * What was billed, and the arithmetic behind the total.
 *
 * THE CASE WORTH KEEPING IN VIEW is the empty one. A till-born invoice carries
 * no lines at all — they live on the POS transaction that raised it — and
 * rendering an empty table for those would read as "this invoice has nothing in
 * it". It says where they are instead.
 */
const line = (overrides = {}) => ({
  kind: "product" as const,
  refId: "p1",
  name: "Kalung Nylon",
  sku: "KLG",
  qty: "2.0000",
  unitPrice: "100000.0000",
  discount: null,
  lineTotal: "200000.0000",
  hppAtTime: "60000.0000",
  ...overrides,
});

const invoice = (overrides = {}): CustomerInvoiceDetail =>
  ({
    _id: "inv1",
    posTransactionId: null,
    items: [line()],
    invoiceDiscount: null,
    totals: {
      subtotal: "200000.0000",
      itemDiscount: "0.0000",
      invoiceDiscount: "0.0000",
      dpp: "180180.1802",
      tax: "19819.8198",
      grandTotal: "200000.0000",
    },
    ...overrides,
  }) as unknown as CustomerInvoiceDetail;

describe("the lines", () => {
  it("names each item and its SKU", () => {
    render(<InvoiceItemsTable invoice={invoice()} />);

    expect(screen.getByText("Kalung Nylon")).toBeInTheDocument();
    expect(screen.getByText("KLG")).toBeInTheDocument();
  });

  it("labels a service, which has no SKU to show", () => {
    render(
      <InvoiceItemsTable
        invoice={invoice({
          items: [line({ kind: "service", name: "Grooming", sku: null })],
        })}
      />,
    );

    expect(screen.getByText("Jasa")).toBeInTheDocument();
  });

  it("shows the price and the line total apart", () => {
    render(<InvoiceItemsTable invoice={invoice()} />);

    const row = screen.getByRole("row", { name: /Kalung Nylon/ });
    expect(within(row).getByText("Rp 100.000")).toBeInTheDocument();
    expect(within(row).getByText("Rp 200.000")).toBeInTheDocument();
  });

  /*
    THE DISCOUNT SITS ON THE LINE THAT EARNED IT, and shows BOTH what was typed
    and what it came to. "10%" is what was agreed with the customer; the rupiah
    is what that worked out as, and a bill showing only one of them leaves the
    reader doing arithmetic to check the other.
  */
  it("shows a line discount as both the rate and the amount", () => {
    render(
      <InvoiceItemsTable
        invoice={invoice({
          items: [
            line({
              discount: {
                mode: "percent",
                value: "10.0000",
                resolvedAmount: "20000.0000",
              },
            }),
          ],
        })}
      />,
    );

    const row = screen.getByRole("row", { name: /Kalung Nylon/ });
    expect(within(row).getByText("−Rp 20.000")).toBeInTheDocument();
    expect(within(row).getByText("10%")).toBeInTheDocument();
  });

  it("shows a dash where a line has no discount", () => {
    render(<InvoiceItemsTable invoice={invoice()} />);

    const row = screen.getByRole("row", { name: /Kalung Nylon/ });
    expect(within(row).getByText("—")).toBeInTheDocument();
  });
});

describe("the totals", () => {
  it("shows the subtotal and the grand total", () => {
    render(<InvoiceItemsTable invoice={invoice()} />);

    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText("Total tagihan")).toBeInTheDocument();
  });

  /*
    ROWS THAT WOULD READ ZERO ARE LEFT OUT. An invoice with no discount showing
    "Diskon baris — Rp 0" invites the reader to wonder what it was for.
  */
  it("leaves out a discount row that would be zero", () => {
    render(<InvoiceItemsTable invoice={invoice()} />);

    expect(screen.queryByText("Diskon baris")).not.toBeInTheDocument();
    expect(screen.queryByText(/Diskon faktur/)).not.toBeInTheDocument();
  });

  it("shows the invoice discount with the rate that was typed", () => {
    render(
      <InvoiceItemsTable
        invoice={invoice({
          invoiceDiscount: {
            mode: "percent",
            value: "10.0000",
            resolvedAmount: "20000.0000",
          },
          totals: {
            subtotal: "200000.0000",
            itemDiscount: "0.0000",
            invoiceDiscount: "20000.0000",
            dpp: "162162.1622",
            tax: "17837.8378",
            grandTotal: "180000.0000",
          },
        })}
      />,
    );

    expect(screen.getByText(/Diskon faktur/)).toBeInTheDocument();
    expect(screen.getByText("(10%)")).toBeInTheDocument();
    expect(screen.getByText("−Rp 20.000")).toBeInTheDocument();
  });

  it("breaks out DPP and PPN when there is tax", () => {
    render(<InvoiceItemsTable invoice={invoice()} />);

    expect(screen.getByText("DPP")).toBeInTheDocument();
    expect(screen.getByText("PPN")).toBeInTheDocument();
  });

  it("leaves them out for a tenant that charges none", () => {
    // Two rows of zero would leave the reader wondering what they were for.
    render(
      <InvoiceItemsTable
        invoice={invoice({
          totals: {
            subtotal: "200000.0000",
            itemDiscount: "0.0000",
            invoiceDiscount: "0.0000",
            dpp: "200000.0000",
            tax: "0.0000",
            grandTotal: "200000.0000",
          },
        })}
      />,
    );

    expect(screen.queryByText("PPN")).not.toBeInTheDocument();
  });
});

/**
 * A TILL-BORN INVOICE CARRIES NO LINES, and that is a fact rather than a gap.
 * Copying the basket onto the invoice would be two records of one sale, free to
 * disagree.
 */
describe("an invoice with no lines", () => {
  it("points at the sale that raised it", () => {
    render(
      <InvoiceItemsTable
        invoice={invoice({ items: [], totals: null, posTransactionId: "pos1" })}
      />,
    );

    expect(screen.getByText(/lahir dari penjualan kasir/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  /*
    THE CRASH THIS REPLACES. `CustomerInvoiceDetail` declares `items` as an
    array, but an invoice written before PCR-030 has no such key at all — reads
    use `.lean()`, which skips schema defaults. The page died on `.length`.

    TypeScript could not catch it: it checks that this file agrees with the type
    declaration, never that the declaration agrees with the database.
  */
  it("survives an invoice whose fields predate the schema", () => {
    const legacy = {
      _id: "inv-old",
      posTransactionId: "pos-old",
      // No items, no totals, no invoiceDiscount — as `.lean()` returns them.
    } as unknown as CustomerInvoiceDetail;

    expect(() => render(<InvoiceItemsTable invoice={legacy} />)).not.toThrow();
    expect(screen.getByText(/lahir dari penjualan kasir/i)).toBeInTheDocument();
  });

  it("says so plainly when there is no sale behind it either", () => {
    render(<InvoiceItemsTable invoice={invoice({ items: [], totals: null })} />);

    expect(screen.getByText(/tidak punya rincian baris/i)).toBeInTheDocument();
  });
});
