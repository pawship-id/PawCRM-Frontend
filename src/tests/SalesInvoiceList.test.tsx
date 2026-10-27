import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReceivablesScreen } from "@/features/sales";
import { formatDateRange } from "@/features/sales/components/InvoiceScopeCard";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import { ApiError } from "@/services/api-error";
import { swalToast } from "@/lib/swal";
import type {
  CustomerInvoiceDetail,
  CustomerInvoiceFilterOptions,
  CustomerInvoiceListRow,
  CustomerInvoiceListSummary,
} from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customerInvoice.service");
// The payment dialog reads the channels money can land in.
jest.mock("@/services/paymentChannel.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
/*
  The module header's tab row needs a router this suite has no reason to stand
  up; what this screen puts INTO the header — the create button — is kept.
*/
jest.mock("@/features/sales/components/SalesModuleHeader", () => ({
  SalesModuleHeader: ({ action }: { action?: React.ReactNode }) =>
    action ?? null,
}));

/**
 * The Penjualan › Faktur list — the September 2026 layout.
 *
 * WHAT THESE TESTS GUARD, each a way the screen could drift back into deciding
 * in the browser what the server already answered:
 *
 *  1. THE PERIOD GOES OVER THE WIRE AS ITS NAME, so the month is the tenant's;
 *  2. THE CARDS ARE ASKED WITH THE LIST'S OWN FILTER, never summed from the page;
 *  3. A BALANCE CARD DRILLS TO EXACTLY THE ROWS BEHIND ITS NUMBER — which means
 *     lifting the date bound, not only setting the status;
 *  4. SORTING IS A SERVER ORDERING, named by the header;
 *  5. ROW ACTIONS SIT BEHIND THEIR GRANTS, and Batalkan is not offered while
 *     money is on the invoice;
 *  6. a failed summary is a dash, never "Rp 0".
 */
const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

const toast = swalToast as jest.MockedFunction<typeof swalToast>;

const INVOICE_ID = "inv1";

function listRow(
  overrides: Partial<CustomerInvoiceListRow> = {},
): CustomerInvoiceListRow {
  return {
    _id: INVOICE_ID,
    invoiceNumber: "INV-2026-0042",
    customerId: "c1",
    customerName: "Bu Sari",
    branchId: "b1",
    branchName: "Cabang Barat",
    posTransactionId: null,
    source: "manual",
    invoiceDate: "2026-09-06T00:00:00.000Z",
    dueDate: "2026-10-06T00:00:00.000Z",
    total: "300000.0000",
    paidAmount: "0.0000",
    outstandingAmount: "300000.0000",
    isOverdue: false,
    status: "unpaid",
    paymentCount: 0,
    notes: null,
    ...overrides,
  };
}

function detail(): CustomerInvoiceDetail {
  const { paymentCount: _unused, ...row } = listRow();
  void _unused;

  return {
    ...row,
    createdByName: null,
    payments: [],
    journalEntryId: "je-1",
    items: [],
    invoiceDiscount: null,
    totals: null,
    warehouseId: null,
    channel: "manual",
    voidedAt: null,
    voidReason: null,
    journalEntries: [],
    bookings: [],
    stockImpact: [],
    credit: null,
  };
}

function listSummary(
  overrides: Partial<CustomerInvoiceListSummary> = {},
): CustomerInvoiceListSummary {
  return {
    asOf: "2026-09-11T05:00:00.000Z",
    period: {
      from: "2026-08-31T17:00:00.000Z",
      to: "2026-09-30T16:59:59.999Z",
      fromDate: "2026-09-01",
      toDate: "2026-09-30",
    },
    revenue: { amount: "4200000.0000", invoiceCount: 12 },
    collected: { amount: "1500000.0000", invoiceCount: 5 },
    outstanding: { amount: "9500000.0000", invoiceCount: 31 },
    overdue: { amount: "4310000.0000", invoiceCount: 3 },
    ...overrides,
  };
}

const OPTIONS: CustomerInvoiceFilterOptions = {
  branches: [
    { _id: "b1", name: "Cabang Barat" },
    { _id: "b2", name: "Cabang Selatan" },
  ],
  warehouses: [
    { _id: "w1", name: "Gudang Barat", branchId: "b1", branchIds: ["b1"] },
    { _id: "w2", name: "Gudang Selatan", branchId: "b2", branchIds: ["b2"] },
    // No cabang on its master record — placed by where it has billed instead.
    { _id: "w3", name: "Etalase Barat", branchId: null, branchIds: ["b1"] },
  ],
  creators: [{ _id: "u1", name: "Jess" }],
};

const page = (items: CustomerInvoiceListRow[], total = items.length) => ({
  items,
  pagination: {
    page: 1,
    limit: 25,
    total,
    totalPages: Math.ceil(total / 25),
  },
});

/** The scope card — cabang, gudang and periode, changed in place. */
const scopeCard = () => screen.getByRole("region", { name: "Lingkup data" });

/** The scope card's period pill by name — pressed when it is the one on. */
const scopePill = (name: string) =>
  within(scopeCard()).getByRole("button", { name });

/** Opens the one filter panel and returns it. */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Filter" }));
  return screen.findByRole("dialog");
}

