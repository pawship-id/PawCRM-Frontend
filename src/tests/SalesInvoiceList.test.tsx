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

/** The read-only card naming the cabang, gudang and periode. */
const scopeCard = () => screen.getByRole("region", { name: "Lingkup data" });

/** Opens the one filter panel and returns it. */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Filter" }));
  return screen.findByRole("dialog");
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
    THE WHOLE BOOK BY DEFAULT — every status and every date. Nothing narrowing
    goes over the wire until somebody asks for it in the panel.
  */
  it("opens on every invoice — every status, every date — soonest due first, 25 a page", async () => {
    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() => expect(customerInvoiceService.list).toHaveBeenCalled());

    expect(lastList()).toMatchObject({ sort: "dueSoonest", limit: 25, page: 1 });
    expect(lastList()?.statuses).toBeUndefined();
    expect(lastList()?.status).toBeUndefined();
    expect(lastList()?.period).toBeUndefined();
    expect(lastList()?.dateFrom).toBeUndefined();
    expect(lastList()?.dateTo).toBeUndefined();
  });

  it("asks the cards with the list's own filter, and nothing about paging", async () => {
    renderWithAuth(<ReceivablesScreen />);

    await waitFor(() =>
      expect(customerInvoiceService.summary).toHaveBeenCalled(),
    );

    expect(lastSummary()?.period).toBeUndefined();
    expect(lastSummary()).not.toHaveProperty("page");
    expect(lastSummary()).not.toHaveProperty("sort");
  });

  it("sends a named period as its name, not as dates the browser worked out", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Filter periode" }));
    await user.click(await screen.findByRole("option", { name: "Bulan ini" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => expect(lastList()).toMatchObject({ period: "month" }));
    expect(lastList()?.dateFrom).toBeUndefined();
  });

  it("moves the list and the cards together when the period changes", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Filter periode" }));
    await user.click(await screen.findByRole("option", { name: "Minggu ini" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => expect(lastList()).toMatchObject({ period: "week" }));
    await waitFor(() => expect(lastSummary()).toMatchObject({ period: "week" }));
    // Read on the scope card, so the badge does not count it as well.
    expect(scopeCard()).toHaveTextContent(/Periode\s*Minggu ini/);
    expect(screen.getByRole("button", { name: "Filter" })).not.toHaveTextContent(
      "Filter (",
    );
  });

  it("bounds a chosen range by the dates typed, instead of a named period", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Filter periode" }));
    await user.click(await screen.findByRole("option", { name: "Pilih tanggal" }));
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
    expect(scopeCard()).toHaveTextContent("1–15 Sep 2026");
  });
});

