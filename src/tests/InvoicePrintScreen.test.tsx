import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InvoicePrintScreen } from "@/features/sales";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { tenantService } from "@/services/tenant.service";
import type {
  CustomerInvoiceDetail,
  CustomerInvoicePayment,
} from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customerInvoice.service");
jest.mock("@/services/tenant.service");
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

/**
 * CETAK FAKTUR — the customer's own copy, on A4, on a page of its own.
 *
 * A DIFFERENT DOCUMENT FROM THE KWITANSI, and the distinction is the point: a
 * kwitansi says "we received this money on this day" about ONE payment; this
 * says "here is what you bought and what you owe" about the whole bill. Handing
 * a customer who paid a third of a bill a sheet headlining the whole of it is
 * exactly the confusion `PaymentReceipt`'s header warns about from its side.
 *
 * A PAGE RATHER THAN A DIALOG, which is why this file exists at all: these cases
 * used to open a modal from the detail screen. Printing is a task people come
 * back to — the printer was out of paper, the customer wants another copy — and
 * a dialog cannot be linked to, opened in a second tab, or handed to a
 * colleague.
 */
const INVOICE_ID = "inv1";

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as unknown as jest.MockedFunction<T>;

const paymentRow = (
  over: Partial<CustomerInvoicePayment> = {},
): CustomerInvoicePayment =>
  ({
    paymentId: "pay1",
    at: "2026-08-27T00:00:00.000Z",
    amount: "100000.0000",
    method: "transfer",
    channelId: "ch1",
    channelName: "BCA",
    ref: null,
    byUserId: "u1",
    byUserName: "Mbak Sari",
    journalEntryId: "je-pay1",
    journalEntryNumber: "JE-2026-08-0412",
    isVoided: false,
    voidedAt: null,
    voidReason: null,
    reversalJournalEntryId: null,
    reversalJournalEntryNumber: null,
    ...over,
  }) as CustomerInvoicePayment;

const detail = (over: Partial<CustomerInvoiceDetail> = {}) =>
  ({
    _id: INVOICE_ID,
    invoiceNumber: "INV-2026-0042",
    customerId: "c1",
    customerName: "Bu Sari",
    branchId: "b1",
    branchName: "Cabang Pusat",
    invoiceDate: "2026-08-27T00:00:00.000Z",
    dueDate: "2026-09-26T00:00:00.000Z",
    total: "300000.0000",
    paidAmount: "100000.0000",
    outstandingAmount: "200000.0000",
    status: "partial",
    source: "manual",
    isOverdue: false,
    notes: null,
    createdByName: null,
    journalEntryId: null,
    journalEntries: [],
    bookings: [],
    stockImpact: [],
    credit: null,
    payments: [paymentRow()],
    posTransactionId: null,
    voidedAt: null,
    voidReason: null,
    warehouseId: null,
    channel: "manual",
    invoiceDiscount: null,
    items: [
      {
        kind: "product",
        refId: "p1",
        name: "Royal Canin 2kg",
        sku: "RC-2KG",
        qty: "2.0000",
        unitPrice: "150000.0000",
        discount: null,
        lineTotal: "300000.0000",
        hppAtTime: null,
        bookingId: null,
        petId: null,
        petName: null,
        groomerName: null,
      },
    ],
    totals: {
      subtotal: "300000.0000",
      itemDiscount: "0.0000",
      invoiceDiscount: "0.0000",
      dpp: "270270.0000",
      tax: "29730.0000",
      grandTotal: "300000.0000",
    },
    ...over,
  }) as unknown as CustomerInvoiceDetail;

beforeEach(() => {
  asMock(customerInvoiceService.getById).mockResolvedValue(detail());
  asMock(tenantService.me).mockResolvedValue({
    _id: "t1",
    name: "Buloo Petshop",
  } as never);
});

const open = async (invoice = detail()) => {
  asMock(customerInvoiceService.getById).mockResolvedValue(invoice);
  renderWithAuth(<InvoicePrintScreen invoiceId={INVOICE_ID} />);
  await screen.findByText("FAKTUR");
};

