import { screen, waitFor } from "@testing-library/react";

import { CustomerModuleHeader } from "@/features/customers";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import type { CustomerStats } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customer.service");
jest.mock("@/services/pet.service");

const pathname = jest.fn(() => "/dashboard/master/customers");
jest.mock("next/navigation", () => ({
  usePathname: () => pathname(),
}));

const mockedCustomerService = customerService as jest.Mocked<
  typeof customerService
>;
const mockedPetService = petService as jest.Mocked<typeof petService>;

/**
 * The head of the Pelanggan module: the tab bar that replaced the rail's
 * submenu, and the four tiles above it.
 *
 * THE TILES ARE THE PART WORTH A TEST — they are the reason the header fetches
 * anything, and their failure mode ("412" quietly meaning something else) is
 * invisible on screen.
 *
 * TWO OF THE FOUR USED TO BE BADGED "Segera". They are real now, off
 * `GET /customers/stats` (27 September 2026), and what this suite pins is the
 * thing that was wrong with deriving them on the client: the numbers must not
 * come from the filtered list on screen, and a caption must never claim a window
 * the server did not measure.
 */
function stats(overrides: Partial<CustomerStats> = {}): CustomerStats {
  return {
    total: 412,
    newCustomers: { days: 30, count: 23, previousCount: 19 },
    activeCustomers: {
      days: 90,
      count: 173,
      share: 173 / 412,
      revenue: "69684000.0000",
      averageSpend: "402804.0000",
      repeatCount: 173,
      repeatShare: 0.42,
    },
    ...overrides,
  };
}

function totalling(total: number) {
  return { items: [], pagination: { page: 1, limit: 1, total, totalPages: 1 } };
}

beforeEach(() => {
  pathname.mockReturnValue("/dashboard/master/customers");
  mockedCustomerService.stats.mockResolvedValue(stats());
  mockedPetService.list.mockResolvedValue(totalling(587));
});