/**
 * Opens one of the panel's checkbox menus, toggles the rows named — in order,
 * in one opening — and closes it again.
 */
async function tick(
  user: ReturnType<typeof userEvent.setup>,
  panel: HTMLElement,
  field: string,
  rows: string[],
) {
  await user.click(
    within(panel).getByRole("button", { name: new RegExp(`^${field}:`) }),
  );
  for (const row of rows) {
    await user.click(await screen.findByRole("menuitemcheckbox", { name: row }));
  }
  await user.keyboard("{Escape}");
}

const lastList = () => asMock(customerInvoiceService.list).mock.calls.at(-1)?.[0];
const lastSummary = () =>
  asMock(customerInvoiceService.summary).mock.calls.at(-1)?.[0];

beforeEach(() => {
  jest.clearAllMocks();

  asMock(customerInvoiceService.list).mockResolvedValue(
    page([listRow()]) as never,
  );
  asMock(customerInvoiceService.summary).mockResolvedValue(listSummary());
  asMock(customerInvoiceService.filterOptions).mockResolvedValue(OPTIONS);
  asMock(customerInvoiceService.getById).mockResolvedValue(detail());
  asMock(paymentChannelService.list).mockResolvedValue({
    items: [
      {
        _id: "chan-bca",
        type: "transfer",
        name: "BCA Operasional",
        accountId: "acc-bca",
        usableFor: ["in", "out"],
        isActive: true,
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
});

describe("SalesInvoiceList — what it asks the server", () => {
  /*
    EVERY STATUS, THIS MONTH (12 October 2026, on request) — the same period
    Ringkasan opens on, sent as its name.
  */
  it("opens on this month's invoices — every status — soonest due first, 25 a page", async () => {
    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() => expect(customerInvoiceService.list).toHaveBeenCalled());

    expect(lastList()).toMatchObject({ sort: "dueSoonest", limit: 25, page: 1 });
    expect(lastList()?.statuses).toBeUndefined();
    expect(lastList()?.status).toBeUndefined();
    expect(lastList()?.period).toBe("month");
    expect(lastList()?.dateFrom).toBeUndefined();
    expect(lastList()?.dateTo).toBeUndefined();
  });

  it("asks the cards with the list's own filter, and nothing about paging", async () => {
    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() =>
      expect(customerInvoiceService.summary).toHaveBeenCalled(),
    );

    expect(lastSummary()?.period).toBe("month");
    expect(lastSummary()).not.toHaveProperty("page");
    expect(lastSummary()).not.toHaveProperty("sort");
  });

  it("sends a named period as its name, not as dates the browser worked out", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Hari ini" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => expect(lastList()).toMatchObject({ period: "today" }));
    expect(lastList()?.dateFrom).toBeUndefined();
  });

  it("moves the list and the cards together when the period changes", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Minggu ini" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => expect(lastList()).toMatchObject({ period: "week" }));
    await waitFor(() => expect(lastSummary()).toMatchObject({ period: "week" }));
    expect(scopePill("Minggu ini")).toHaveAttribute("aria-pressed", "true");
    /*
      THE BADGE COUNTS IT TOO (16 September 2026) — one number for "how much is
      on", shown both here and as the card's "Reset filter (n)". It used to leave
      the period out because the card already names it, which put "Filter" beside
      "Reset filter (1)" on the same screen.
    */
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  it("bounds a chosen range by the dates typed, instead of a named period", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    /* The last pill — the two dates appear under it only once it is pressed. */
    await user.click(within(panel).getByRole("button", { name: "Pilih tanggal" }));
    await user.type(within(panel).getByLabelText("Tanggal faktur dari"), "2026-09-01");
    await user.type(
      within(panel).getByLabelText("Tanggal faktur sampai"),
      "2026-09-15",
    );
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(lastList()).toMatchObject({
        dateFrom: "2026-09-01",
        dateTo: "2026-09-15",
      }),
    );
    expect(lastList()?.period).toBeUndefined();
    // The card follows: Custom on, and the same two dates under it.
    expect(scopePill("Pilih tanggal")).toHaveAttribute("aria-pressed", "true");
    expect(
      within(scopeCard()).getByLabelText("Tanggal faktur dari"),
    ).toHaveValue("2026-09-01");
    expect(
      within(scopeCard()).getByLabelText("Tanggal faktur sampai"),
    ).toHaveValue("2026-09-15");
  });
});

