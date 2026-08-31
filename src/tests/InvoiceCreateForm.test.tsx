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
import { bookingService } from "@/services/booking.service";
import { petService } from "@/services/pet.service";
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
  // The booking panel mounts as soon as a customer is chosen. Stubbed empty so
  // these cases stay about the form rather than about the bridge.
  jest.spyOn(bookingService, "bridge").mockResolvedValue([] as never);
  // PCR-035 — the animals a service line can be billed against.
  jest
    .spyOn(petService, "list")
    .mockResolvedValue(page([{ _id: "pet1", name: "Miko" }]) as never);
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

/**
 * PCR-035 — a service line can name the animal it is for.
 *
 * WHAT THIS IS ACTUALLY FOR is not the label on the invoice. Naming the animal
 * is what lets the SERVER raise a booking for the work: a grooming billed with
 * no pet reaches no day sheet, nobody is assigned, and the only record that the
 * work is owed is a line on a bill the customer takes home.
 */
describe("the animal a service is for", () => {
  /** Header, then one SERVICE line — the shortest bill that can carry a pet. */
  async function fillService() {
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await pick(/tambah barang atau jasa/i, /Grooming/);
    await userEvent.click(screen.getByRole("button", { name: /tambah baris/i }));
  }

  it("sends the pet on the service line", async () => {
    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);
    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent().items[0]).toMatchObject({ kind: "service", petId: "pet1" });
  });

  /*
    REQUIRED, AND THE FORM SAYS SO BEFORE THE SERVER HAS TO. A grooming billed
    with no animal reaches no day sheet: nobody is assigned, and the only record
    that the work is owed is a line on a bill the customer took home. The server
    refuses it too — this is a courtesy over that refusal, not the rule itself.
  */
  it("will not issue a service line with no animal", async () => {
    render(<InvoiceCreateForm />);
    await fillService();

    expect(
      screen.getByRole("button", { name: /terbitkan faktur/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/belum dipilih hewannya/i),
    ).toBeInTheDocument();
    expect(customerInvoiceService.create).not.toHaveBeenCalled();
  });

  it("unblocks once the animal is chosen", async () => {
    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    expect(
      screen.getByRole("button", { name: /terbitkan faktur/i }),
    ).toBeEnabled();
  });

  /*
    A DIFFERENT JOB, SAID DIFFERENTLY. "Ada baris jasa yang belum dipilih
    hewannya" in front of an empty dropdown is an instruction nobody can follow —
    the pet has to be registered first, which is a different screen.
  */
  it("says to register a pet when the customer has none", async () => {
    jest.spyOn(petService, "list").mockResolvedValue(page([]) as never);

    render(<InvoiceCreateForm />);
    await fillService();

    expect(
      await screen.findByText(/belum punya hewan/i),
    ).toBeInTheDocument();
  });

  /*
    THE RULE IS ABOUT SERVICES ONLY. A bill for goods must not be held up by a
    field it does not have — the server refuses a pet on a product line anyway.
  */
  it("does not block an invoice of only products", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();

    expect(
      screen.getByRole("button", { name: /terbitkan faktur/i }),
    ).toBeEnabled();
  });

  it("asks only for that customer's animals", async () => {
    render(<InvoiceCreateForm />);
    await fillService();

    await waitFor(() => expect(petService.list).toHaveBeenCalled());
    expect(petService.list).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "c1" }),
    );
  });

  /*
    NO COLUMN AT ALL on a bill for goods. A column of dashes on an invoice for
    two bags of food is a question the reader never asked — and a product line
    cannot carry a pet anyway: the server refuses one, because a collar has no
    grooming.
  */
  it("shows no animal column on an invoice of only products", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();

    expect(
      screen.queryByRole("columnheader", { name: /^Hewan$/i }),
    ).not.toBeInTheDocument();
  });

  /*
    THE CHECK booking.service.js CALLS THE ONE THAT MATTERS MOST, met here before
    the server has to. A pet picked under the previous customer would raise a
    booking against somebody else's animal — refused, but only after the whole
    form was filled in.
  */
  it("drops the animal when the customer changes", async () => {
    jest
      .spyOn(customerService, "list")
      .mockResolvedValue(
        page([
          { _id: "c1", name: "Bu Sari" },
          { _id: "c2", name: "Pak Budi" },
        ]) as never,
      );

    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    await pick(/^Pelanggan$/i, /Pak Budi/);

    /*
      AND THE FORM IS BLOCKED AGAIN, which is the half that matters. Clearing the
      field on its own would just move the problem: a service line silently
      reverting to "no animal" and issuing anyway is the exact case the required
      rule exists to stop.
    */
    expect(
      screen.getByRole("button", { name: /terbitkan faktur/i }),
    ).toBeDisabled();
    expect(screen.getByText(/belum dipilih hewannya/i)).toBeInTheDocument();
  });

  /*
    AND ONLY WHEN IT ACTUALLY CHANGES. Re-picking the same customer must not
    throw the choice away — the handler returns early, and this is what keeps
    that early return from being deleted as redundant.
  */
  it("keeps the animal when the same customer is re-picked", async () => {
    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent().items[0].petId).toBe("pet1");
  });
});

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
  /*
    BOOKINGS GO AS IDS, never as lines. The server reads each booking's own
    frozen prices, its animal and its groomer — a client that could send those
    could bill a grooming at a price nobody quoted, against somebody else's pet.
  */
  it("sends chosen bookings as ids", async () => {
    jest.spyOn(bookingService, "bridge").mockResolvedValue([
      {
        _id: "bk1",
        bookingNumber: "BK-260828-001",
        petName: "Miko",
        items: [
          { serviceId: "svc1", name: "Grooming", price: "150000", groomerName: "Rina" },
        ],
      },
    ] as never);

    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await userEvent.click(await screen.findByRole("checkbox"));
    await submit();

    await waitFor(() => expect(customerInvoiceService.create).toHaveBeenCalled());
    expect(sent().bookingIds).toEqual(["bk1"]);
    // No prices, no names, no pet ids — only which bookings.
    expect(sent().items).toEqual([]);
  });

  it("leaves bookingIds out entirely when none was chosen", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await submit();

    await waitFor(() => expect(customerInvoiceService.create).toHaveBeenCalled());
    expect(sent()).not.toHaveProperty("bookingIds");
  });

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
    // A service names its animal (PCR-035), or the form will not submit at all.
    await pick(/^Hewan untuk Grooming$/i, /Miko/);
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

  /*
    THE RECAP COUNTS BOOKINGS. They are SENT as ids, but the server prices them
    identically to typed lines — so leaving them out of the preview left the
    recap reading Rp 0 with two groomings ticked, and would have understated
    every invoice discount that touched them.
  */
  it("adds pulled bookings into the recap", async () => {
    jest.spyOn(bookingService, "bridge").mockResolvedValue([
      {
        _id: "bk1",
        bookingNumber: "BK-260828-001",
        petName: "Cici",
        items: [{ serviceId: "svc1", name: "Grooming", price: "120000.0000", groomerName: "Rina" }],
      },
      {
        _id: "bk2",
        bookingNumber: "BK-260828-002",
        petName: "Cilang",
        items: [{ serviceId: "svc1", name: "Grooming", price: "120000.0000", groomerName: "Rina" }],
      },
    ] as never);

    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);

    const boxes = await screen.findAllByRole("checkbox");
    await userEvent.click(boxes[0]);
    await userEvent.click(boxes[1]);

    // Scoped to the Total row: with no discount the subtotal carries the same
    // figure, and a list-wide query would pass on whichever rendered first.
    const totalRow = screen.getByText(/^Total tagihan$/i).closest("div")!;
    expect(within(totalRow).getByText("Rp 240.000")).toBeInTheDocument();
  });

  /*
    AND THE INVOICE DISCOUNT REACHES THEM. A discount that applied only to typed
    lines would show one number on screen and bill another.
  */
  it("discounts booking lines like any other", async () => {
    jest.spyOn(bookingService, "bridge").mockResolvedValue([
      {
        _id: "bk1",
        bookingNumber: "BK-260828-001",
        petName: "Cici",
        items: [{ serviceId: "svc1", name: "Grooming", price: "100000.0000", groomerName: "Rina" }],
      },
    ] as never);

    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.type(screen.getByLabelText(/^Diskon faktur$/i), "10");

    const totalRow = screen.getByText(/^Total tagihan$/i).closest("div")!;
    expect(within(totalRow).getByText("Rp 90.000")).toBeInTheDocument();
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

  /*
    A BOOKING IS A LINE. An invoice may be nothing but pulled groomings, and
    demanding a typed item as well would make the panel useless for the case it
    exists to serve.
  */
  it("lets a booking alone satisfy the form", async () => {
    jest.spyOn(bookingService, "bridge").mockResolvedValue([
      {
        _id: "bk1",
        bookingNumber: "BK-260828-001",
        petName: "Miko",
        items: [{ serviceId: "svc1", name: "Grooming", price: "150000", groomerName: "Rina" }],
      },
    ] as never);

    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await userEvent.click(await screen.findByRole("checkbox"));

    expect(
      screen.getByRole("button", { name: /terbitkan faktur/i }),
    ).toBeEnabled();
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
