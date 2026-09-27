import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CustomerSummaryScreen } from "@/features/customers";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import type { Customer, CustomerStats, DormantCustomer } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customer.service");
jest.mock("@/services/pet.service");

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/master/customers/ringkasan",
}));

const mockedCustomerService = customerService as jest.Mocked<
  typeof customerService
>;
const mockedPetService = petService as jest.Mocked<typeof petService>;

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

function dormant(overrides: Partial<DormantCustomer> = {}): DormantCustomer {
  return {
    _id: "c1",
    name: "Dewi Anggraini",
    phone: "0817-2222-5566",
    email: null,
    vipTier: null,
    createdAt: daysAgo(400),
    lastVisitAt: daysAgo(83),
    daysSinceLastVisit: 83,
    ...overrides,
  };
}

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    _id: "n1",
    tenantId: "t1",
    code: "CUST-0005",
    name: "Fajar Ramadhan",
    email: null,
    phone: "0856-4433-2211",
    address: null,
    // The Pelanggan form's fields (27 September 2026). An ordinary private
    // customer with no category — what the register is mostly made of.
    kind: "individual" as const,
    customerTypeId: null,
    customerTypeName: null,
    taxId: null,
    picName: null,
    notes: null,
    notifications: {
      bookingReminder: true,
      membershipRenewal: true,
      promo: false,
    },
    vipTier: null,
    deletedAt: null,
    createdAt: daysAgo(4),
    updatedAt: daysAgo(4),
    ...overrides,
  };
}

function stats(overrides: Partial<CustomerStats> = {}): CustomerStats {
  return {
    total: 412,
    newCustomers: { days: 30, count: 23, previousCount: 19 },
    activeCustomers: {
      days: 90,
      count: 173,
      share: 173 / 412,
      revenue: "69685092.0000",
      averageSpend: "402804.0000",
      repeatCount: 173,
      repeatShare: 0.42,
    },
    ...overrides,
  };
}

function listOf(items: Customer[], total = items.length) {
  return { items, pagination: { page: 1, limit: 8, total, totalPages: 1 } };
}

/**
 * The Ringkasan tab — the module's front page.
 *
 * WHAT THIS SUITE PROTECTS. The page's whole value is that its two lists are
 * true: a dormant list that quietly dropped the customers who have never bought
 * anything, or a "pelanggan baru" panel that counted the eight rows it drew,
 * would both look completely normal on screen and be wrong in the direction that
 * costs a shop money — somebody not rung.
 */
beforeEach(() => {
  mockedPetService.list.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 1, total: 587, totalPages: 1 },
  });
  mockedCustomerService.stats.mockResolvedValue(stats());
  mockedCustomerService.dormant.mockResolvedValue({
    days: 60,
    items: [dormant()],
  });
  mockedCustomerService.list.mockResolvedValue(listOf([customer()], 23));
});

