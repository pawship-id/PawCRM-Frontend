import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CustomersScreen } from "@/features/customers";
import { customerService } from "@/services/customer.service";
import { customerTypeService } from "@/services/customerType.service";
import { petService } from "@/services/pet.service";
import type { Customer, PageResult } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * THE BUG THIS SUITE GUARDS: the Ringkasan tab's "Pelanggan baru" card links
 * here with `?createdSince=…`, drawn as a removable chip. Clearing the chip
 * correctly narrowed the table back to every customer — but nothing ever
 * wrote the URL back, so the address bar kept reading `?createdSince=…` as
 * if it still applied. A reload, or a shared link, at that point would
 * silently reapply a filter the screen had visibly dropped.
 */
jest.mock("@/services/customer.service");
jest.mock("@/services/customerType.service");
jest.mock("@/services/pet.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const replace = jest.fn();
// `router` IS BUILT ONCE, INSIDE THE FACTORY — not a fresh object on every
// `useRouter()` call. The real `next/navigation` hands back a stable
// reference across re-renders; a mock that didn't would make a `useEffect`
// depending on `router` re-fire on every unrelated re-render this screen
// does while its data loads, which is a bug in the test double, not in the
// screen under test.
jest.mock("next/navigation", () => {
  const router = { replace: (href: string, opts?: unknown) => replace(href, opts) };
  return {
    useRouter: () => router,
    // CustomerModuleHeader's tab row (PageTabs) reads this to underline the
    // current tab — not under test here, just needs a value to render at all.
    usePathname: () => "/dashboard/customers",
  };
});

const mockedCustomerService = jest.mocked(customerService);
const mockedCustomerTypeService = jest.mocked(customerTypeService);
const mockedPetService = jest.mocked(petService);

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    _id: "5a7f1f77bcf86cd799439022",
    tenantId: "507f1f77bcf86cd799439011",
    code: "CUST-0001",
    name: "Rina Wijaya",
    email: "rina@email.com",
    phone: "0812-1111-2222",
    address: null,
    kind: "individual",
    customerTypeId: null,
    customerTypeName: null,
    taxId: null,
    picName: null,
    notes: null,
    tags: [],
    notifications: { bookingReminder: true, membershipRenewal: true, promo: false },
    isActive: true,
    deletedAt: null,
    createdAt: "2025-01-12T00:00:00.000Z",
    updatedAt: "2025-01-12T00:00:00.000Z",
    ...overrides,
  };
}

function listOf(items: Customer[], total = items.length): PageResult<Customer> {
  return {
    items,
    pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedCustomerTypeService.list.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  });
  // CustomerModuleHeader's own register tiles — not under test here, just
  // needs real promises so useRegistryCounts doesn't call `.then()` on
  // `undefined`.
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