describe("SalesInvoiceList — the scope card", () => {
  it("opens on every cabang and gudang, this month", async () => {
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    expect(scopeCard()).toHaveTextContent(/Cabang\s*Semua cabang/);
    expect(scopeCard()).toHaveTextContent(/Gudang\s*Semua gudang/);
    expect(scopePill("Bulan ini")).toHaveAttribute("aria-pressed", "true");
  });

  /*
    CHANGED IN PLACE (12 October 2026, on request) — the card used to be
    read-only, with every control behind the Filter button.
  */
  it("changes the period on click, and the panel opens on it", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    expect(scopeCard()).not.toHaveTextContent("Reset filter");
    await user.click(scopePill("Hari ini"));

    await waitFor(() => expect(lastList()).toMatchObject({ period: "today" }));
    await waitFor(() => expect(lastSummary()).toMatchObject({ period: "today" }));
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );

    const panel = await openFilters(user);
    expect(
      within(panel).getByRole("button", { name: "Hari ini" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("picks a gudang in place, ticking its cabang as the panel would", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    await user.click(within(scopeCard()).getByRole("button", { name: "Gudang" }));
    const popover = await screen.findByRole("dialog");
    await user.click(within(popover).getByRole("option", { name: /Gudang Selatan/ }));
    await user.click(within(popover).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(lastList()).toMatchObject({
        branchIds: ["b2"],
        warehouseIds: ["w2"],
      }),
    );
    expect(scopeCard()).toHaveTextContent(/Cabang\s*Cabang Selatan/);
    expect(scopeCard()).toHaveTextContent(/Gudang\s*Gudang Selatan/);
  });

  /*
    ONE WAY OUT OF A NARROWED LIST (16 September 2026) — the grooming
    catalogue's "Reset filter (n)", on the card that already says what is on.
  */
  it("offers a Reset once filters are on, and clears them in one press", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    // Ticking a gudang ticks its cabang too — two filters, one press.
    await tick(user, panel, "Gudang", ["Gudang Selatan"]);
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    const reset = await within(scopeCard()).findByRole("button", {
      name: "Reset filter (2)",
    });
    await user.click(reset);

    await waitFor(() =>
      expect(scopeCard()).toHaveTextContent(/Cabang\s*Semua cabang/),
    );
    expect(scopeCard()).toHaveTextContent(/Gudang\s*Semua gudang/);
    expect(scopeCard()).not.toHaveTextContent("Reset filter");
  });

  it("follows what the filter panel applied", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await tick(user, panel, "Gudang", ["Gudang Selatan"]);
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(scopeCard()).toHaveTextContent(/Cabang\s*Cabang Selatan/),
    );
    expect(scopeCard()).toHaveTextContent(/Gudang\s*Gudang Selatan/);
  });

  it("names two cabang, and counts three gudang", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await tick(user, panel, "Cabang", ["Cabang Barat", "Cabang Selatan"]);
    await tick(user, panel, "Gudang", ["Gudang Barat", "Gudang Selatan", "Etalase Barat"]);
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(scopeCard()).toHaveTextContent(
        /Cabang\s*Cabang Barat, Cabang Selatan/,
      ),
    );
    expect(
      within(scopeCard()).getByRole("button", { name: "Gudang" }),
    ).toHaveTextContent("3 gudang");
  });

  it("reads 'Semua' once a drill has lifted a date bound", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Minggu ini" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));
    await waitFor(() => expect(lastList()).toMatchObject({ period: "week" }));

    await user.click(screen.getByRole("button", { name: /Belum lunas/ }));

    await waitFor(() =>
      expect(scopePill("Semua")).toHaveAttribute("aria-pressed", "true"),
    );
    expect(lastList()?.period).toBeUndefined();
  });
});