describe("CustomerModuleHeader", () => {
  it("draws the module's five tabs, every one of them a route", async () => {
    renderWithAuth(<CustomerModuleHeader />);

    // The unbuilt two included: they open on a "belum tersedia" page rather
    // than sitting on the row as inert grey words.
    const hrefs = Object.fromEntries(
      ["Ringkasan", "Pelanggan", "Hewan", "Membership", "Riwayat"].map(
        (label) => [
          label,
          screen.getByRole("link", { name: label }).getAttribute("href"),
        ],
      ),
    );

    expect(hrefs).toEqual({
      Ringkasan: "/dashboard/master/customers/ringkasan",
      Pelanggan: "/dashboard/master/customers",
      Hewan: "/dashboard/master/pets",
      Membership: "/dashboard/master/customers/membership",
      Riwayat: "/dashboard/master/customers/riwayat",
    });

    await waitFor(() => expect(mockedPetService.list).toHaveBeenCalled());
  });

  it("does not leave the Pelanggan tab lit on the tabs nested under it", async () => {
    // Its href is the prefix of every other tab's, so a prefix match would mark
    // two tabs current at once.
    pathname.mockReturnValue("/dashboard/master/customers/ringkasan");
    renderWithAuth(<CustomerModuleHeader />);

    expect(screen.getByRole("link", { name: "Ringkasan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Pelanggan" })).not.toHaveAttribute(
      "aria-current",
    );

    await waitFor(() => expect(mockedPetService.list).toHaveBeenCalled());
  });

  it("marks the tab the reader is on, and only that one", async () => {
    pathname.mockReturnValue("/dashboard/master/pets");
    renderWithAuth(<CustomerModuleHeader />);

    expect(screen.getByRole("link", { name: "Hewan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Pelanggan" })).not.toHaveAttribute(
      "aria-current",
    );

    await waitFor(() => expect(mockedPetService.list).toHaveBeenCalled());
  });

  it("draws the mockup's four numbers", async () => {
    renderWithAuth(<CustomerModuleHeader />);

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(screen.getByText("Jumlah hewan")).toBeInTheDocument();
    expect(screen.getByText("587")).toBeInTheDocument();
    expect(screen.getByText("Jumlah pelanggan")).toBeInTheDocument();
    expect(screen.getByText("Pelanggan baru bulan ini")).toBeInTheDocument();
    expect(screen.getByText("23")).toBeInTheDocument();
    // 173 of 412, rounded — the share the server divided, not one derived here.
    expect(screen.getByText("42%")).toBeInTheDocument();
    // The one derived number on the header: 587 / 412, in Indonesian notation.
    expect(screen.getByText("1,4 per pelanggan")).toBeInTheDocument();
  });

  it("counts the register unfiltered, on its own endpoint", async () => {
    renderWithAuth(<CustomerModuleHeader />);

    await waitFor(() => expect(mockedCustomerService.stats).toHaveBeenCalled());
    // NOT the list on screen: that one is filtered, so "Jumlah pelanggan" would
    // fall to 3 while somebody types in the search box.
    expect(mockedCustomerService.list).not.toHaveBeenCalled();
    // One small query for the animals, not a page of rows.
    expect(mockedPetService.list).toHaveBeenCalledWith({ page: 1, limit: 1 });
  });

  it("captions each window with the one the server measured", async () => {
    mockedCustomerService.stats.mockResolvedValue(
      stats({
        newCustomers: { days: 7, count: 4, previousCount: 3 },
        activeCustomers: {
          days: 30,
          count: 100,
          share: 100 / 412,
          revenue: "1000000.0000",
          averageSpend: "10000.0000",
          repeatCount: 40,
          repeatShare: 40 / 412,
        },
      }),
    );

    renderWithAuth(<CustomerModuleHeader />);

    await waitFor(() =>
      expect(screen.getByText("7 hari terakhir")).toBeInTheDocument(),
    );
    expect(screen.getByText("Transaksi 30 hari terakhir")).toBeInTheDocument();
  });

  it("leaves the share as a dash when the server declined to divide", async () => {
    // 0 customers out of 0 is a question with no answer; "0%" over a shop that
    // opened this week is a failure report rather than a fact.
    mockedCustomerService.stats.mockResolvedValue(
      stats({
        total: 0,
        newCustomers: { days: 30, count: 0, previousCount: 0 },
        activeCustomers: {
          days: 90,
          count: 0,
          share: null,
          revenue: "0.0000",
          averageSpend: null,
          repeatCount: 0,
          repeatShare: null,
        },
      }),
    );

    renderWithAuth(<CustomerModuleHeader />);

    await waitFor(() =>
      expect(
        screen.getByText("dari seluruh pelanggan terdaftar"),
      ).toBeInTheDocument(),
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("says a count failed rather than showing it as zero", async () => {
    mockedPetService.list.mockRejectedValue(new Error("network"));
    renderWithAuth(<CustomerModuleHeader />);

    await waitFor(() =>
      expect(screen.getByText("gagal dimuat")).toBeInTheDocument(),
    );
  });

  it("drops the Hewan tab and its tile for a role that cannot read pets", async () => {
    renderWithAuth(<CustomerModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "customers", actions: ["read"] }],
    });

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(
      screen.queryByRole("link", { name: "Hewan" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Jumlah hewan")).not.toBeInTheDocument();
    // And nothing was asked of an endpoint the role would be refused by.
    expect(mockedPetService.list).not.toHaveBeenCalled();
  });

  it("lets a tab replace the whole row, and then fetches nothing for it", async () => {
    // The Ringkasan tab asks a different question and draws its own three cards.
    // Leaving the header's fetch running would be the same endpoint twice.
    renderWithAuth(
      <CustomerModuleHeader tiles={<p>Kartu ringkasan</p>} />,
    );

    expect(screen.getByText("Kartu ringkasan")).toBeInTheDocument();
    expect(screen.queryByText("Jumlah pelanggan")).not.toBeInTheDocument();
    expect(mockedCustomerService.stats).not.toHaveBeenCalled();
    expect(mockedPetService.list).not.toHaveBeenCalled();
  });

  it("drops the three customer tiles for a role that can only read pets", async () => {
    renderWithAuth(<CustomerModuleHeader />, {
      isSuperAdmin: false,
      permissions: [{ feature: "pets", actions: ["read"] }],
    });

    await waitFor(() => expect(screen.getByText("587")).toBeInTheDocument());
    expect(screen.queryByText("Jumlah pelanggan")).not.toBeInTheDocument();
    expect(mockedCustomerService.stats).not.toHaveBeenCalled();
  });
});
