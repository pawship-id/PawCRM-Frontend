import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DormantCustomersScreen } from "@/features/customers";
import { customerService } from "@/services/customer.service";
import { ApiError } from "@/services/api-error";
import type { DormantCustomer, DormantCustomerList } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * The Ringkasan tab's "Lihat semua" target — every dormant customer, paged,
 * rather than the panel's own capped ten.
 *
 * WHAT THESE TESTS GUARD: the total and the page come from the SERVER, not
 * from the page of rows on screen (a figure that summed twenty rows would
 * read as the answer while being a fraction of it); a customer who has never
 * bought anything reads as "never", not as a visit on their registration
 * day; `?days=` seeds the same window the Ringkasan card was showing, and
 * changing the window writes it back — the address bar must never show a
 * window other than the one the rows are actually filtered by.
 */
jest.mock("@/services/customer.service");

const replace = jest.fn();
// `router` built once, inside the factory — a fresh object on every
// `useRouter()` call would make `isPending`'s own `useTransition` and any
// effect depending on `router` behave differently from the real, stable
// `next/navigation` reference. See CustomersScreen.test.tsx for the test this
// was first caught in.
jest.mock("next/navigation", () => {
  const router = { replace: (href: string, opts?: unknown) => replace(href, opts) };
  return { useRouter: () => router };
});

const mockedCustomerService = jest.mocked(customerService);

function dormant(overrides: Partial<DormantCustomer> = {}): DormantCustomer {
  return {
    _id: "c1",
    name: "Dewi Anggraini",
    phone: "081722225566",
    email: null,
    vipTier: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    lastVisitAt: "2025-06-01T00:00:00.000Z",
    daysSinceLastVisit: 83,
    ...overrides,
  };
}