describe("formatDateRange", () => {
  it("shares what the two days share", () => {
    expect(formatDateRange("2026-09-11", "2026-09-11")).toBe("11 Sep 2026");
    expect(formatDateRange("2026-09-01", "2026-09-30")).toBe("1–30 Sep 2026");
    expect(formatDateRange("2026-08-31", "2026-09-06")).toMatch(
      /^31 Agu – 6 Sep 2026$/,
    );
    expect(formatDateRange("2026-12-28", "2027-01-03")).toMatch(
      /^28 Des 2026 – 3 Jan 2027$/,
    );
  });

  it("names an open end rather than inventing one", () => {
    expect(formatDateRange("2026-09-01", null)).toBe("Sejak 1 Sep 2026");
    expect(formatDateRange(null, "2026-09-15")).toBe("Sampai 15 Sep 2026");
    expect(formatDateRange(null, null)).toBe("Semua tanggal");
  });
});

describe("SalesInvoiceList — cabang and gudang in the panel", () => {
  const menuRows = () =>
    screen.getAllByRole("menuitemcheckbox").map((row) => row.textContent);

  it("offers every gudang while no cabang is ticked", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: /^Gudang:/ }));
    await screen.findByRole("menuitemcheckbox", { name: "Gudang Barat" });

    expect(menuRows()).toEqual([
      "Semua gudang",
      "Gudang Barat",
      "Gudang Selatan",
      "Etalase Barat",
    ]);
  });

  it("offers only the ticked cabang's gudang", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await tick(user, panel, "Cabang", ["Cabang Barat"]);
    await user.click(within(panel).getByRole("button", { name: /^Gudang:/ }));
    await screen.findByRole("menuitemcheckbox", { name: "Gudang Barat" });

    // Etalase Barat is placed under Cabang Barat by where it has billed — its
    // master names none.
    expect(menuRows()).toEqual(["Semua gudang", "Gudang Barat", "Etalase Barat"]);
  });

  it("offers the gudang of every ticked cabang", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await tick(user, panel, "Cabang", ["Cabang Barat", "Cabang Selatan"]);

    expect(
      within(panel).getByRole("button", { name: /^Cabang:/ }),
    ).toHaveTextContent("2 cabang");

    await user.click(within(panel).getByRole("button", { name: /^Gudang:/ }));
    await screen.findByRole("menuitemcheckbox", { name: "Gudang Selatan" });
    expect(menuRows()).toHaveLength(4);
  });

  it("ticks the cabang when a gudang is picked first", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await tick(user, panel, "Gudang", ["Gudang Selatan"]);

    expect(
      within(panel).getByRole("button", { name: /^Cabang:/ }),
    ).toHaveTextContent("Cabang Selatan");

    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(lastList()).toMatchObject({ branchIds: ["b2"], warehouseIds: ["w2"] }),
    );
    // The scope narrows the balance cards too.
    await waitFor(() =>
      expect(lastSummary()).toMatchObject({
        branchIds: ["b2"],
        warehouseIds: ["w2"],
      }),
    );
  });

  /*
    TICKING A GUDANG TICKS ITS CABANG, which narrows the gudang on offer. Re-drawn
    mid-menu, Gudang Barat would vanish from under the pointer the moment Gudang
    Selatan was ticked.
  */
  it("holds the gudang list still while its menu is open", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await tick(user, panel, "Gudang", ["Gudang Selatan", "Gudang Barat"]);

    expect(
      within(panel).getByRole("button", { name: /^Cabang:/ }),
    ).toHaveTextContent("2 cabang");

    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(lastList()).toMatchObject({
        branchIds: ["b2", "b1"],
        warehouseIds: ["w2", "w1"],
      }),
    );
  });

  it("unticks a gudang that is under none of the ticked cabang", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await tick(user, panel, "Gudang", ["Gudang Selatan"]);
    // Off Selatan, onto Barat — Gudang Selatan now belongs to nothing ticked.
    await tick(user, panel, "Cabang", ["Cabang Selatan", "Cabang Barat"]);

    expect(
      within(panel).getByRole("button", { name: /^Gudang:/ }),
    ).toHaveTextContent("Semua gudang");

    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => expect(lastList()).toMatchObject({ branchIds: ["b1"] }));
    expect(lastList()?.warehouseIds).toBeUndefined();
  });

  it("keeps a gudang when the cabang go back to Semua", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await tick(user, panel, "Gudang", ["Gudang Barat"]);
    await tick(user, panel, "Cabang", ["Semua cabang"]);

    expect(
      within(panel).getByRole("button", { name: /^Gudang:/ }),
    ).toHaveTextContent("Gudang Barat");
    expect(
      within(panel).getByRole("button", { name: /^Cabang:/ }),
    ).toHaveTextContent("Semua cabang");
  });

  it("searches by what was typed — names included — once typing settles", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() => expect(customerInvoiceService.list).toHaveBeenCalled());
    await user.type(screen.getByRole("searchbox", { name: "Cari faktur" }), "sari");

    await waitFor(() => expect(lastList()).toMatchObject({ search: "sari" }), {
      timeout: 2000,
    });
  });
});