describe("the \"Pelanggan baru\" chip, from the Ringkasan drill", () => {
  const CREATED_SINCE = "2026-09-18T14:06:29.938Z";

  it("rewrites the URL back to plain when the chip is cleared", async () => {
    mockedCustomerService.list
      .mockResolvedValueOnce(listOf([customer({ name: "Ibu Rina" })], 1))
      .mockResolvedValueOnce(listOf([customer({ name: "Ibu Rina" }), customer({ _id: "c2", name: "Budi" })], 3));

    renderWithAuth(
      <CustomersScreen initialQuery={{ createdSince: CREATED_SINCE }} />,
    );

    expect(await screen.findByText("Ibu Rina")).toBeVisible();
    expect(
      screen.getByText("Pelanggan baru (dari Ringkasan)"),
    ).toBeVisible();
    // Nothing writes the URL on the initial render — it already reads what
    // the server resolved it to.
    expect(replace).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Hapus filter Pelanggan baru (dari Ringkasan)",
      }),
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/dashboard/customers",
        { scroll: false },
      ),
    );
    // The table itself narrows via ordinary client state, independent of the
    // URL write — both happen, but neither is what unblocks the other.
    expect(await screen.findByText("Budi")).toBeVisible();
  });

  it("writes no URL at all when the screen was never deep-linked here", async () => {
    mockedCustomerService.list.mockResolvedValue(listOf([customer()], 1));

    renderWithAuth(<CustomersScreen />);

    await screen.findByText("Rina Wijaya");
    expect(
      screen.queryByText("Pelanggan baru (dari Ringkasan)"),
    ).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

/*
  THE BUG THIS SECOND SUITE GUARDS: `CustomerModuleHeader`'s "Jumlah
  pelanggan" tile counts the register in its own request, with no
  subscription to the table underneath it — deleting a row here used to
  leave the tile reading the count from before the click until the whole
  page was reloaded.
*/
describe("deleting a row refreshes the header's own count", () => {
  it("re-fetches the register stats, not just the table", async () => {
    mockedCustomerService.list.mockResolvedValue(listOf([customer()], 1));
    mockedCustomerService.remove.mockResolvedValue(customer({ deletedAt: "2026-10-03T00:00:00.000Z" }));

    renderWithAuth(<CustomersScreen />);

    await screen.findByText("Rina Wijaya");
    // The header's own fetch, from mount — one call before anything happens.
    expect(mockedCustomerService.stats).toHaveBeenCalledTimes(1);

    await userEvent.click(
      screen.getByRole("button", { name: "Aksi untuk Rina Wijaya" }),
    );
    await userEvent.click(
      within(screen.getByRole("menu")).getByText("Hapus"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Hapus" }));

    await waitFor(() =>
      expect(mockedCustomerService.remove).toHaveBeenCalledWith(customer()._id),
    );
    // The thing this suite exists to prove: a second call, not reuse of the
    // first answer — "Jumlah pelanggan" asks again rather than trusting a
    // number that is now one customer too high.
    await waitFor(() =>
      expect(mockedCustomerService.stats).toHaveBeenCalledTimes(2),
    );
  });
});

/*
  HEADER SORTING (BO, 20 October 2026). Kode, Pelanggan and Bergabung sort on
  the server by a name from CUSTOMER_SORTS; everything else is a plain header,
  and the filter panel has no Urutkan and no say over the ordering.
*/
function lastSort() {
  const calls = mockedCustomerService.list.mock.calls;
  return calls[calls.length - 1][0]?.sort;
}

async function renderList() {
  const user = userEvent.setup();
  mockedCustomerService.list.mockResolvedValue(listOf([customer()], 1));
  renderWithAuth(<CustomersScreen />);
  await screen.findByText("Rina Wijaya");
  return user;
}

describe("header sorting", () => {
  /*
    THE DEFAULT IS A COLUMN HERE: `newest` orders by `createdAt`, which is
    exactly what Bergabung prints, so that header says so from the first
    render — unlike Supplier, whose default sorts by no visible column.
  */
  it("opens newest first, with Bergabung marked descending", async () => {
    await renderList();

    expect(lastSort()).toBe("newest");
    expect(
      screen.getByRole("columnheader", { name: "Bergabung" }),
    ).toHaveAttribute("aria-sort", "descending");
    for (const name of ["Kode", "Pelanggan"]) {
      expect(screen.getByRole("columnheader", { name })).toHaveAttribute(
        "aria-sort",
        "none",
      );
    }
  });

  it.each([
    ["Kode", "codeAsc"],
    ["Pelanggan", "nameAsc"],
  ])("asks the server to sort by %s", async (header, sort) => {
    const user = await renderList();

    await user.click(screen.getByRole("button", { name: header }));

    await waitFor(() => expect(lastSort()).toBe(sort));
    expect(screen.getByRole("columnheader", { name: header })).toHaveAttribute(
      "aria-sort",
      sort.endsWith("Asc") ? "ascending" : "descending",
    );
  });

  it("takes Bergabung newest first from another column, then flips it", async () => {
    const user = await renderList();

    // Already newest: one click flips to oldest.
    await user.click(screen.getByRole("button", { name: "Bergabung" }));
    await waitFor(() => expect(lastSort()).toBe("oldest"));

    // From another column, the first click takes the newest end.
    await user.click(screen.getByRole("button", { name: "Kode" }));
    await waitFor(() => expect(lastSort()).toBe("codeAsc"));
    await user.click(screen.getByRole("button", { name: "Bergabung" }));
    await waitFor(() => expect(lastSort()).toBe("newest"));
  });

  it("flips Pelanggan to Z first on the second click", async () => {
    const user = await renderList();

    await user.click(screen.getByRole("button", { name: "Pelanggan" }));
    await waitFor(() => expect(lastSort()).toBe("nameAsc"));
    await user.click(screen.getByRole("button", { name: "Pelanggan" }));

    await waitFor(() => expect(lastSort()).toBe("nameDesc"));
  });

  it("leaves Kontak, Kategori, Status and Aksi plain", async () => {
    await renderList();

    for (const name of ["Kontak", "Kategori", "Status", "Aksi"]) {
      expect(screen.getByRole("columnheader", { name })).not.toHaveAttribute(
        "aria-sort",
      );
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("offers no Urutkan in the filter panel", async () => {
    const user = await renderList();

    await user.click(screen.getByRole("button", { name: "Filter" }));

    expect(screen.getByLabelText("Filter jenis pelanggan")).toBeVisible();
    expect(screen.queryByLabelText("Urutkan")).not.toBeInTheDocument();
  });

  it("keeps the header ordering through the panel's Reset", async () => {
    const user = await renderList();

    await user.click(screen.getByRole("button", { name: "Kode" }));
    await waitFor(() => expect(lastSort()).toBe("codeAsc"));
    // The ordering is not a filter: the trigger still reads plain "Filter".
    expect(screen.getByText("Filter")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByLabelText("Filter jenis pelanggan"));
    await user.click(await screen.findByRole("option", { name: "Perusahaan" }));
    await user.click(screen.getByRole("button", { name: "Terapkan" }));
    await waitFor(() =>
      expect(mockedCustomerService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: "company", sort: "codeAsc" }),
      ),
    );

    // The kind is counted; the ordering never is.
    expect(await screen.findByText("Filter (1)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.click(screen.getByRole("button", { name: "Reset" }));

    await waitFor(() =>
      expect(mockedCustomerService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: undefined, sort: "codeAsc" }),
      ),
    );
  });
});

it("no longer draws the \"profile opens from the row\" callout", async () => {
  await renderList();

  expect(
    screen.queryByText("Profil pelanggan dibuka dari baris, bukan dari menu"),
  ).not.toBeInTheDocument();
});