describe("what the sheet says", () => {
  it("heads it FAKTUR, with the number and the shop", async () => {
    await open();

    expect(screen.getByText("FAKTUR")).toBeInTheDocument();
    // Twice: the letterhead, and again over the signature line.
    expect(screen.getAllByText("Buloo Petshop").length).toBe(2);
    expect(screen.getAllByText("INV-2026-0042").length).toBeGreaterThan(0);
  });

  it("names who it is billed to", async () => {
    await open();

    expect(screen.getByText("Ditagihkan kepada")).toBeInTheDocument();
    expect(screen.getAllByText("Bu Sari").length).toBeGreaterThan(0);
  });

  /*
    THE WHOLE BILL, NOT ONE PAYMENT — the line that separates this document from
    the kwitansi.
  */
  it("shows the transaction value and what is still owed", async () => {
    await open();

    expect(screen.getByText("Nilai Transaksi")).toBeInTheDocument();
    expect(screen.getByText("SISA TAGIHAN")).toBeInTheDocument();
  });

  it("lists the payments individually", async () => {
    await open();

    expect(screen.getByText(/^Dibayar /)).toBeInTheDocument();
  });

  it("dates a payment line short, so the figure beside it fits", async () => {
    await open();

    expect(screen.getByText(/^Dibayar 27 Agu 2026/)).toBeInTheDocument();
  });

  /*
    A CANCELLED PAYMENT IS NOT ON THE CUSTOMER'S COPY. It has posted its own
    reversal and taken the money back out — listing it would show a credit they
    do not have.
  */
  it("leaves a cancelled payment off the sheet", async () => {
    await open(
      detail({
        payments: [
          paymentRow({ isVoided: true, voidedAt: "2026-08-28T00:00:00.000Z" }),
        ],
      }),
    );

    expect(screen.queryByText(/^Dibayar /)).not.toBeInTheDocument();
  });

  /*
    THE WORST THING THIS SHEET COULD PRODUCE is a voided invoice that looks
    valid — a document somebody can be asked to pay against.
  */
  it("stamps a voided invoice, and stops asking for money", async () => {
    await open(detail({ status: "void", voidReason: "Salah pelanggan" }));

    expect(screen.getByText(/FAKTUR INI DIBATALKAN/)).toBeInTheDocument();
    expect(screen.getByText(/Salah pelanggan/)).toBeInTheDocument();
    expect(screen.queryByText("SISA TAGIHAN")).not.toBeInTheDocument();
  });

  /*
    AN OLDER INVOICE STILL PRINTS. Everything raised before PCR-030 was born at
    the till and stores a total with no `items` and no `totals` — refusing to
    print it would deny a customer a copy of a bill that genuinely exists.
  */
  it("prints a pre-PCR-030 invoice with the little it has", async () => {
    await open(detail({ items: [], totals: null }));

    expect(screen.getByText("Nilai Transaksi")).toBeInTheDocument();
    expect(screen.queryByText("Deskripsi")).not.toBeInTheDocument();
  });
});

/**
 * THE TWO OPTIONS THAT MAP TO SOMETHING REALLY ON THE SHEET.
 *
 * The mockup offers more — format, language, a bank-info switch — and none of
 * those is built. The screen's own header says why: only A4 exists, the product
 * is Bahasa by rule, and the bank line already prints only when the shop has set
 * one. A picker whose other options do nothing is worse than one option.
 */
describe("the print options", () => {
  it("starts with both on, so the full document is the default", async () => {
    await open();

    expect(screen.getByText(/^Dibayar /)).toBeInTheDocument();
    expect(screen.getByText(/Tanda tangan|Hormat kami/)).toBeInTheDocument();
  });

  it("drops the payment lines when asked", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("checkbox", { name: /riwayat pembayaran/i }));

    expect(screen.queryByText(/^Dibayar /)).not.toBeInTheDocument();
    // What is owed stays: hiding that is not a formatting choice.
    expect(screen.getByText("SISA TAGIHAN")).toBeInTheDocument();
  });

  it("drops the signature block when asked", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("checkbox", { name: /kolom tanda tangan/i }));

    expect(screen.queryByText(/Hormat kami/)).not.toBeInTheDocument();
    // The letterhead is not the signature — it stays.
    expect(screen.getAllByText("Buloo Petshop").length).toBe(1);
  });
});

/**
 * THE THREE PAPERS.
 *
 * WHY THERMAL IS HERE AT ALL, and it is not "the till already prints one": an
 * invoice raised BY HAND has no sale behind it, so there is no struk. A shop
 * with only a thermal printer could not print an invoice at all.
 *
 * THE TWO LAYOUTS MUST NEVER DISAGREE ABOUT THE FACTS — only about how much room
 * there is to state them. That is what most of these assert.
 */