describe("customer summary tab", () => {
  it("draws its OWN three cards instead of the register's four", async () => {
    renderWithAuth(<CustomerSummaryScreen />);

    // What the period DID — not how big the shop is. Both rows at once would be
    // seven numbers over a worklist.
    expect(
      await screen.findByText("Pelanggan baru periode ini"),
    ).toBeVisible();
    expect(screen.getByText("Rata-rata belanja / pelanggan")).toBeVisible();
    expect(screen.getByText("Repeat rate (90 hari terakhir)")).toBeVisible();
    expect(screen.queryByText("Jumlah hewan")).not.toBeInTheDocument();
    expect(screen.queryByText("Jumlah pelanggan")).not.toBeInTheDocument();
  });

  it("shows the period's figures, and the average the server divided", async () => {
    renderWithAuth(<CustomerSummaryScreen />);

    // Scoped to the card: "23" is also the count chip on the new-customer
    // worklist below, which is the same figure arrived at the same way.
    const card = (await screen.findByText("Pelanggan baru periode ini"))
      .closest("div") as HTMLElement;
    expect(within(card).getByText("23")).toBeVisible();
    expect(screen.getByText("Rp 402.804")).toBeVisible();
    expect(screen.getByText("42%")).toBeVisible();
    // 23 against last period's 19.
    expect(screen.getByText(/21,1% vs periode sebelumnya/)).toBeVisible();
  });

  it("says nothing about growth when the previous period was empty", async () => {
    // One customer after none is not "+100%", it is the first one.
    mockedCustomerService.stats.mockResolvedValue(
      stats({ newCustomers: { days: 30, count: 1, previousCount: 0 } }),
    );

    renderWithAuth(<CustomerSummaryScreen />);

    await screen.findByText("Pelanggan baru periode ini");
    expect(
      screen.queryByText(/vs periode sebelumnya/),
    ).not.toBeInTheDocument();
  });

  it("leaves the average as a dash when nobody bought anything", async () => {
    mockedCustomerService.stats.mockResolvedValue(
      stats({
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

    renderWithAuth(<CustomerSummaryScreen />);

    await screen.findByText("Rata-rata belanja / pelanggan");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("opens on the 60-day window and lists who has stopped coming", async () => {
    renderWithAuth(<CustomerSummaryScreen />);

    expect(await screen.findByText("Dewi Anggraini")).toBeVisible();
    expect(screen.getByText(/83 hari lalu/)).toBeVisible();
    expect(mockedCustomerService.dormant).toHaveBeenCalledWith({
      days: 60,
      limit: 10,
    });
  });

  it("asks the server again when the reader widens the window", async () => {
    renderWithAuth(<CustomerSummaryScreen />);
    await screen.findByText("Dewi Anggraini");

    await userEvent.click(
      screen.getByRole("button", { name: /Batas tidak aktif/i }),
    );
    await userEvent.click(screen.getByRole("option", { name: "120 hari" }));

    // Re-queried, not sifted in the browser: the server holds the till history.
    await waitFor(() =>
      expect(mockedCustomerService.dormant).toHaveBeenLastCalledWith({
        days: 120,
        limit: 10,
      }),
    );
  });

  it("says plainly when somebody has never bought anything", async () => {
    // The case an inner join drops — and the most neglected contact there is.
    mockedCustomerService.dormant.mockResolvedValue({
      days: 60,
      items: [
        dormant({
          name: "Sinta Halim",
          lastVisitAt: null,
          daysSinceLastVisit: 400,
        }),
      ],
    });

    renderWithAuth(<CustomerSummaryScreen />);

    expect(await screen.findByText("Sinta Halim")).toBeVisible();
    // Never been in — not the registration date dressed up as a visit.
    expect(
      screen.getByText(/Belum pernah belanja · terdaftar/),
    ).toBeVisible();
  });

  it("offers a WhatsApp chat on a row worth ringing", async () => {
    renderWithAuth(<CustomerSummaryScreen />);

    const chat = await screen.findByRole("link", { name: /Hubungi/ });
    expect(chat).toHaveAttribute("href", "https://wa.me/6281722225566");
  });

  it("says nobody is overdue rather than drawing an empty box", async () => {
    mockedCustomerService.dormant.mockResolvedValue({ days: 60, items: [] });

    renderWithAuth(<CustomerSummaryScreen />);

    expect(
      await screen.findByText(/Tidak ada pelanggan yang tertinggal/),
    ).toBeVisible();
  });

  it("counts new customers from the server, and says the rows are a sample", async () => {
    renderWithAuth(<CustomerSummaryScreen />);

    expect(await screen.findByText("Fajar Ramadhan")).toBeVisible();
    // One row drawn, twenty-three counted — said out loud, or the panel reads as
    // "one new customer this fortnight".
    expect(screen.getByText(/Menampilkan 1 dari 23/)).toBeVisible();
    // The panel's own window, asked for by the panel — not the tiles' default.
    expect(mockedCustomerService.stats).toHaveBeenCalledWith({
      newWithinDays: 14,
    });
  });

  it("keeps a customer registered before the window out of the new list", async () => {
    mockedCustomerService.list.mockResolvedValue(
      listOf([customer({ createdAt: daysAgo(20) })], 0),
    );

    renderWithAuth(<CustomerSummaryScreen />);

    expect(
      await screen.findByText(/Belum ada pelanggan baru dalam 14 hari/),
    ).toBeVisible();
  });

  it("marks the follow-up flag and membership expiry as not built", async () => {
    renderWithAuth(<CustomerSummaryScreen />);

    await screen.findByText("Fajar Ramadhan");
    expect(screen.getByText(/belum punya catatan follow-up/)).toBeVisible();
    expect(screen.getByText(/Membership belum ada di sistem/)).toBeVisible();
  });

  it("says a list failed rather than showing it as empty", async () => {
    mockedCustomerService.dormant.mockRejectedValue(new Error("network"));

    renderWithAuth(<CustomerSummaryScreen />);

    expect(
      await screen.findByText(/Daftar pelanggan tidak aktif tidak bisa dimuat/),
    ).toBeVisible();
  });
});
