import { screen, waitFor } from "@testing-library/react";

import { StockCorrectionModuleHeader } from "@/features/inventory";
import { stockEntryService } from "@/services/stockEntry.service";
import { stockOpnameService } from "@/services/stockOpname.service";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/stockEntry.service");
jest.mock("@/services/stockOpname.service");

const pathname = jest.fn(() => "/dashboard/inventory/opname");
jest.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

const mockedOpnameService = stockOpnameService as jest.Mocked<
  typeof stockOpnameService
>;
const mockedEntryService = stockEntryService as jest.Mocked<
  typeof stockEntryService
>;

/**
 * The head of the Koreksi Stok module: the tab bar that folded two rail rows
 * into one, and the counts under it.
 *
 * The month window is what these tests are mostly about. It is built from LOCAL
 * date parts on purpose — `toISOString()` in WIB would send yesterday before
 * 07:00, and last month on the first — and nothing on screen would look wrong if
 * it were off by a day.
 */
function totalling(total: number) {
  return { items: [], pagination: { page: 1, limit: 1, total, totalPages: 1 } };
}

/** 10 September 2026, local — the month runs 01…30. */
const INSIDE_SEPTEMBER = new Date(2026, 8, 10, 6, 30);

/**
 * Renders with the clock held still, then hands time back before any `waitFor`:
 * the hook reads `new Date()` inside its effect, which runs within render's own
 * act(), while a faked clock would stall the async assertions afterwards.
 */
function renderAt(
  when: Date,
  overrides: Parameters<typeof renderWithAuth>[1] = {},
) {
  jest.useFakeTimers().setSystemTime(when);
  try {
    return renderWithAuth(<StockCorrectionModuleHeader />, overrides);
  } finally {
    jest.useRealTimers();
  }
}

beforeEach(() => {
  pathname.mockReturnValue("/dashboard/inventory/opname");
  // Draft sheets are the query with no date bounds; the month query is the one
  // carrying them.
  mockedOpnameService.list.mockImplementation((query = {}) =>
    Promise.resolve(totalling(query.status === "draft" ? 2 : 7)),
  );
  mockedEntryService.list.mockResolvedValue(totalling(4));
});

describe("StockCorrectionModuleHeader", () => {
  it("draws the module's two tabs", async () => {
    renderAt(INSIDE_SEPTEMBER);

    expect(screen.getByRole("link", { name: "Opname" })).toHaveAttribute(
      "href",
      "/dashboard/inventory/opname",
    );
    expect(screen.getByRole("link", { name: "Penyesuaian" })).toHaveAttribute(
      "href",
      "/dashboard/inventory/adjustments",
    );

    await waitFor(() => expect(mockedEntryService.list).toHaveBeenCalled());
  });

  it("marks the tab the reader is on, and only that one", async () => {
    pathname.mockReturnValue("/dashboard/inventory/adjustments");
    renderAt(INSIDE_SEPTEMBER);

    expect(screen.getByRole("link", { name: "Penyesuaian" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Opname" })).not.toHaveAttribute(
      "aria-current",
    );

    await waitFor(() => expect(mockedEntryService.list).toHaveBeenCalled());
  });

  it("bounds both monthly counts at both ends of the local month", async () => {
    renderAt(INSIDE_SEPTEMBER);

    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    expect(screen.getByText("4")).toBeInTheDocument();

    expect(mockedOpnameService.list).toHaveBeenCalledWith({
      page: 1,
      limit: 1,
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });
    expect(mockedEntryService.list).toHaveBeenCalledWith({
      kind: "adjustment",
      page: 1,
      limit: 1,
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });
  });

  it("takes the month's last day from the calendar, not from 30", async () => {
    // February 2028 — a leap year, and the month the naive +30 gets wrong twice.
    renderAt(new Date(2028, 1, 3));

    await waitFor(() =>
      expect(mockedOpnameService.list).toHaveBeenCalledWith({
        page: 1,
        limit: 1,
        dateFrom: "2028-02-01",
        dateTo: "2028-02-29",
      }),
    );
  });

  it("counts unfinished sheets without a date window", async () => {
    // An August sheet still open in September is exactly the one worth
    // surfacing; a monthly window would hide it as it started to matter.
    renderAt(INSIDE_SEPTEMBER);

    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(mockedOpnameService.list).toHaveBeenCalledWith({
      page: 1,
      limit: 1,
      status: "draft",
    });
  });

  it("says a count failed rather than showing it as zero", async () => {
    mockedEntryService.list.mockRejectedValue(new Error("network"));
    renderAt(INSIDE_SEPTEMBER);

    await waitFor(() =>
      expect(screen.getByText("gagal dimuat")).toBeInTheDocument(),
    );
  });

  it("drops the Penyesuaian tab and its tile for a role without the grant", async () => {
    renderAt(INSIDE_SEPTEMBER, {
      isSuperAdmin: false,
      permissions: [{ feature: "stockOpnames", actions: ["read"] }],
    });

    await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
    expect(
      screen.queryByRole("link", { name: "Penyesuaian" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Penyesuaian bulan ini")).not.toBeInTheDocument();
    // And nothing was asked of an endpoint the role would be refused by.
    expect(mockedEntryService.list).not.toHaveBeenCalled();
  });

  it("badges the tile no endpoint can answer", async () => {
    renderAt(INSIDE_SEPTEMBER);

    expect(screen.getByText("Selisih nilai")).toBeInTheDocument();
    expect(screen.getByText("Segera")).toBeInTheDocument();

    await waitFor(() => expect(mockedEntryService.list).toHaveBeenCalled());
  });
});
