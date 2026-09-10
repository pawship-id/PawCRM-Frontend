import { screen, waitFor } from "@testing-library/react";

import { CustomerModuleHeader } from "@/features/customers";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";

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
 * submenu, and the two tiles that carry a real number.
 *
 * The tiles are the part worth a test — they are the reason the header fetches
 * anything, and the failure mode ("412" quietly meaning something else) is
 * invisible on screen.
 */
function totalling(total: number) {
  return { items: [], pagination: { page: 1, limit: 1, total, totalPages: 1 } };
}

beforeEach(() => {
  pathname.mockReturnValue("/dashboard/master/customers");
  mockedCustomerService.list.mockResolvedValue(totalling(412));
  mockedPetService.list.mockResolvedValue(totalling(587));
});

describe("CustomerModuleHeader", () => {
  it("draws the module's four tabs, every one of them a route", async () => {
    renderWithAuth(<CustomerModuleHeader />);

    // The unbuilt two included: they open on a "belum tersedia" page rather
    // than sitting on the row as inert grey words.
    const hrefs = Object.fromEntries(
      ["Pelanggan", "Hewan", "Membership", "Riwayat"].map((label) => [
        label,
        screen.getByRole("link", { name: label }).getAttribute("href"),
      ]),
    );

    expect(hrefs).toEqual({
      Pelanggan: "/dashboard/master/customers",
      Hewan: "/dashboard/master/pets",
      Membership: "/dashboard/master/customers/membership",
      Riwayat: "/dashboard/master/customers/riwayat",
    });

    await waitFor(() => expect(mockedPetService.list).toHaveBeenCalled());
  });

  it("does not leave the Pelanggan tab lit on the tabs nested under it", async () => {
    // Its href is the prefix of Membership's and Riwayat's, so a prefix match
    // would mark two tabs current at once.
    pathname.mockReturnValue("/dashboard/master/customers/membership");
    renderWithAuth(<CustomerModuleHeader />);

    expect(screen.getByRole("link", { name: "Membership" })).toHaveAttribute(
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

  it("counts the whole register, unfiltered, one row at a time", async () => {
    renderWithAuth(<CustomerModuleHeader />);

    await waitFor(() => expect(screen.getByText("412")).toBeInTheDocument());
    expect(screen.getByText("587")).toBeInTheDocument();
    // The one derived number on the header: 587 / 412, in Indonesian notation.
    expect(screen.getByText("1,4 per pelanggan")).toBeInTheDocument();

    // A count, not a page of rows — the tile costs one small query.
    expect(mockedCustomerService.list).toHaveBeenCalledWith({
      page: 1,
      limit: 1,
    });
  });

  it("says a count failed rather than showing it as zero", async () => {
    mockedPetService.list.mockRejectedValue(new Error("network"));
    renderWithAuth(<CustomerModuleHeader />);

    await waitFor(() =>
      expect(screen.getByText("gagal dimuat")).toBeInTheDocument(),
    );
    expect(screen.queryByText("0")).not.toBeInTheDocument();
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
    expect(screen.queryByText("Hewan terdaftar")).not.toBeInTheDocument();
    // And nothing was asked of an endpoint the role would be refused by.
    expect(mockedPetService.list).not.toHaveBeenCalled();
  });

  it("badges the two tiles the database cannot answer", async () => {
    renderWithAuth(<CustomerModuleHeader />);

    expect(screen.getByText("Baru bulan ini")).toBeInTheDocument();
    expect(screen.getByText("Membership habis ≤30 hari")).toBeInTheDocument();
    expect(screen.getAllByText("Segera")).toHaveLength(2);

    await waitFor(() => expect(mockedPetService.list).toHaveBeenCalled());
  });
});
