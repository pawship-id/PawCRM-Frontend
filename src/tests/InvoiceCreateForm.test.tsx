import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Swal from "sweetalert2";

import { InvoiceCreateForm } from "@/features/sales";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { customerService } from "@/services/customer.service";
import { branchService } from "@/services/branch.service";
import { warehouseService } from "@/services/warehouse.service";
import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";
import { tenantService } from "@/services/tenant.service";
import { ApiError } from "@/services/api-error";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

jest.mock("@/features/auth", () => ({
  useAuth: () => ({ user: { allBranches: true, branchAccess: [] } }),
}));

/**
 * The form that raises an invoice by hand.
 *
 * WHAT IS ASSERTED THROUGHOUT IS THE REQUEST BODY, because what this form sends
 * is more constrained than what it shows: prices and names are read from the
 * catalogue server-side, so a payload carrying either would mean a client could
 * discount a sale without approval.
 */
const page = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
});

const BRANCH = { _id: "br1", name: "Cabang Pusat", code: "PST" };
const WAREHOUSE = { _id: "wh1", name: "Gudang Pusat", defaultBranchId: "br1", isActive: true };
const CENTRAL = { _id: "wh0", name: "Gudang Pusat Bersama", defaultBranchId: null, isActive: true };
const OTHER = { _id: "wh2", name: "Gudang Cabang Lain", defaultBranchId: "br2", isActive: true };
const PRODUCT = { _id: "p1", name: "Kalung Nylon", sku: "KLG", sellPrice: "100000" };
const SERVICE = { _id: "s1", name: "Grooming", price: "150000" };

function mockLookups(overrides: { warehouses?: unknown[] } = {}) {
  jest.spyOn(customerService, "list").mockResolvedValue(page([{ _id: "c1", name: "Bu Sari" }]) as never);
  jest.spyOn(branchService, "list").mockResolvedValue(page([BRANCH]) as never);
  jest
    .spyOn(warehouseService, "list")
    .mockResolvedValue(page(overrides.warehouses ?? [WAREHOUSE]) as never);
  jest.spyOn(productService, "list").mockResolvedValue(page([PRODUCT]) as never);
  jest.spyOn(serviceService, "list").mockResolvedValue(page([SERVICE]) as never);
  jest
    .spyOn(tenantService, "me")
    .mockResolvedValue({ settings: { taxRate: 11, priceIncludesTax: true } } as never);
}

/**
 * Opens a labelled picker and chooses the option matching `option`.
 *
 * The trigger is a `button`, not a `combobox` — `FilterTrigger` says why: a
 * div-with-role would be ignored by assistive tech, so the shell is a real
 * button and the popover carries the options.
 */
async function pick(field: RegExp, option: RegExp) {
  await userEvent.click(await screen.findByRole("button", { name: field }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

/** Fills the header and adds one product line — the shortest valid invoice. */
async function fillMinimal() {
  await pick(/^Pelanggan$/i, /Bu Sari/);
  await pick(/^Cabang$/i, /Cabang Pusat/);
  await pick(/^Gudang$/i, /Gudang Pusat/);
  await pick(/tambah barang atau jasa/i, /Kalung Nylon/);
  await userEvent.click(screen.getByRole("button", { name: /tambah baris/i }));
}

const submit = () =>
  userEvent.click(screen.getByRole("button", { name: /terbitkan faktur/i }));

const sent = () =>
  (customerInvoiceService.create as jest.Mock).mock.calls[0][0];

beforeEach(() => {
  push.mockClear();
  (Swal.fire as jest.Mock).mockClear();
  mockLookups();
  jest
    .spyOn(customerInvoiceService, "create")
    .mockResolvedValue({ _id: "inv1", invoiceNumber: "INV/PST/2608/0001" } as never);
});

afterEach(() => jest.restoreAllMocks());

describe("what the form sends", () => {
  it("sends the line, and no price with it", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await submit();

    await waitFor(() => expect(customerInvoiceService.create).toHaveBeenCalled());
    expect(sent().items).toEqual([
      { kind: "product", refId: "p1", qty: "1", discount: null },
    ]);
    // A price a client can set is a discount nobody approved.
    expect(sent().items[0]).not.toHaveProperty("unitPrice");
    expect(sent().items[0]).not.toHaveProperty("name");
  });

  it("goes to the new invoice and toasts its number", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/sales/inv1"));
  });

  it("sends a line discount as typed, not as resolved", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await userEvent.type(screen.getByLabelText(/^Diskon Kalung Nylon$/i), "10");
    await submit();

    await waitFor(() => expect(customerInvoiceService.create).toHaveBeenCalled());
    expect(sent().items[0].discount).toEqual({ mode: "percent", value: "10" });
    expect(sent().items[0].discount).not.toHaveProperty("resolvedAmount");
  });

  /*
    A GROOMING BILL SHIPS NOTHING, so no warehouse is sent — and none is
    demanded. Sending one would claim goods left a shelf that nothing came off.
  */
  /*
    `manual` IS THE DEFAULT, and it is the PRD's word: every invoice raised on
    this form was typed by somebody. `marketplace` is for orders that sync in
    once that module exists.
  */
  it("sends the channel, defaulting to manual", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await submit();

    await waitFor(() => expect(customerInvoiceService.create).toHaveBeenCalled());
    expect(sent().channel).toBe("manual");
  });

  it("omits the warehouse when nothing is a product", async () => {
    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await pick(/tambah barang atau jasa/i, /Grooming/);
    await userEvent.click(screen.getByRole("button", { name: /tambah baris/i }));
    await submit();

    await waitFor(() => expect(customerInvoiceService.create).toHaveBeenCalled());
    expect(sent()).not.toHaveProperty("warehouseId");
  });
});