describe("SalesInvoiceList — the four cards", () => {
  it("renders the server's figures, with their counts", async () => {
    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByText(/Rp\s?4\.200\.000/)).toBeInTheDocument();
    expect(screen.getByText("12 faktur")).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?9\.500\.000/)).toBeInTheDocument();
    expect(screen.getByText("3 faktur")).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?4\.310\.000/)).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?1\.500\.000/)).toBeInTheDocument();
    expect(screen.getByText("dari 5 faktur")).toBeInTheDocument();
  });

  /*
    NULL IS NOT ZERO. "Rp 0" for a figure that never arrived is a confident wrong
    answer; the list below still loads.
  */
  it("renders a dash, not a zero, when the summary fails", async () => {
    asMock(customerInvoiceService.summary).mockRejectedValue(
      new ApiError("boom", 500),
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findAllByText("gagal dimuat")).toHaveLength(4);
    expect(screen.queryByText(/Rp\s?0$/)).not.toBeInTheDocument();
    expect(await screen.findByText("INV-2026-0042")).toBeInTheDocument();
  });

  /*
    THE DRILL LIFTS THE DATE BOUND. The card counts every unpaid invoice in the
    scope whenever it was raised; a table still bounded to this month would show
    fewer rows than the card just promised.
  */
  it("opens Belum lunas into every unpaid invoice, whenever it was raised", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await user.click(await screen.findByRole("button", { name: /Belum lunas/ }));

    await waitFor(() =>
      expect(lastList()).toMatchObject({ statuses: ["unpaid", "partial"] }),
    );
    expect(lastList()?.period).toBeUndefined();
    expect(lastList()?.dateFrom).toBeUndefined();
    expect(toast).toHaveBeenCalledWith(
      expect.stringContaining("tanpa batas tanggal"),
    );
  });

  it("opens Lewat jatuh tempo into the late invoices", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await user.click(
      await screen.findByRole("button", { name: /Lewat jatuh tempo/ }),
    );

    await waitFor(() =>
      expect(lastList()).toMatchObject({ statuses: ["overdue"] }),
    );
  });
});