describe("the three papers", () => {
  const pickFormat = async (
    user: ReturnType<typeof userEvent.setup>,
    label: RegExp,
  ) => {
    await user.click(screen.getByRole("combobox", { name: /format/i }));
    await user.click(await screen.findByRole("option", { name: label }));
  };

  it("offers A4 and both thermal widths", async () => {
    const user = userEvent.setup();
    await open();

    await user.click(screen.getByRole("combobox", { name: /format/i }));

    expect(await screen.findByRole("option", { name: /A4/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /58 mm/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /80 mm/ })).toBeInTheDocument();
  });

  /*
    A4 IS THE DEFAULT because an invoice is the copy a customer is sent, and the
    till's own stored paper size is deliberately not reused — a shop usually has
    a thermal head at the counter and an A4 printer in the office.
  */
  it("starts on A4", async () => {
    await open();

    // The five-column table only exists on A4.
    expect(screen.getByText("Deskripsi")).toBeInTheDocument();
  });

  it("switches the sheet to a stacked layout on a roll", async () => {
    const user = userEvent.setup();
    await open();

    await pickFormat(user, /58 mm/);

    // No table on a roll — thirty characters is not five columns.
    expect(screen.queryByText("Deskripsi")).not.toBeInTheDocument();
    expect(screen.getByText("Royal Canin 2kg")).toBeInTheDocument();
  });

  /*
    THE FACTS SURVIVE THE NARROWER PAPER. Different words for the same figures —
    "SISA" rather than "SISA TAGIHAN" — but never a missing one.
  */
  it("still says the total and what is owed", async () => {
    const user = userEvent.setup();
    await open();

    await pickFormat(user, /80 mm/);

    expect(screen.getByText("TOTAL")).toBeInTheDocument();
    expect(screen.getByText("SISA")).toBeInTheDocument();
  });

  it("still lists the payments", async () => {
    const user = userEvent.setup();
    await open();

    await pickFormat(user, /80 mm/);

    expect(screen.getByText(/^Dibayar /)).toBeInTheDocument();
  });

  /*
    THE WORST THING EITHER PAPER COULD PRODUCE, asserted on both: a voided
    invoice that looks payable.
  */
  it("stamps a voided invoice on the roll too", async () => {
    const user = userEvent.setup();
    await open(detail({ status: "void", voidReason: "Salah pelanggan" }));

    await pickFormat(user, /58 mm/);

    expect(screen.getByText(/FAKTUR INI DIBATALKAN/)).toBeInTheDocument();
    expect(screen.queryByText("SISA")).not.toBeInTheDocument();
  });

  /*
    NOBODY SIGNS A THERMAL SLIP. The switch says so rather than being a control
    that changes nothing when clicked.
  */
  it("disables the signature switch on a roll, and says why", async () => {
    const user = userEvent.setup();
    await open();

    await pickFormat(user, /58 mm/);

    expect(
      screen.getByRole("checkbox", { name: /kolom tanda tangan/i }),
    ).toBeDisabled();
    expect(screen.getByText(/hanya untuk a4/i)).toBeInTheDocument();
  });

  it("prints no signature block on a roll", async () => {
    const user = userEvent.setup();
    await open();

    await pickFormat(user, /80 mm/);

    expect(screen.queryByText(/Hormat kami/)).not.toBeInTheDocument();
  });

  /* The payment switch still works on a roll — it is about content, not room. */
  it("still drops the payment lines when asked, on a roll", async () => {
    const user = userEvent.setup();
    await open();

    await pickFormat(user, /80 mm/);
    await user.click(
      screen.getByRole("checkbox", { name: /riwayat pembayaran/i }),
    );

    expect(screen.queryByText(/^Dibayar /)).not.toBeInTheDocument();
    expect(screen.getByText("SISA")).toBeInTheDocument();
  });
});

describe("when the invoice cannot be read", () => {
  it("says so and offers the way back, rather than an empty sheet", async () => {
    asMock(customerInvoiceService.getById).mockRejectedValue(
      Object.assign(new Error("Not found"), { status: 404 }),
    );

    renderWithAuth(<InvoicePrintScreen invoiceId={INVOICE_ID} />);

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /kembali ke daftar faktur/i }),
      ).toBeInTheDocument(),
    );
  });
});
