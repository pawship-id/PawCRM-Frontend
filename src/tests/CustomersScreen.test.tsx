import { screen, waitFor } from "@testing-library/react";
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
    usePathname: () => "/dashboard/master/customers",
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
    notifications: { bookingReminder: true, membershipRenewal: true, promo: false },
    isActive: true,
    vipTier: null,
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
        "/dashboard/master/customers",
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