describe("SalesInvoiceList — the table", () => {
  it("shows the Jatuh tempo column as sorted when the screen opens", async () => {
    renderWithAuth(<ReceivablesScreen />);

    expect(
      await screen.findByRole("columnheader", { name: /Jatuh tempo/ }),
    ).toHaveAttribute("aria-sort", "ascending");
  });

  // Money takes the largest first (ui-rules §8), then flips.
  it("sorts by Sisa over the wire, largest first, flipping on a second click", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    await user.click(screen.getByRole("button", { name: "Sisa" }));
    await waitFor(() =>
      expect(lastList()).toMatchObject({ sort: "outstandingHighest" }),
    );
    expect(screen.getByRole("columnheader", { name: /Sisa/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );

    await user.click(screen.getByRole("button", { name: "Sisa" }));
    await waitFor(() =>
      expect(lastList()).toMatchObject({ sort: "outstandingLowest" }),
    );
  });

  // Text takes A first: the invoice number is a new server ordering.
  it("sorts by Faktur number, ascending first", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    await user.click(screen.getByRole("button", { name: "Faktur" }));
    await waitFor(() =>
      expect(lastList()).toMatchObject({ sort: "numberAsc" }),
    );

    await user.click(screen.getByRole("button", { name: "Faktur" }));
    await waitFor(() =>
      expect(lastList()).toMatchObject({ sort: "numberDesc" }),
    );
  });

  it("sorts by Tanggal newest first", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    await user.click(screen.getByRole("button", { name: "Tanggal" }));
    await waitFor(() => expect(lastList()).toMatchObject({ sort: "newest" }));
  });

  it("leaves Pelanggan, Cabang, Sumber, Status and Aksi plain", async () => {
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    for (const name of ["Pelanggan", "Cabang", "Sumber", "Status", "Aksi"]) {
      const header = screen.getByRole("columnheader", { name });
      expect(header).not.toHaveAttribute("aria-sort");
      expect(within(header).queryByRole("button")).not.toBeInTheDocument();
    }
  });

  it("does not re-sum the cards when only the ordering changes", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    await waitFor(() =>
      expect(customerInvoiceService.summary).toHaveBeenCalledTimes(1),
    );
    await user.click(screen.getByRole("button", { name: "Nilai" }));

    await waitFor(() =>
      expect(lastList()).toMatchObject({ sort: "totalHighest" }),
    );
    expect(customerInvoiceService.summary).toHaveBeenCalledTimes(1);
  });

  it("says which range is on screen, and changes the page size", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([listRow(), listRow({ _id: "inv2", invoiceNumber: "INV-2026-0043" })], 87) as never,
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(
      await screen.findByText("Menampilkan 1–25 dari 87 faktur"),
    ).toBeInTheDocument();

    // One footer for both lists since 20 September 2026, so one aria-label.
    await user.click(screen.getByRole("button", { name: "Baris per halaman" }));
    await user.click(await screen.findByRole("option", { name: "100" }));

    await waitFor(() =>
      expect(lastList()).toMatchObject({ limit: 100, page: 1 }),
    );
  });

  it("marks a void row batal and dashes its sisa", async () => {
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([listRow({ status: "void" })]) as never,
    );

    renderWithAuth(<ReceivablesScreen />);

    const row = (await screen.findByText("INV-2026-0042")).closest("tr")!;
    expect(within(row).getByText("Batal")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("says which invoices the till raised", async () => {
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([listRow({ source: "pos_bridge" })]) as never,
    );

    renderWithAuth(<ReceivablesScreen />);

    // "Kasir", not "dari kasir" — the origin named, the mockup's word.
    const row = (await screen.findByText("INV-2026-0042")).closest("tr")!;
    expect(within(row).getByText("Kasir")).toBeInTheDocument();
  });

  it("renders the row's lateness from the server's verdict", async () => {
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([listRow({ isOverdue: true, dueDate: "2026-09-01T00:00:00.000Z" })]) as never,
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByText(/telat \d+ hari/)).toBeInTheDocument();
  });

  it("says so when the request fails, rather than showing an empty list", async () => {
    asMock(customerInvoiceService.list).mockRejectedValue(
      new ApiError("Server error", 500),
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByText("Tidak ada faktur yang cocok dengan filter ini."),
    ).not.toBeInTheDocument();
  });
});

const openMenu = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(
    await screen.findByRole("button", { name: "Aksi untuk INV-2026-0042" }),
  );

