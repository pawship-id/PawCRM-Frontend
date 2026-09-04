import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReceiptDialog } from "@/features/pos/components/ReceiptDialog";
import { ReceiptPreview } from "@/features/pos/components/ReceiptPreview";
import { posService } from "@/services/pos.service";
import type { PosReceipt } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/pos.service");

const mockedPos = posService as jest.Mocked<typeof posService>;

const SALE_ID = "5a7f1f77bcf86cd7994390e1";

const receipt = (overrides: Partial<PosReceipt> = {}): PosReceipt => ({
  header: {
    tenantName: "Buloo Petshop",
    branchName: "Toko Pusat",
    address: "Jl. Melati 12",
    phone: "081234567890",
    receiptFooter: "Terima kasih",
  },
  transactionNumber: "POS-20260825-0001",
  receiptToken: "tokenForThisSaleOnly",
  paidAt: "2026-08-25T03:00:00.000Z",
  status: "paid",
  cashierUserId: "u1",
  cashierName: "Salwa",
  customerName: null,
  items: [
    {
      kind: "product",
      name: "Royal Canin Adult 2kg",
      sku: "RC-ADULT-2KG",
      qty: "1.0000",
      unitPrice: "300000.0000",
      lineTotal: "300000.0000",
      discount: null,
      petName: null,
      groomerName: null,
    },
  ],
  otherCharges: [],
  totals: {
    subtotal: "300000.0000",
    itemDiscount: "0.0000",
    cartDiscount: "0.0000",
    otherCharges: "0.0000",
    dpp: "270270.2703",
    tax: "29729.7297",
    grandTotal: "300000.0000",
    credit: "0.0000",
  },
  payments: [
    {
      channelId: "c1",
      channelType: "cash",
      channelName: "Kas Toko",
      amount: "350000.0000",
      change: "50000.0000",
      reference: null,
    },
  ],
  credit: null,
  note: null,
  ...overrides,
});

describe("ReceiptPreview — FR-8", () => {
  it("prints the shop from the sale's branch", () => {
    renderWithAuth(<ReceiptPreview receipt={receipt()} size="80" />);

    expect(screen.getByText("Buloo Petshop")).toBeInTheDocument();
    expect(screen.getByText("Jl. Melati 12")).toBeInTheDocument();
  });

  it("omits a line the shop never filled in, rather than printing a blank", () => {
    renderWithAuth(
      <ReceiptPreview
        receipt={receipt({
          header: {
            tenantName: "Buloo Petshop",
            branchName: "Toko Pusat",
            address: "",
            phone: "",
            receiptFooter: "",
          },
        })}
        size="80"
      />,
    );

    // `undefined` on a thermal print is how a shop finds out its own data is
    // thin, in front of a customer.
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
  });

  it("shows the pet and groomer sub-line", () => {
    renderWithAuth(
      <ReceiptPreview
        receipt={receipt({
          items: [
            {
              kind: "service",
              name: "Grooming Full",
              sku: null,
              qty: "1.0000",
              unitPrice: "200000.0000",
              lineTotal: "200000.0000",
              discount: null,
              petName: "Bruno",
              groomerName: "Rina",
            },
          ],
        })}
        size="80"
      />,
    );

    expect(screen.getByText("Bruno · Rina")).toBeInTheDocument();
  });

  it("says so on a voided sale", () => {
    renderWithAuth(
      <ReceiptPreview receipt={receipt({ status: "void" })} size="80" />,
    );

    // A reprint that looked identical to a live sale is a refund waiting to
    // happen.
    expect(screen.getByText(/dibatalkan/i)).toBeInTheDocument();
  });

  it("carries the paper size on the sheet, which is what the print CSS reads", () => {
    const { container } = renderWithAuth(
      <ReceiptPreview receipt={receipt()} size="58" />,
    );

    expect(
      container.querySelector('[data-receipt-sheet="58"]'),
    ).toBeInTheDocument();
  });

  it("prints the change on a cash payment", () => {
    renderWithAuth(<ReceiptPreview receipt={receipt()} size="80" />);

    expect(screen.getByText(/kembalian/i)).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?50.000/)).toBeInTheDocument();
  });
});