describe("what the form shows", () => {
  it("shows the catalogue price, read-only", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();

    // Two of them at qty 1 — the unit price and the line total. Nudged to 2 so
    // the two columns carry DIFFERENT figures and each can be asserted for what
    // it is, rather than passing on whichever happened to match.
    await userEvent.clear(screen.getByLabelText(/^Jumlah Kalung Nylon$/i));
    await userEvent.type(screen.getByLabelText(/^Jumlah Kalung Nylon$/i), "2");

    const row = screen.getByRole("row", { name: /Kalung Nylon/ });
    expect(within(row).getByText("Rp 100.000")).toBeInTheDocument();
    expect(within(row).getByText("Rp 200.000")).toBeInTheDocument();
    // The price is TEXT, never an input: a price a client can set is a discount
    // nobody approved.
    expect(within(row).queryByLabelText(/harga/i)).not.toBeInTheDocument();
  });

  it("adds up the total as lines are added", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await userEvent.clear(screen.getByLabelText(/^Jumlah Kalung Nylon$/i));
    await userEvent.type(screen.getByLabelText(/^Jumlah Kalung Nylon$/i), "3");

    const recap = screen.getByText(/^Total tagihan$/i).closest("div")!;
    expect(within(recap).getByText("Rp 300.000")).toBeInTheDocument();
  });

  /*
    THE INVOICE DISCOUNT IS MEASURED AFTER THE LINE ONES, which changes the
    answer — and the screen has to agree with the server about which.
  */
  it("measures the invoice discount against what the line discounts left", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await userEvent.type(screen.getByLabelText(/^Diskon Kalung Nylon$/i), "10");
    await userEvent.type(screen.getByLabelText(/^Diskon faktur$/i), "10");

    // 100.000 − 10% = 90.000; then 10% of 90.000 = 9.000; total 81.000.
    const recap = screen.getByText(/^Total tagihan$/i).closest("div")!;
    expect(within(recap).getByText("Rp 81.000")).toBeInTheDocument();
  });

  it("says the price already includes tax when the tenant prices that way", async () => {
    render(<InvoiceCreateForm />);
    expect(
      await screen.findByText(/sudah termasuk PPN/i),
    ).toBeInTheDocument();
  });

  /*
    THE RECAP HAS TO ADD UP. It ran Subtotal Rp 100.000 → Total Rp 111.000 with
    nothing between them, and the only clue where the difference came from was a
    sentence underneath — a caption is not an explanation of an arithmetic
    somebody is checking line by line.
  */
  it("shows the tax as its own row when it is added on top", async () => {
    jest
      .spyOn(tenantService, "me")
      .mockResolvedValue({ settings: { taxRate: 11, priceIncludesTax: false } } as never);

    render(<InvoiceCreateForm />);
    await fillMinimal();

    // `dl`, not `div`: "Total tagihan" sits in its own flex row, so the row is
    // the wrong scope for a sibling line.
    const recap = screen.getByText(/^Total tagihan$/i).closest("dl")!;
    expect(within(recap).getByText("PPN 11%")).toBeInTheDocument();
    expect(within(recap).getByText("Rp 11.000")).toBeInTheDocument();
    // 100.000 + 11.000, and the two visible rows account for the whole of it.
    expect(within(recap).getByText("Rp 111.000")).toBeInTheDocument();
  });

  /*
    NO ROW WHERE PRICES ALREADY INCLUDE THE TAX. There IS tax on such an invoice
    — it is simply inside the subtotal already — so a row reading "PPN Rp 0"
    would deny a tax that was charged.
  */
  it("shows no tax row when the price already includes it", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();

    const recap = screen.getByText(/^Total tagihan$/i).closest("dl")!;
    expect(within(recap).queryByText(/^PPN/)).not.toBeInTheDocument();
  });
});