describe("SalesInvoiceList — row actions", () => {
  it("links Detail and Cetak faktur from the row's menu", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await openMenu(user);

    expect(
      await screen.findByRole("menuitem", { name: "Detail" }),
    ).toHaveAttribute("href", `/dashboard/sales/invoice/${INVOICE_ID}`);
    expect(
      screen.getByRole("menuitem", { name: "Cetak faktur" }),
    ).toHaveAttribute("href", `/dashboard/sales/invoice/${INVOICE_ID}/print`);
  });

  it("no longer draws a Bayar button on the row itself", async () => {
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    expect(
      screen.queryByRole("button", { name: /^Bayar/ }),
    ).not.toBeInTheDocument();
  });

  it("opens the payment dialog on the full invoice, read first", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await openMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Bayar" }));

    await waitFor(() =>
      expect(customerInvoiceService.getById).toHaveBeenCalledWith(INVOICE_ID),
    );
    expect(
      await screen.findByRole("heading", { name: "Catat pembayaran" }),
    ).toBeInTheDocument();
  });

  it("offers no Bayar on a settled invoice", async () => {
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([
        listRow({ status: "paid", paidAmount: "300000.0000", outstandingAmount: "0.0000" }),
      ]) as never,
    );

    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await openMenu(user);
    expect(
      await screen.findByRole("menuitem", { name: "Cetak faktur" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Bayar" }),
    ).not.toBeInTheDocument();
  });

  it("hides Bayar and Batalkan from a role that may read but not take money", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "customerInvoices", actions: ["read"] }],
    });

    await openMenu(user);
    expect(
      await screen.findByRole("menuitem", { name: "Detail" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Bayar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Batalkan faktur" }),
    ).not.toBeInTheDocument();
  });

  it("offers Batalkan on an invoice nothing has been paid against", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await openMenu(user);
    await user.click(
      await screen.findByRole("menuitem", { name: "Batalkan faktur" }),
    );

    await waitFor(() =>
      expect(customerInvoiceService.getById).toHaveBeenCalledWith(INVOICE_ID),
    );
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  /*
    THE SERVER REFUSES A VOID WHILE A PAYMENT STILL COUNTS. A menu row that
    opens a dialog only to be refused should not be there.
  */
  it("does not offer Batalkan while money is on the invoice", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([
        listRow({ status: "partial", paidAmount: "100000.0000", outstandingAmount: "200000.0000" }),
      ]) as never,
    );

    renderWithAuth(<ReceivablesScreen />);

    await openMenu(user);

    expect(
      await screen.findByRole("menuitem", { name: "Cetak faktur" }),
    ).toBeInTheDocument();
    // Still owed, so still collectable.
    expect(screen.getByRole("menuitem", { name: "Bayar" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Batalkan faktur" }),
    ).not.toBeInTheDocument();
  });

  it("offers neither Bayar nor Batalkan on a void invoice", async () => {
    const user = userEvent.setup();
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([listRow({ status: "void" })]) as never,
    );

    renderWithAuth(<ReceivablesScreen />);

    await openMenu(user);
    expect(
      await screen.findByRole("menuitem", { name: "Detail" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Bayar" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Batalkan faktur" }),
    ).not.toBeInTheDocument();
  });

  // Removed 20 October 2026 on request.
  it("no longer carries the 'cannot be changed' note under the table", async () => {
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    expect(
      screen.queryByText(/Faktur dan pembayaran tidak bisa diubah/),
    ).not.toBeInTheDocument();
  });

  it("offers a create button to a role that may raise one, and hides it otherwise", async () => {
    const { unmount } = renderWithAuth(<ReceivablesScreen />);

    expect(
      await screen.findByRole("link", { name: /buat faktur/i }),
    ).toHaveAttribute("href", "/dashboard/sales/invoice/new");
    unmount();

    renderWithAuth(<ReceivablesScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "customerInvoices", actions: ["read"] }],
    });

    await screen.findByText("INV-2026-0042");
    expect(
      screen.queryByRole("link", { name: /buat faktur/i }),
    ).not.toBeInTheDocument();
  });
});

describe("SalesInvoiceList — the filter panel", () => {
  it("filters by status, overdue included, and counts it on the button", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    await user.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");

    await user.click(
      within(panel).getByRole("button", { name: "Status: Semua status" }),
    );
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Lewat jatuh tempo" }),
    );
    await user.keyboard("{Escape}");
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(lastList()).toMatchObject({ statuses: ["overdue"] }),
    );
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  it("filters by more than one sumber, counted once on the button", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await tick(user, panel, "Sumber", ["Kasir", "Manual"]);

    expect(
      within(panel).getByRole("button", { name: "Sumber: 2 sumber" }),
    ).toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(lastList()).toMatchObject({ sources: ["pos_bridge", "manual"] }),
    );
    expect(lastSummary()).toMatchObject({ sources: ["pos_bridge", "manual"] });
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  it("resets the panel's filters back to every status, this month", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    // Drill first, so there is something to reset — statuses on, no period.
    await user.click(await screen.findByRole("button", { name: /Belum lunas/ }));
    await waitFor(() => expect(lastList()?.period).toBeUndefined());

    await user.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("button", { name: "Reset" }));

    await waitFor(() => expect(lastList()?.statuses).toBeUndefined());
    expect(lastList()?.period).toBe("month");
    expect(scopePill("Bulan ini")).toHaveAttribute("aria-pressed", "true");
  });
});