describe("ReceiptDialog — sharing", () => {
  beforeEach(() => {
    mockedPos.receipt.mockResolvedValue(receipt());
  });

  it("copies rather than sends", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await user.click(await screen.findByRole("button", { name: /salin/i }));

    // FR-8: sending a message to a customer's phone from a till is something
    // they agreed to with the shop, not with us.
    expect(writeText).toHaveBeenCalled();
    expect(await screen.findByText(/sudah disalin/i)).toBeInTheDocument();
  });

  it("shows selectable text when the clipboard is blocked", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await user.click(await screen.findByRole("button", { name: /salin/i }));

    // Permission can be denied, and an insecure origin has no clipboard at all.
    expect(await screen.findByLabelText(/teks struk/i)).toBeInTheDocument();
  });

  it("shows the same fallback when there is no clipboard API at all", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await user.click(await screen.findByRole("button", { name: /salin/i }));

    expect(await screen.findByLabelText(/teks struk/i)).toBeInTheDocument();
  });
});

/**
 * A credit sale's slip (FR-7).
 *
 * The most important thing on it is what the customer still owes — and the
 * number they will quote when they come back to pay.
 */
describe("ReceiptPreview — sold on account", () => {
  const CREDIT = {
    invoiceNumber: "INV-2026-0041",
    dueDate: "2026-09-24T10:00:00.000Z",
    total: "300000.0000",
    paidAmount: "100000.0000",
    outstandingAmount: "200000.0000",
    status: "partial" as const,
  };

  it("prints what is owed, when, and under which number", async () => {
    mockedPos.receipt.mockResolvedValue(receipt({ credit: CREDIT }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    expect(await screen.findByText("Sisa piutang")).toBeInTheDocument();
    expect(screen.getByText("Rp 200.000")).toBeInTheDocument();
    expect(screen.getByText("INV-2026-0041")).toBeInTheDocument();
    expect(screen.getByText("24/09/2026")).toBeInTheDocument();
  });

  /*
    A DAY, NOT A MOMENT. Printing "24/09/2026 17.00" would invite a customer to
    read a deadline into the hour.
  */
  it("prints the due date without a time on it", async () => {
    mockedPos.receipt.mockResolvedValue(receipt({ credit: CREDIT }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await screen.findByText("Sisa piutang");
    expect(screen.queryByText(/24\/09\/2026 \d/)).not.toBeInTheDocument();
  });

  it("prints nothing about piutang on an ordinary cash sale", async () => {
    mockedPos.receipt.mockResolvedValue(receipt({ credit: null }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await screen.findByText(/buloo petshop/i);
    // Not "Rp 0" and not a heading with nothing under it — absent entirely.
    expect(screen.queryByText("Sisa piutang")).not.toBeInTheDocument();
    expect(screen.queryByText(/jatuh tempo/i)).not.toBeInTheDocument();
  });
});

/**
 * FR-5: the note prints as a line labelled **"Catatan:"**.
 *
 * Without the label it is one unmarked paragraph between the payment lines and
 * "Terima kasih" — and a customer reading their slip has no way to tell an
 * instruction the cashier typed from part of the shop's boilerplate.
 */
describe("ReceiptPreview — the transaction note", () => {
  it("prints it under a label, not as a loose paragraph", async () => {
    mockedPos.receipt.mockResolvedValue(
      receipt({ note: "Jangan pakai parfum" }),
    );

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    expect(await screen.findByText("Catatan:")).toBeInTheDocument();
    expect(screen.getByText("Jangan pakai parfum")).toBeInTheDocument();
  });

  it("prints nothing at all when there is no note", async () => {
    mockedPos.receipt.mockResolvedValue(receipt({ note: null }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await screen.findByText(/buloo petshop/i);
    // Not an empty "Catatan:" heading with nothing under it.
    expect(screen.queryByText("Catatan:")).not.toBeInTheDocument();
  });
});

/**
 * Who served them (FR-8).
 *
 * "Siapa yang melayani" is the first question asked when somebody comes back
 * unhappy, and until now the slip could not answer it: the id was in the payload
 * and never on the paper.
 */
describe("ReceiptPreview — the cashier", () => {
  it("names them on the slip", async () => {
    mockedPos.receipt.mockResolvedValue(receipt({ cashierName: "Salwa" }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    expect(await screen.findByText(/Kasir: Salwa/)).toBeInTheDocument();
  });

  /*
    TWO SHAPES OF ONE RECEIPT MUST NOT DISAGREE about who served the customer —
    they would end up holding a slip and a message with different answers to the
    same question.
  */
  it("names them in the copied text too", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    /*
      AFTER `userEvent.setup()`, never before: setup installs a clipboard stub of
      its own over `navigator.clipboard`, so defining ours first means testing
      userEvent's stub instead. `defineProperty` because the property is
      getter-only in jsdom and cannot be assigned.
    */
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    /*
      NO TOKEN, so the button copies TEXT — the fallback for sales settled before
      links existed. The rule under test is about that text, and a sale with a
      token would copy a URL instead.
    */
    mockedPos.receipt.mockResolvedValue(
      receipt({ cashierName: "Salwa", receiptToken: null }),
    );

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await screen.findByText(/Kasir: Salwa/);

    await user.click(
      screen.getByRole("button", { name: /salin untuk whatsapp/i }),
    );

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("Kasir: Salwa");
  });

  /*
    Null rather than a placeholder — inventing a name for a sale that carries no
    user would hide that it has none.
  */
  it("prints no cashier line when the sale names nobody", async () => {
    mockedPos.receipt.mockResolvedValue(receipt({ cashierName: null }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await screen.findByText(/buloo petshop/i);
    expect(screen.queryByText(/^Kasir:/)).not.toBeInTheDocument();
  });
});

/**
 * The shop's own closing line (FR-8).
 *
 * It used to be typed into this component, which meant a shop wanting "Barang
 * yang sudah dibeli tidak dapat ditukar" had no way to say so, and one wanting
 * nothing had no way to be quiet.
 */
describe("ReceiptPreview — the footer", () => {
  const withFooter = (receiptFooter: string) =>
    receipt({
      header: {
        tenantName: "Buloo Petshop",
        branchName: "Toko Pusat",
        address: "Jl. Melati 12",
        phone: "081234567890",
        receiptFooter,
      },
    });

  it("prints the branch's own words", async () => {
    mockedPos.receipt.mockResolvedValue(
      withFooter("Barang yang sudah dibeli tidak dapat ditukar."),
    );

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    expect(
      await screen.findByText("Barang yang sudah dibeli tidak dapat ditukar."),
    ).toBeInTheDocument();
  });

  /*
    THE FALLBACK IS THE SERVER'S — a branch that has written nothing arrives here
    already carrying "Terima kasih", so neither this component nor the copied
    text has to remember a default of its own.
  */
  it("prints the standard line for a branch with no words of its own", async () => {
    mockedPos.receipt.mockResolvedValue(withFooter("Terima kasih"));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    expect(await screen.findByText("Terima kasih")).toBeInTheDocument();
  });

  /*
    The component's own rule, not a product one: an empty paragraph is not
    something to draw. The server never sends this today.
  */
  it("draws no paragraph at all for an empty footer", async () => {
    mockedPos.receipt.mockResolvedValue(withFooter(""));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await screen.findByText(/buloo petshop/i);
    expect(
      screen.queryByText(/terima kasih sudah mampir/i),
    ).not.toBeInTheDocument();
  });

  /*
    TWO SHAPES OF ONE RECEIPT MUST NOT DISAGREE — the same rule the cashier line
    follows.
  */
  it("closes the copied text with the same line", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    // Tokenless, so the button copies text rather than a link — see above.
    mockedPos.receipt.mockResolvedValue({
      ...withFooter("Sampai jumpa lagi."),
      receiptToken: null,
    });

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await screen.findByText("Sampai jumpa lagi.");

    await user.click(
      screen.getByRole("button", { name: /salin untuk whatsapp/i }),
    );

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("Sampai jumpa lagi.");
  });
});

/**
 * The paper size, remembered (FR-8: "per perangkat di Pengaturan POS").
 *
 * The complaint this closes is small and constant: the size lived in the
 * dialog's own state, so it went back to 80 mm the moment the dialog shut. A
 * shop printing on 58 mm chose 58 mm again on every single sale, all day.
 */
describe("ReceiptDialog — the paper size", () => {
  const STORAGE_KEY = "buloo.pos.receiptSize";

  const sheet = (container: HTMLElement) =>
    container.ownerDocument.querySelector("[data-receipt-sheet]");

  it("lays the sheet out at what this device was set to", async () => {
    window.localStorage.setItem(STORAGE_KEY, "58");
    mockedPos.receipt.mockResolvedValue(receipt());

    const { container } = renderWithAuth(
      <ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />,
    );

    await screen.findByText(/buloo petshop/i);
    // The attribute the print stylesheet keys its three widths off.
    expect(sheet(container)).toHaveAttribute("data-receipt-sheet", "58");
  });

  it("falls back to 80 mm for a till nobody has set up", async () => {
    mockedPos.receipt.mockResolvedValue(receipt());

    const { container } = renderWithAuth(
      <ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />,
    );

    await screen.findByText(/buloo petshop/i);
    expect(sheet(container)).toHaveAttribute("data-receipt-sheet", "80");
  });

  it("ignores a stored value that is not a paper size", async () => {
    // Hand-edited storage, or a width this build no longer lays out.
    window.localStorage.setItem(STORAGE_KEY, "a3");
    mockedPos.receipt.mockResolvedValue(receipt());

    const { container } = renderWithAuth(
      <ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />,
    );

    await screen.findByText(/buloo petshop/i);
    expect(sheet(container)).toHaveAttribute("data-receipt-sheet", "80");
  });

  /*
    NOT A CONTROL HERE, and that is the decision being tested. Paper size follows
    the printer plugged into the device — it does not change from one customer to
    the next — so three buttons above a receipt were configuration in the wrong
    place, and they left Pengaturan Kasir as a second door to one value.
  */
  it("offers no way to change it, only a way to find where it lives", async () => {
    window.localStorage.setItem(STORAGE_KEY, "a4");
    mockedPos.receipt.mockResolvedValue(receipt());

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await screen.findByText(/buloo petshop/i);
    expect(
      screen.queryByRole("button", { name: "58 mm" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /ukuran kertas/i }),
    ).not.toBeInTheDocument();

    // Taking the buttons away without saying where they went would leave a
    // cashier staring at a receipt laid out wrong with nowhere to go.
    expect(
      screen.getByText(/ukuran kertas: A4 · ubah di pengaturan kasir/i),
    ).toBeInTheDocument();
  });
});

/**
 * "Salin Link WA" (FR-8).
 *
 * WHAT THE BUTTON COPIES CHANGED, and the label with it. It used to copy a block
 * of receipt text because there was no page to link to; now there is one, and
 * the PRD asks for the link.
 */
describe("ReceiptDialog — the WhatsApp link", () => {
  const writeText = jest.fn();

  /**
   * A driver with our clipboard behind it.
   *
   * THE ORDER IS LOAD-BEARING. `userEvent.setup()` installs a clipboard stub of
   * its own over `navigator.clipboard`, so defining ours first means every
   * assertion below silently tests userEvent's stub and sees no calls at all.
   * `defineProperty` rather than assignment because the property is getter-only
   * in jsdom.
   */
  function setup() {
    const user = userEvent.setup();

    writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    return user;
  }

  it("copies a link to the customer's own receipt page", async () => {
    const user = setup();
    mockedPos.receipt.mockResolvedValue(receipt());

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: /salin link wa/i }),
    );

    /*
      THE ORIGIN THE CASHIER IS ON, not a configured base URL: the till and the
      receipt page are the same app, and a configured value is one more thing to
      get wrong per deployment — wrong meaning every link sent that day leads
      nowhere.
    */
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/struk/tokenForThisSaleOnly`,
    );
  });

  it("says a LINK was copied, not a receipt", async () => {
    const user = setup();
    mockedPos.receipt.mockResolvedValue(receipt());

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await user.click(
      await screen.findByRole("button", { name: /salin link wa/i }),
    );

    expect(
      await screen.findByText(/tautan struk sudah disalin/i),
    ).toBeInTheDocument();
  });

  /*
    SALES SETTLED BEFORE 27 Agt HAVE NO TOKEN until the backfill seed runs. The
    button falls back to what it always did rather than refusing — and it renames
    itself, because a cashier pasting a link where they expected a receipt (or
    the reverse) would think it had failed.
  */
  it("falls back to copying the text when the sale predates links", async () => {
    const user = setup();
    mockedPos.receipt.mockResolvedValue(receipt({ receiptToken: null }));

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);

    await user.click(
      await screen.findByRole("button", { name: /salin untuk whatsapp/i }),
    );

    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain("Buloo Petshop");
    expect(copied).toContain("POS-20260825-0001");
    expect(copied).not.toContain("/struk/");
  });

  it("still shows the text to copy by hand when the clipboard is blocked", async () => {
    const user = setup();
    writeText.mockRejectedValue(new Error("denied"));
    mockedPos.receipt.mockResolvedValue(receipt());

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await user.click(
      await screen.findByRole("button", { name: /salin link wa/i }),
    );

    // An insecure origin has no clipboard API at all — and a till on plain
    // http:// is not unusual. What it shows is the link, since that is what it
    // tried to copy.
    const box = await screen.findByLabelText(/teks struk/i);
    expect(box).toHaveValue(
      `${window.location.origin}/struk/tokenForThisSaleOnly`,
    );
  });
});

/**
 * "Unduh PDF" and "Cetak" (FR-8).
 *
 * THE BROWSER'S OWN SAVE-AS-PDF, not a PDF library — which is what makes the
 * file identical to the preview rather than merely similar: it prints the very
 * markup the dialog draws. A library would redraw the receipt from the data, and
 * a second layout drifts from the first the day either one changes.
 *
 * WHAT PRINTS IS A COPY AT THE TOP LEVEL OF THE PAGE, not the preview inside the
 * dialog. `print/receipt.css` carries the two ways printing from inside the
 * dialog went wrong; these are about the node that replaced it.
 */
describe("ReceiptDialog — printing and saving", () => {
  const print = jest.fn();

  /** The receipt that would actually reach the paper. */
  const printedSheet = () =>
    document.querySelector("[data-print-root] [data-receipt-sheet]");

  /** The one the cashier is looking at. */
  const previewSheet = () =>
    document.querySelector("[data-slot='dialog-content'] [data-receipt-sheet]");

  beforeEach(() => {
    print.mockReset();
    // jsdom has no print implementation — it throws "Not implemented".
    Object.defineProperty(window, "print", {
      value: print,
      configurable: true,
    });
  });

  it("opens the print dialog, which is the only door to a PDF", async () => {
    const user = userEvent.setup();
    mockedPos.receipt.mockResolvedValue(receipt());

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await user.click(await screen.findByRole("button", { name: /unduh pdf/i }));

    expect(print).toHaveBeenCalled();
  });

  /*
    THE RECEIPT HAS TO BE IN THE PAGE BEFORE `print()` RUNS, not after.
    `window.print()` reads whatever is in the DOM at that instant, so a queued
    setState would have printed a page with no receipt on it at all — which is
    why the component flushes first.
  */
  it("puts the receipt in the page before printing, not after", async () => {
    const user = userEvent.setup();
    mockedPos.receipt.mockResolvedValue(receipt());

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await screen.findByText(/buloo petshop/i);

    expect(printedSheet()).toBeNull();

    await user.click(screen.getByRole("button", { name: /unduh pdf/i }));

    expect(printedSheet()).not.toBeNull();
    expect(print).toHaveBeenCalled();
  });

  /*
    OUTSIDE THE DIALOG, which is the entire point of the node. Inside it every
    ancestor is positioned, transformed or scrolls, and the receipt printed
    halfway down the page with its amounts off the edge.
  */
  it("prints from a node attached straight to the page", async () => {
    const user = userEvent.setup();
    mockedPos.receipt.mockResolvedValue(receipt());

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await user.click(await screen.findByRole("button", { name: /unduh pdf/i }));

    const root = document.querySelector("[data-print-root]");
    expect(root?.parentElement).toBe(document.body);
    expect(root?.closest("[data-slot='dialog-content']")).toBeNull();
  });

  /*
    WHAT MAKES "Unduh PDF" DIFFERENT FROM "Cetak" beside it. A PDF is filed,
    e-mailed and read on a screen, and a 48 mm strip is the wrong shape for all
    three — even when the till's own printer is 58 mm.
  */
  it("saves as A4 even on a 58 mm till, and leaves the preview alone", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("buloo.pos.receiptSize", "58");
    mockedPos.receipt.mockResolvedValue(receipt());

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await screen.findByText(/buloo petshop/i);

    await user.click(screen.getByRole("button", { name: /unduh pdf/i }));

    expect(printedSheet()).toHaveAttribute("data-receipt-sheet", "a4");
    // The cashier's own preview does not flicker to A4 and back.
    expect(previewSheet()).toHaveAttribute("data-receipt-sheet", "58");
  });

  it("prints on the paper the till actually has", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("buloo.pos.receiptSize", "58");
    mockedPos.receipt.mockResolvedValue(receipt());

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await user.click(await screen.findByRole("button", { name: /^cetak$/i }));

    expect(printedSheet()).toHaveAttribute("data-receipt-sheet", "58");
  });

  /*
    THE FILENAME. Every browser takes the default from `document.title` when
    somebody saves rather than prints — "Struk POS-20260825-0001.pdf" rather than
    whatever the page happened to be called.
  */
  it("names the file after the transaction, then puts the page back", async () => {
    const user = userEvent.setup();
    const before = document.title;
    mockedPos.receipt.mockResolvedValue(receipt());

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await user.click(await screen.findByRole("button", { name: /unduh pdf/i }));

    expect(document.title).toBe("Struk POS-20260825-0001");

    /*
      TIDIED ON `afterprint`, not on the line after `print()`. Chrome blocks
      until the dialog closes and Safari does not — tearing down unconditionally
      would pull the receipt out of the page while the dialog was still open.
    */
    window.dispatchEvent(new Event("afterprint"));

    expect(document.title).toBe(before);
    await waitFor(() => expect(printedSheet()).toBeNull());
  });
});

/**
 * What the print stylesheet hangs off (FR-8).
 *
 * It removes every top-level node that is not `[data-print-root]`. jsdom applies
 * no print stylesheet and computes no layout, so nothing here can prove the
 * receipt lands square on the paper — but it can prove the two ends still agree
 * on the name they meet under. Renaming one without the other prints a blank
 * page, silently, in a shop.
 */
describe("ReceiptDialog — what the print CSS depends on", () => {
  it("marks the printed node with the name the stylesheet keeps", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "print", {
      value: jest.fn(),
      configurable: true,
    });
    mockedPos.receipt.mockResolvedValue(receipt());

    renderWithAuth(<ReceiptDialog saleId={SALE_ID} onOpenChange={jest.fn()} />);
    await user.click(await screen.findByRole("button", { name: /^cetak$/i }));

    expect(document.querySelector("[data-print-root]")).not.toBeNull();
  });
});