describe("what the form refuses to submit", () => {
  /**
   * ONE REASON AT A TIME, and the FIRST unanswered question — somebody filling a
   * form top to bottom wants to know what to do next, not an inventory of
   * everything they have not reached.
   *
   * Asserted through "Belum bisa disimpan", not by searching the page for the
   * sentence: "Pilih pelanggan" is also the picker's own placeholder, and a bare
   * text query would pass on the placeholder while the bar said nothing.
   */
  it("names the first missing answer, and no more", async () => {
    render(<InvoiceCreateForm />);
    await screen.findByRole("button", { name: /terbitkan faktur/i });

    expect(screen.getByRole("button", { name: /terbitkan faktur/i })).toBeDisabled();
    expect(screen.getByText(/belum bisa disimpan/i)).toHaveTextContent(
      /pilih pelanggan dulu/i,
    );
    // Not also complaining about the branch and the lines it has not reached.
    expect(screen.getByText(/belum bisa disimpan/i)).not.toHaveTextContent(
      /cabang/i,
    );
  });

  it("asks for a warehouse once a product line exists", async () => {
    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await pick(/tambah barang atau jasa/i, /Kalung Nylon/);
    await userEvent.click(screen.getByRole("button", { name: /tambah baris/i }));

    expect(screen.getByText(/belum bisa disimpan/i)).toHaveTextContent(
      /pilih gudang/i,
    );
    expect(screen.getByRole("button", { name: /terbitkan faktur/i })).toBeDisabled();
  });
});

describe("the warehouse list", () => {
  /*
    A CENTRAL WAREHOUSE BELONGS TO NOBODY AND SERVES EVERYONE — the one shape a
    same-value filter would have wrongly excluded, and the same rule the server
    enforces when it pairs a branch with a shelf.
  */
  it("offers this branch's warehouses and the central ones, not another branch's", async () => {
    mockLookups({ warehouses: [WAREHOUSE, CENTRAL, OTHER] });
    render(<InvoiceCreateForm />);

    await pick(/^Cabang$/i, /Cabang Pusat/);
    await userEvent.click(screen.getByRole("button", { name: /^Gudang$/i }));

    expect(await screen.findByRole("option", { name: /Gudang Pusat$/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Bersama/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Cabang Lain/ })).not.toBeInTheDocument();
  });
});

describe("when the server refuses", () => {
  /*
    A TOAST, NOT AN INLINE ALERT — a deliberate departure from ui-rules §9. This
    form is long: the refusals that matter here arrive while the cursor is in a
    table halfway down the page, where an alert pinned to the top is a message
    nobody sees.
  */
  it("toasts the reason, and keeps the form", async () => {
    jest
      .spyOn(customerInvoiceService, "create")
      .mockRejectedValue(new ApiError("Branch 'Cabang Pusat' has no code yet", 400));

    render(<InvoiceCreateForm />);
    await fillMinimal();
    await submit();

    await waitFor(() => expect(Swal.fire).toHaveBeenCalled());
    const options = (Swal.fire as jest.Mock).mock.calls.at(-1)?.[0];
    expect(options).toMatchObject({
      icon: "error",
      title: "Branch 'Cabang Pusat' has no code yet",
      // 8s rather than 3: every refusal here carries an instruction.
      timer: 8000,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("unlocks the button so the form can be corrected and resubmitted", async () => {
    // The form stays mounted after a refusal, so a button locked forever is
    // worse than the error that locked it.
    jest
      .spyOn(customerInvoiceService, "create")
      .mockRejectedValue(new ApiError("Not enough stock", 400));

    render(<InvoiceCreateForm />);
    await fillMinimal();
    await submit();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /terbitkan faktur/i })).toBeEnabled(),
    );
  });
});
