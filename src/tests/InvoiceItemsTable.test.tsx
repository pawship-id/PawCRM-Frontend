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

  /*
    TWO DASHES ON THIS ROW NOW, and they mean different things: no discount was
    given, and no tax allocation was recorded. The second only appears on
    invoices raised before the per-line figures were stored — which this fixture
    is — so the assertion counts them rather than looking for "the" dash.
  */
  it("shows a dash where a line has no discount", () => {
    render(<InvoiceItemsTable invoice={invoice()} />);

    const row = screen.getByRole("row", { name: /Kalung Nylon/ });
    expect(within(row).getAllByText("—").length).toBeGreaterThan(0);
  });

  /*
    THE TAX A LINE ACTUALLY CARRIED, frozen at issue and never recomputed. An
    invoice raised before it was stored says so with a dash: the allocation was
    not recorded, and inventing one on read would apply TODAY's rule to an old
    bill.
  */
  it("shows the tax a line carried, and a dash when none was recorded", () => {
    render(<InvoiceItemsTable invoice={invoice()} />);

    expect(screen.getByRole("columnheader", { name: "Pajak" })).toBeInTheDocument();
  });

  it("says Non-PPN rather than Rp 0 for an untaxed line", () => {
    render(
      <InvoiceItemsTable
        invoice={invoice({
          items: [
            {
              ...invoice().items[0],
              dpp: "100000.0000",
              tax: "0.0000",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Non-PPN")).toBeInTheDocument();
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

    expect(screen.queryByText("Diskon item")).not.toBeInTheDocument();
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

  it("breaks out the tax base and PPN when there is tax", () => {
    render(<InvoiceItemsTable invoice={invoice()} />);

    expect(screen.getByText("Dasar pengenaan pajak")).toBeInTheDocument();
    // Inclusive pricing — the fixture's grand total is the subtotal — so the
    // row says the tax is already inside rather than letting the eye add it.
    expect(screen.getByText(/^PPN/)).toHaveTextContent("PPN (sudah termasuk)");
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

/**
 * A TILL SALE, RENDERED BY THE SAME TABLE.
 *
 * The document stores no lines for one — two records of one basket are free to
 * disagree — so the detail read JOINS them from the sale under the invoice's own
 * field names. What these pin is the two rows the invoice shape has no field for,
 * and both are here because without them the recap does not add up:
 *
 *  1. the additive charges (ongkir), which a hand-raised invoice cannot have;
 *  2. on a sale part-paid at the counter, what was handed over there — this
 *     invoice is the REMAINDER, and a recap stopping at the basket total would
 *     contradict the figure in the page header by exactly what was already paid.
 */
describe("a sale joined from the till", () => {
  const tillInvoice = (overrides = {}) =>
    invoice({
      posTransactionId: "pos-1",
      otherCharges: [{ label: "Ongkos kirim", amount: "10000.0000" }],
      totals: {
        subtotal: "200000.0000",
        itemDiscount: "0.0000",
        invoiceDiscount: "20000.0000",
        dpp: "190000.0000",
        tax: "0.0000",
        grandTotal: "190000.0000",
        otherCharges: "10000.0000",
      },
      posSettlement: {
        transactionNumber: "TRX-1",
        paidAt: "2026-09-01T03:00:00.000Z",
        payments: [
          {
            channelId: "ch1",
            channelName: "Kas Laci",
            channelType: "cash",
            amount: "190000.0000",
            change: null,
            reference: null,
          },
        ],
        credit: "0.0000",
      },
      ...overrides,
    });

  it("itemises the other charges instead of one unexplained lump", () => {
    render(<InvoiceItemsTable invoice={tillInvoice()} />);

    expect(screen.getByText("Ongkos kirim")).toBeInTheDocument();
    expect(screen.getByText("+Rp 10.000")).toBeInTheDocument();
  });

  /*
    THE ROW USED TO VANISH. It was keyed on the invoice's own typed discount,
    which is null on a till sale — the basket discount lives on the sale — so the
    figure was real and the line was missing, and the recap stopped adding up.
  */
  it("shows a basket discount that has no typed form on the invoice", () => {
    render(<InvoiceItemsTable invoice={tillInvoice()} />);

    expect(screen.getByText("Diskon faktur")).toBeInTheDocument();
    expect(screen.getByText("−Rp 20.000")).toBeInTheDocument();
  });

  it("calls the bottom line Total tagihan when nothing went on account", () => {
    render(<InvoiceItemsTable invoice={tillInvoice()} />);

    expect(screen.getByText("Total tagihan")).toBeInTheDocument();
    expect(screen.queryByText("Dibayar di kasir")).not.toBeInTheDocument();
  });

  /*
    100.000 HANDED OVER ON A 190.000 BASKET raises a 90.000 receivable. The split
    is what reconciles this table with the total in the page header.
  */
  it("splits a part-paid sale into what was taken and what is owed", () => {
    render(
      <InvoiceItemsTable
        invoice={tillInvoice({
          posSettlement: {
            transactionNumber: "TRX-2",
            paidAt: "2026-09-01T03:00:00.000Z",
            payments: [],
            credit: "90000.0000",
          },
        })}
      />,
    );

    expect(screen.getByText("Total belanja")).toBeInTheDocument();
    expect(screen.getByText("−Rp 100.000")).toBeInTheDocument();
    const owed = screen.getByText("Sisa jadi piutang").parentElement as HTMLElement;
    expect(within(owed).getByText("Rp 90.000")).toBeInTheDocument();
  });

  /* A hand-raised invoice has none of it, and nothing about it changed. */
  it("leaves a manual invoice's recap alone", () => {
    render(<InvoiceItemsTable invoice={invoice()} />);

    expect(screen.getByText("Total tagihan")).toBeInTheDocument();
    expect(screen.queryByText("Ongkos kirim")).not.toBeInTheDocument();
    expect(screen.queryByText("Sisa jadi piutang")).not.toBeInTheDocument();
  });
});

/**
 * THE MOCKUP'S COLUMNS — `buloo-invoice-detail-v5`.
 *
 * A line's Total is what that line costs the customer: price × quantity, less
 * its own discount, plus its tax where the tax went on top. Read off the frozen
 * totals, never off today's setting.
 */
describe("the mockup's columns", () => {
  const exclusive = {
    subtotal: "100000.0000",
    itemDiscount: "0.0000",
    invoiceDiscount: "0.0000",
    dpp: "100000.0000",
    tax: "11000.0000",
    grandTotal: "111000.0000",
    taxRate: 11,
  };

  it("labels a line's tax with the rate the invoice froze, and adds it when it went on top", () => {
    render(
      <InvoiceItemsTable
        invoice={invoice({
          items: [
            line({
              qty: "1.0000",
              lineTotal: "100000.0000",
              dpp: "100000.0000",
              tax: "11000.0000",
            }),
          ],
          totals: exclusive,
        })}
      />,
    );

    const row = screen.getByRole("row", { name: /Kalung Nylon/ });
    expect(within(row).getByText("PPN 11%")).toBeInTheDocument();
    expect(within(row).getByText("+Rp 11.000")).toBeInTheDocument();
    expect(within(row).getByText("Rp 111.000")).toBeInTheDocument();
  });

  it("says the tax was already inside the price on inclusive pricing", () => {
    render(
      <InvoiceItemsTable
        invoice={invoice({
          items: [line({ dpp: "180180.1802", tax: "19819.8198" })],
        })}
      />,
    );

    const row = screen.getByRole("row", { name: /Kalung Nylon/ });
    expect(within(row).getByText(/^termasuk Rp/)).toBeInTheDocument();
    // Nothing added: the two units at Rp 100.000 are the whole of it.
    expect(within(row).getByText("Rp 200.000")).toBeInTheDocument();
  });

  it("nets a line's own discount out of its total", () => {
    render(
      <InvoiceItemsTable
        invoice={invoice({
          items: [
            line({
              discount: {
                mode: "amount",
                value: "20000.0000",
                resolvedAmount: "20000.0000",
              },
            }),
          ],
        })}
      />,
    );

    const row = screen.getByRole("row", { name: /Kalung Nylon/ });
    expect(within(row).getByText("Rp 180.000")).toBeInTheDocument();
  });

  it("says PPN without a rate on an invoice that never froze one", () => {
    render(
      <InvoiceItemsTable
        invoice={invoice({
          items: [line({ dpp: "180180.1802", tax: "19819.8198" })],
        })}
      />,
    );

    const row = screen.getByRole("row", { name: /Kalung Nylon/ });
    // A rate read off today's settings could name one this bill never used.
    expect(within(row).getByText("PPN")).toBeInTheDocument();
  });

  /*
    ONE GROUP PER ANIMAL, not per run of lines: a nail trim typed after the food
    still sits with the grooming it belongs to. Lines with no animal close the
    table.
  */
  it("groups the lines by animal, with the booking, and puts the goods last", () => {
    render(
      <InvoiceItemsTable
        canOpenBookings
        invoice={invoice({
          items: [
            line({ refId: "p9", name: "Vitamin Kucing", sku: "VIT" }),
            line({
              kind: "service",
              refId: "s1",
              name: "Grooming Basic",
              sku: null,
              petId: "pet1",
              petName: "Milo",
              bookingId: "bk1",
            }),
            line({
              kind: "service",
              refId: "s2",
              name: "Nail Trim",
              sku: null,
              petId: "pet1",
              petName: "Milo",
              bookingId: "bk1",
            }),
          ],
          bookings: [{ _id: "bk1", bookingNumber: "BK-2026-0091" }],
        })}
      />,
    );

    const rows = screen
      .getAllByRole("row")
      .map((row) => row.textContent ?? "");

    expect(rows[1]).toContain("Milo");
    expect(rows[2]).toContain("Grooming Basic");
    expect(rows[3]).toContain("Nail Trim");
    expect(rows[4]).toContain("Tanpa hewan");
    expect(rows[5]).toContain("Vitamin Kucing");
    expect(
      screen.getByRole("link", { name: /Booking BK-2026-0091/ }),
    ).toHaveAttribute("href", "/dashboard/booking/bk1");
  });

  it("names the booking without linking it for a role that cannot open bookings", () => {
    render(
      <InvoiceItemsTable
        invoice={invoice({
          items: [
            line({
              kind: "service",
              name: "Grooming Basic",
              sku: null,
              petId: "pet1",
              petName: "Milo",
              bookingId: "bk1",
            }),
          ],
          bookings: [{ _id: "bk1", bookingNumber: "BK-2026-0091" }],
        })}
      />,
    );

    expect(screen.getByText(/Booking BK-2026-0091/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  /*
    A TILL SALE'S BOOKINGS ARE NOT IN `bookings[]` — that list is built from the
    invoice's stored lines, and a till invoice stores none. The chip read
    "Booking" with no number until the server began naming it on the line.
  */
  it("takes the booking number from the line when bookings[] does not carry it", () => {
    render(
      <InvoiceItemsTable
        canOpenBookings
        invoice={invoice({
          posTransactionId: "pos1",
          items: [
            line({
              kind: "service",
              name: "Basic Grooming",
              sku: "GRM-BSC",
              petId: "pet1",
              petName: "Cici",
              bookingId: "bk9",
              bookingNumber: "BK-260906-003",
            }),
          ],
          bookings: [],
        })}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Booking BK-260906-003 →" }),
    ).toHaveAttribute("href", "/dashboard/booking/bk9");
  });

  it("draws no animal headings on a bill with no animal on it", () => {
    render(<InvoiceItemsTable invoice={invoice()} />);

    expect(screen.queryByText("Tanpa hewan")).not.toBeInTheDocument();
  });
});