describe("SalesInvoiceList — the scope card", () => {
  it("opens saying the figures are about every cabang, gudang and date", async () => {
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    expect(scopeCard()).toHaveTextContent(/Cabang\s*Semua cabang/);
    expect(scopeCard()).toHaveTextContent(/Gudang\s*Semua gudang/);
    expect(scopeCard()).toHaveTextContent(/Periode\s*Semua tanggal/);
  });

  it("captions a named period with the days the server resolved", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Filter periode" }));
    await user.click(await screen.findByRole("option", { name: "Bulan ini" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    // The days come from the server's echo, cut in the tenant's zone.
    await waitFor(() =>
      expect(scopeCard()).toHaveTextContent("Bulan ini · 1–30 Sep 2026"),
    );
  });

  it("is read-only — nothing on it can be pressed", async () => {
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    expect(within(scopeCard()).queryAllByRole("button")).toHaveLength(0);
    expect(scopeCard()).toHaveTextContent("Ubah lewat tombol Filter");
  });

  it("follows what the filter panel applied", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Filter gudang" }));
    await user.click(await screen.findByRole("option", { name: "Gudang Selatan" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(scopeCard()).toHaveTextContent(/Cabang\s*Cabang Selatan/),
    );
    expect(scopeCard()).toHaveTextContent(/Gudang\s*Gudang Selatan/);
  });

  it("reads 'Semua tanggal' once a drill has lifted a date bound", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Filter periode" }));
    await user.click(await screen.findByRole("option", { name: "Minggu ini" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));
    await waitFor(() => expect(lastList()).toMatchObject({ period: "week" }));

    await user.click(screen.getByRole("button", { name: /Belum lunas/ }));

    await waitFor(() =>
      expect(scopeCard()).toHaveTextContent(/Periode\s*Semua tanggal/),
    );
    expect(lastList()?.period).toBeUndefined();
  });

  /*
    NOT LAST MONTH'S DATES UNDER THIS WEEK'S NAME. Between a period change and
    the new summary arriving, the card names the period without dates.
  */
  it("drops the dates while the summary for a new period is on its way", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const first = await openFilters(user);
    await user.click(within(first).getByRole("button", { name: "Filter periode" }));
    await user.click(await screen.findByRole("option", { name: "Bulan ini" }));
    await user.click(within(first).getByRole("button", { name: "Terapkan" }));
    await waitFor(() =>
      expect(scopeCard()).toHaveTextContent("Bulan ini · 1–30 Sep 2026"),
    );

    asMock(customerInvoiceService.summary).mockReturnValue(
      new Promise(() => undefined) as never,
    );

    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Filter periode" }));
    await user.click(await screen.findByRole("option", { name: "Minggu ini" }));
    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(scopeCard()).toHaveTextContent(/Periode\s*Minggu ini\s*Ubah lewat/),
    );
    expect(scopeCard()).not.toHaveTextContent("1–30 Sep 2026");
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
  it("offers every gudang while no cabang is chosen", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Filter gudang" }));

    expect(await screen.findByRole("option", { name: "Gudang Barat" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Gudang Selatan" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Etalase Barat" })).toBeInTheDocument();
  });

  it("offers only the chosen cabang's gudang", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Filter cabang" }));
    await user.click(await screen.findByRole("option", { name: "Cabang Barat" }));
    await user.click(within(panel).getByRole("button", { name: "Filter gudang" }));

    expect(await screen.findByRole("option", { name: "Gudang Barat" })).toBeInTheDocument();
    // Placed under Cabang Barat by where it has billed — its master names none.
    expect(screen.getByRole("option", { name: "Etalase Barat" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Gudang Selatan" }),
    ).not.toBeInTheDocument();
  });

  it("fills in the cabang when a gudang is picked first", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Filter gudang" }));
    await user.click(await screen.findByRole("option", { name: "Gudang Selatan" }));

    expect(
      within(panel).getByRole("button", { name: "Filter cabang" }),
    ).toHaveTextContent("Cabang Selatan");

    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(lastList()).toMatchObject({ branchId: "b2", warehouseId: "w2" }),
    );
    // The scope narrows the balance cards too.
    await waitFor(() =>
      expect(lastSummary()).toMatchObject({ branchId: "b2", warehouseId: "w2" }),
    );
  });

  it("clears a gudang that does not belong to a newly chosen cabang", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Filter gudang" }));
    await user.click(await screen.findByRole("option", { name: "Gudang Selatan" }));
    await user.click(within(panel).getByRole("button", { name: "Filter cabang" }));
    await user.click(await screen.findByRole("option", { name: "Cabang Barat" }));

    expect(
      within(panel).getByRole("button", { name: "Filter gudang" }),
    ).toHaveTextContent("Semua gudang");

    await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

    await waitFor(() => expect(lastList()).toMatchObject({ branchId: "b1" }));
    expect(lastList()?.warehouseId).toBeUndefined();
  });

  it("keeps a gudang that does belong to the newly chosen cabang", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    const panel = await openFilters(user);
    await user.click(within(panel).getByRole("button", { name: "Filter gudang" }));
    await user.click(await screen.findByRole("option", { name: "Gudang Barat" }));
    await user.click(within(panel).getByRole("button", { name: "Filter cabang" }));
    await user.click(await screen.findByRole("option", { name: "Semua cabang" }));

    expect(
      within(panel).getByRole("button", { name: "Filter gudang" }),
    ).toHaveTextContent("Gudang Barat");
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

  it("sorts by Sisa over the wire, flipping on a second click", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    await user.click(screen.getByRole("button", { name: "Sisa" }));
    await waitFor(() =>
      expect(lastList()).toMatchObject({ sort: "outstandingLowest" }),
    );

    await user.click(screen.getByRole("button", { name: "Sisa" }));
    await waitFor(() =>
      expect(lastList()).toMatchObject({ sort: "outstandingHighest" }),
    );
    expect(screen.getByRole("columnheader", { name: /Sisa/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
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
      expect(lastList()).toMatchObject({ sort: "totalLowest" }),
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

    await user.click(screen.getByRole("button", { name: "Faktur per halaman" }));
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
    expect(within(row).getByText("batal")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("says which invoices the till raised", async () => {
    asMock(customerInvoiceService.list).mockResolvedValue(
      page([listRow({ source: "pos_bridge" })]) as never,
    );

    renderWithAuth(<ReceivablesScreen />);

    expect(await screen.findByText("dari kasir")).toBeInTheDocument();
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

describe("SalesInvoiceList — row actions", () => {
  it("opens the payment dialog on the full invoice, read first", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Bayar INV-2026-0042" }),
    );

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

    renderWithAuth(<ReceivablesScreen />);

    await screen.findByText("INV-2026-0042");
    expect(
      screen.queryByRole("button", { name: /^Bayar/ }),
    ).not.toBeInTheDocument();
  });

  it("hides Bayar from a role that may read but not take money", async () => {
    renderWithAuth(<ReceivablesScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "customerInvoices", actions: ["read"] }],
    });

    await screen.findByText("INV-2026-0042");
    expect(
      screen.queryByRole("button", { name: /^Bayar/ }),
    ).not.toBeInTheDocument();
  });

  it("links Cetak faktur to the print page", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Aksi lain INV-2026-0042" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Cetak faktur" }),
    ).toHaveAttribute("href", `/dashboard/sales/${INVOICE_ID}/print`);
  });

  it("offers Batalkan on an invoice nothing has been paid against", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Aksi lain INV-2026-0042" }),
    );
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

    await user.click(
      await screen.findByRole("button", { name: "Aksi lain INV-2026-0042" }),
    );

    expect(
      await screen.findByRole("menuitem", { name: "Cetak faktur" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Batalkan faktur" }),
    ).not.toBeInTheDocument();
  });

  it("offers a create button to a role that may raise one, and hides it otherwise", async () => {
    const { unmount } = renderWithAuth(<ReceivablesScreen />);

    expect(
      await screen.findByRole("link", { name: /buat faktur/i }),
    ).toHaveAttribute("href", "/dashboard/sales/new");
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

  it("resets the panel's filters back to every invoice", async () => {
    const user = userEvent.setup();
    renderWithAuth(<ReceivablesScreen />);

    // Drill first, so there is something to reset — statuses on, no period.
    await user.click(await screen.findByRole("button", { name: /Belum lunas/ }));
    await waitFor(() => expect(lastList()?.period).toBeUndefined());

    await user.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("button", { name: "Reset" }));

    await waitFor(() => expect(lastList()?.statuses).toBeUndefined());
    expect(lastList()?.period).toBeUndefined();
    expect(scopeCard()).toHaveTextContent(/Periode\s*Semua tanggal/);
  });
});