function page(
  items: DormantCustomer[],
  total = items.length,
  pageNumber = 1,
  limit = 20,
): DormantCustomerList {
  return {
    days: 60,
    items,
    pagination: {
      page: pageNumber,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedCustomerService.dormant.mockResolvedValue(page([dormant()]));
});

describe("a row", () => {
  it("names the customer and their phone", async () => {
    renderWithAuth(<DormantCustomersScreen />);

    expect(await screen.findByText("Dewi Anggraini")).toBeInTheDocument();
    expect(screen.getByText("081722225566")).toBeInTheDocument();
  });

  it("shows the last visit and how long ago it was", async () => {
    renderWithAuth(<DormantCustomersScreen />);

    await screen.findByText("Dewi Anggraini");
    expect(screen.getByText(/83 hari lalu/)).toBeInTheDocument();
  });

  it("says plainly when somebody has never bought anything, rather than dating their registration as a visit", async () => {
    mockedCustomerService.dormant.mockResolvedValue(
      page([dormant({ name: "Sinta Halim", lastVisitAt: null })]),
    );

    renderWithAuth(<DormantCustomersScreen />);

    expect(await screen.findByText("Sinta Halim")).toBeInTheDocument();
    expect(screen.getByText("Belum pernah belanja")).toBeInTheDocument();
  });

  it("links to the customer's profile", async () => {
    renderWithAuth(<DormantCustomersScreen />);

    expect(
      await screen.findByRole("link", { name: "Dewi Anggraini" }),
    ).toHaveAttribute("href", "/dashboard/master/customers/c1");
  });

  it("offers a WhatsApp chat when there is a number to reach", async () => {
    renderWithAuth(<DormantCustomersScreen />);

    const chat = await screen.findByRole("link", { name: "Hubungi" });
    expect(chat).toHaveAttribute("href", "https://wa.me/6281722225566");
  });

  it("offers no chat link when the customer has no phone", async () => {
    mockedCustomerService.dormant.mockResolvedValue(
      page([dormant({ phone: null })]),
    );

    renderWithAuth(<DormantCustomersScreen />);

    await screen.findByText("Dewi Anggraini");
    expect(
      screen.queryByRole("link", { name: "Hubungi" }),
    ).not.toBeInTheDocument();
  });
});

describe("the total above the table", () => {
  it("counts every dormant customer, not the page's worth", async () => {
    mockedCustomerService.dormant.mockResolvedValue(page([dormant()], 47));

    renderWithAuth(<DormantCustomersScreen />);

    expect(await screen.findByText("47")).toBeInTheDocument();
  });

  it("says nobody is dormant, rather than drawing an empty table silently", async () => {
    mockedCustomerService.dormant.mockResolvedValue(page([], 0));

    renderWithAuth(<DormantCustomersScreen />);

    expect(
      await screen.findByText(/Tidak ada pelanggan yang tertinggal/),
    ).toBeInTheDocument();
  });
});

describe("the dormancy window", () => {
  it("opens on 60 hari by default", async () => {
    renderWithAuth(<DormantCustomersScreen />);

    await waitFor(() =>
      expect(mockedCustomerService.dormant).toHaveBeenCalledWith({
        days: 60,
        page: 1,
        limit: 20,
      }),
    );
  });

  /** `?days=` from the Ringkasan card's own "Lihat semua" link. */
  it("opens on whatever window the Ringkasan card's link carried", async () => {
    renderWithAuth(<DormantCustomersScreen initialQuery={{ days: 120 }} />);

    await waitFor(() =>
      expect(mockedCustomerService.dormant).toHaveBeenCalledWith({
        days: 120,
        page: 1,
        limit: 20,
      }),
    );
  });

  /*
    THE BUG THIS GUARDS: changing the window used to update this instance's
    own state (refetching here) AND write the URL separately — two
    unsynchronised paths, so the table could show the new window's rows
    while the address bar still read the old one. Now the window changes
    ONLY by navigating: this instance never re-queries itself, and the
    parent server page (`dormant/page.tsx`) is what mounts a fresh instance
    once `?days=` actually changes — covered by "opens on whatever window
    the Ringkasan card's link carried" above, which is what that fresh mount
    looks like from this component's own side.
  */
  it("never re-queries itself on a window change — only the URL moves", async () => {
    mockedCustomerService.dormant.mockResolvedValue(page([dormant()], 60));

    renderWithAuth(<DormantCustomersScreen />);
    await screen.findByText("Dewi Anggraini");
    mockedCustomerService.dormant.mockClear();

    await userEvent.click(
      screen.getByRole("button", { name: /batas tidak aktif/i }),
    );
    await userEvent.click(screen.getByRole("option", { name: "120 hari" }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/dashboard/master/customers/dormant?days=120",
        { scroll: false },
      ),
    );
    expect(mockedCustomerService.dormant).not.toHaveBeenCalled();
  });

  /*
    `disabled={isPending}` ITSELF IS NOT ASSERTED HERE. A mocked `replace`
    resolves synchronously, so React has nothing left pending by the time any
    assertion could observe it — true in this suite regardless of whether the
    wiring is correct, so a test built on it would pass or fail by luck, not
    by signal. The prop is one line, checked by reading the component rather
    than by a test chasing a real router's timing.
  */
});

describe("paging", () => {
  it("asks the server for the next page", async () => {
    mockedCustomerService.dormant.mockResolvedValue(page([dormant()], 43));

    renderWithAuth(<DormantCustomersScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: /berikutnya/i }),
    );

    await waitFor(() =>
      expect(mockedCustomerService.dormant).toHaveBeenLastCalledWith({
        days: 60,
        page: 2,
        limit: 20,
      }),
    );
  });

  it("draws no pager when everything fits on one page", async () => {
    renderWithAuth(<DormantCustomersScreen />);

    await screen.findByText("Dewi Anggraini");
    expect(
      screen.queryByRole("button", { name: /berikutnya/i }),
    ).not.toBeInTheDocument();
  });
});

describe("when the list fails", () => {
  it("says so and offers to try again", async () => {
    mockedCustomerService.dormant.mockRejectedValueOnce(
      new ApiError("Daftar pelanggan tidak aktif gagal dimuat.", 500),
    );

    renderWithAuth(<DormantCustomersScreen />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Daftar pelanggan tidak aktif gagal dimuat.",
    );

    mockedCustomerService.dormant.mockResolvedValue(page([dormant()]));
    await userEvent.click(
      within(alert).getByRole("button", { name: /coba lagi/i }),
    );

    expect(await screen.findByText("Dewi Anggraini")).toBeInTheDocument();
  });
});
