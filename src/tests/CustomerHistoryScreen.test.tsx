import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CustomerHistoryScreen } from "@/features/customers";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import type { CustomerHistoryRow, PageResult } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * The Riwayat tab — every customer's services, purchases and back-office
 * invoices in one timeline.
 *
 * WHAT THESE TESTS GUARD: each row says what was done, for whom and which
 * animal, in words (Jenis and Sumber are badges with labels, never colour
 * alone); an invoice row opens its invoice; filters and pages go to the SERVER,
 * since a page sifted in the browser would disagree with its own pager.
 */
jest.mock("@/services/customer.service");
jest.mock("@/services/pet.service");

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/customers/history",
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const mockedCustomerService = jest.mocked(customerService);
const mockedPetService = jest.mocked(petService);

function row(overrides: Partial<CustomerHistoryRow> = {}): CustomerHistoryRow {
  return {
    id: "t1:0",
    date: "2026-09-03T03:00:00.000Z",
    source: "pos",
    kind: "grooming",
    documentId: "t1",
    documentNumber: "TRX-1",
    activity: "Basic Grooming",
    otherLines: 0,
    customer: { id: "c1", name: "Rina Wijaya" },
    pet: { id: "p1", name: "Milo" },
    branch: { id: "b1", name: "Pawship Barat" },
    warehouse: { id: "w1", name: "Gudang Barat" },
    amount: "120000.0000",
    ...overrides,
  };
}

function page(items: CustomerHistoryRow[], total = items.length): PageResult<CustomerHistoryRow> {
  return {
    items,
    pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedCustomerService.history.mockResolvedValue(page([row()]));
  // CustomerModuleHeader's own register tiles — not under test here.
  mockedCustomerService.stats.mockResolvedValue({
    total: 3,
    newCustomers: { days: 30, count: 1, previousCount: 0 },
    activeCustomers: {
      days: 90,
      count: 1,
      share: 0.33,
      revenue: "100000.0000",
      averageSpend: "100000.0000",
      repeatCount: 0,
      repeatShare: 0,
    },
  });
  mockedPetService.list.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 1, total: 2, totalPages: 2 },
  });
});

describe("a row", () => {
  it("names the date, customer, animal, service, kind, place, value and source", async () => {
    renderWithAuth(<CustomerHistoryScreen />);

    const cells = (await screen.findByText("Basic Grooming")).closest("tr")!;
    const inRow = within(cells);

    expect(inRow.getByText("03 Sep 2026")).toBeInTheDocument();
    expect(inRow.getByRole("link", { name: "Rina Wijaya" })).toHaveAttribute(
      "href",
      "/dashboard/customers/c1",
    );
    expect(inRow.getByRole("link", { name: "Milo" })).toHaveAttribute("href", "/dashboard/pets/p1");
    expect(inRow.getByText("Grooming")).toBeInTheDocument();
    expect(inRow.getByText("Pawship Barat")).toBeInTheDocument();
    expect(inRow.getByText("Gudang Barat")).toBeInTheDocument();
    expect(inRow.getByText(/120\.000/)).toBeInTheDocument();
    expect(inRow.getByText("Kasir")).toBeInTheDocument();
  });

  it("opens a back-office invoice from its row, with a dash where no animal applies", async () => {
    mockedCustomerService.history.mockResolvedValue(
      page([
        row({
          id: "i1",
          source: "invoice",
          kind: "invoice",
          documentId: "i1",
          activity: "Faktur INV-2026-0198",
          pet: null,
        }),
      ]),
    );

    renderWithAuth(<CustomerHistoryScreen />);

    const link = await screen.findByRole("link", { name: "Faktur INV-2026-0198" });
    expect(link).toHaveAttribute("href", "/dashboard/sales/invoice/i1");

    const inRow = within(link.closest("tr")!);
    expect(inRow.getAllByText("Faktur")).toHaveLength(2); // Jenis and Sumber
    expect(inRow.getByText("—")).toBeInTheDocument();
  });

  it("counts the other products a sale's row folds in", async () => {
    mockedCustomerService.history.mockResolvedValue(
      page([row({ kind: "product", activity: "Shampoo", otherLines: 2, pet: null })]),
    );

    renderWithAuth(<CustomerHistoryScreen />);

    expect(await screen.findByText("Shampoo +2 lainnya")).toBeInTheDocument();
    expect(screen.getByText("Produk")).toBeInTheDocument();
  });

  it("says so when there is nothing to show", async () => {
    mockedCustomerService.history.mockResolvedValue(page([]));

    renderWithAuth(<CustomerHistoryScreen />);

    expect(await screen.findByText("Belum ada riwayat di sini.")).toBeInTheDocument();
  });
});

describe("asking the server", () => {
  it("starts unfiltered, on page one", async () => {
    renderWithAuth(<CustomerHistoryScreen />);

    await screen.findByText("Basic Grooming");
    expect(mockedCustomerService.history).toHaveBeenCalledWith({
      search: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      kind: undefined,
      source: undefined,
      page: 1,
      limit: 20,
    });
  });

  it("sends the search to the server", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CustomerHistoryScreen />);
    await screen.findByText("Basic Grooming");

    await user.type(screen.getByRole("searchbox", { name: "Cari pelanggan" }), "rina");

    await waitFor(() =>
      expect(mockedCustomerService.history).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: "rina", page: 1 }),
      ),
    );
  });

  it("highlights the searched word in the customer's and the animal's names", async () => {
    const user = userEvent.setup();
    mockedCustomerService.history.mockResolvedValue(
      page([row({ customer: { id: "c1", name: "Rina Wijaya" }, pet: { id: "p1", name: "Rinto" } })]),
    );
    renderWithAuth(<CustomerHistoryScreen />);
    await screen.findByText("Basic Grooming");

    await user.type(screen.getByRole("searchbox", { name: "Cari pelanggan" }), "rin");

    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll("mark")).map((mark) => mark.textContent),
      ).toEqual(["Rin", "Rin"]),
    );
  });
});
