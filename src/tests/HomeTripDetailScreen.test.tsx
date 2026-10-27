import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HomeTripDetailScreen } from "@/features/booking";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { homeTripService } from "@/services/homeTrip.service";
import type { HomeTrip, HomeTripStatus } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/homeTrip.service");
jest.mock("@/services/booking.service");

const trips = homeTripService as jest.Mocked<typeof homeTripService>;
const bookings = bookingService as jest.Mocked<typeof bookingService>;

const NEXT: Record<string, { next: HomeTripStatus | null; label: string | null }> = {
  scheduled: { next: "otw_customer", label: "Berangkat" },
  otw_customer: { next: "arrived_customer", label: "Sampai di rumah" },
  arrived_customer: { next: "otw_store", label: "Pulang" },
  otw_store: { next: "arrived_store", label: "Sampai di toko" },
  arrived_store: { next: null, label: null },
};

const LABEL: Record<string, string> = {
  scheduled: "Dijadwalkan",
  otw_customer: "Berangkat",
  arrived_customer: "Sampai di rumah",
  otw_store: "Pulang",
  arrived_store: "Sampai di toko",
};

const RUNGS = Object.keys(LABEL);

function tripAt(status: HomeTripStatus, over: Partial<HomeTrip> = {}): HomeTrip {
  const step = NEXT[status] ?? { next: null, label: null };
  const reached = RUNGS.slice(0, RUNGS.indexOf(status) + 1);

  return {
    _id: "trip-1",
    groupId: "grp-1",
    branchId: "branch-1",
    customerId: "cust-1",
    customerName: "Bu Lisa",
    performerUserId: null,
    performerName: null,
    status,
    statusLabel: LABEL[status] ?? status,
    nextStatus: step.next,
    nextLabel: step.label,
    scheduledAt: "2026-09-03T02:00:00.000Z",
    origin: { address: "Buloo Cibubur", lat: -6.36, lng: 106.88 },
    destination: { address: "Jl. Melati 5, Cibubur", lat: -6.37, lng: 106.9 },
    zoneName: "Zona B",
    distanceKm: 7.5,
    stops: [],
    history: reached.map((rung, index) => ({
      status: rung as HomeTripStatus,
      label: LABEL[rung],
      at: `2026-09-03T0${index + 1}:15:00.000Z`,
      by: "user-2",
      byName: "Rio",
    })),
    bookings: [
      {
        _id: "bk-1",
        bookingNumber: "BK-260903-001",
        petName: "Mochi",
        serviceName: "Full Grooming",
        status: "confirmed",
      },
      {
        _id: "bk-2",
        bookingNumber: "BK-260903-002",
        petName: "Kopi",
        serviceName: "Mandi",
        status: "confirmed",
      },
    ],
    fee: {
      name: "Biaya kunjungan · Zona B",
      amount: "35000.0000",
      zoneName: "Zona B",
      distanceKm: 7.5,
      unit: "per_visit",
    },
    billing: { state: "unbilled" },
    ...over,
  };
}

const show = (options = {}) =>
  renderWithAuth(<HomeTripDetailScreen id="trip-1" />, options);

beforeEach(() => {
  jest.clearAllMocks();
  trips.get.mockResolvedValue(tripAt("scheduled"));
  trips.changeStatus.mockResolvedValue(tripAt("otw_customer"));
  trips.setPerformer.mockResolvedValue(tripAt("scheduled"));
  bookings.availability.mockResolvedValue([]);
});

describe("HomeTripDetailScreen", () => {
  it("names the customer, the address and the zone", async () => {
    show();

    expect(
      await screen.findByRole("heading", { level: 1, name: /Perjalanan ke Bu Lisa/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Jl. Melati 5, Cibubur")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buka di peta" })).toHaveAttribute(
      "href",
      expect.stringContaining("-6.37%2C106.9"),
    );
    expect(screen.getByText(/Zona B · 7,5 km/)).toBeInTheDocument();
    expect(screen.getByText("Buloo Cibubur")).toBeInTheDocument();
  });

  it("lists every booking the trip serves, each linked to its page", async () => {
    show();

    expect(await screen.findByRole("link", { name: "BK-260903-001" })).toHaveAttribute(
      "href",
      "/dashboard/booking/bk-1",
    );
    expect(screen.getByRole("link", { name: "BK-260903-002" })).toHaveAttribute(
      "href",
      "/dashboard/booking/bk-2",
    );
    expect(screen.getByText("Kopi · Mandi")).toBeInTheDocument();
  });

  it("shows the trip's own fee, locked, and that it is not billed yet", async () => {
    const { container } = show();

    await screen.findByText("Biaya kunjungan · Zona B");

    const fees = container.querySelector("[data-trip-fees]") as HTMLElement;
    expect(fees).toHaveTextContent("Rp 35.000");
    expect(fees).toHaveTextContent("7,5 km garis lurus · Dihitung per kunjungan · harga terkunci saat perjalanan dibuat");
    expect(fees).toHaveTextContent("Belum ditagih · ikut booking pertama yang ditagih");
  });

  it("says where and with which booking the trip was billed", async () => {
    trips.get.mockResolvedValue(
      tripAt("scheduled", {
        billing: {
          state: "billed",
          via: "pos",
          at: "2026-10-11T03:00:00.000Z",
          bookingId: "bk-1",
          bookingNumber: "BK-260903-001",
        },
      }),
    );
    show();

    expect(
      await screen.findByText("Sudah ditagih di kasir · bersama BK-260903-001"),
    ).toBeInTheDocument();
  });

  it("says so when the trip carries no fee", async () => {
    trips.get.mockResolvedValue(tripAt("scheduled", { fee: null }));
    show();

    expect(
      await screen.findByText("Tidak ada biaya kunjungan untuk perjalanan ini."),
    ).toBeInTheDocument();
  });

  it("marks the rungs reached, with their time and who", async () => {
    trips.get.mockResolvedValue(tripAt("arrived_customer"));
    show();

    const list = await screen.findByRole("list", { name: "Perjalanan" });
    const rows = within(list).getAllByRole("listitem");

    expect(rows.map((row) => row.getAttribute("data-reached"))).toEqual([
      "true",
      "true",
      "true",
      "false",
      "false",
    ]);
    expect(within(rows[1]).getByText(/Rio/)).toBeInTheDocument();
    expect(within(rows[3]).queryByText(/Rio/)).not.toBeInTheDocument();
  });

  it.each([
    ["scheduled", "Berangkat", "otw_customer"],
    ["otw_customer", "Sampai di rumah", "arrived_customer"],
    ["arrived_customer", "Pulang", "otw_store"],
    ["otw_store", "Sampai di toko", "arrived_store"],
  ] as const)("at %s the button says %s and asks for %s", async (status, word, to) => {
    trips.get.mockResolvedValue(tripAt(status));
    show();

    await userEvent.click(await screen.findByRole("button", { name: word }));
    expect(trips.changeStatus).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(`${word}?`)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: word }));

    expect(trips.changeStatus).toHaveBeenCalledWith("trip-1", to);
  });

  it("moves nothing when the dialog is dismissed", async () => {
    show();

    await userEvent.click(await screen.findByRole("button", { name: "Berangkat" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Batal" }));

    expect(trips.changeStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("re-reads the trip after a move — the door also moves the bookings", async () => {
    show();

    await userEvent.click(await screen.findByRole("button", { name: "Berangkat" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Berangkat" }));

    await waitFor(() => expect(trips.get).toHaveBeenCalledTimes(2));
  });

  it("offers no button once the trip is over", async () => {
    trips.get.mockResolvedValue(tripAt("arrived_store"));
    show();

    expect(await screen.findByText("Perjalanan selesai.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Berangkat" })).not.toBeInTheDocument();
  });

  it("shows the server's own words when a rung is refused", async () => {
    trips.get.mockResolvedValue(tripAt("arrived_customer"));
    trips.changeStatus.mockRejectedValue(
      new ApiError("Hewan Mochi belum selesai dikerjakan.", 409),
    );
    show();

    await userEvent.click(await screen.findByRole("button", { name: "Pulang" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Pulang" }));

    expect(
      await screen.findByText(/Hewan Mochi belum selesai dikerjakan/),
    ).toBeInTheDocument();
  });

  it("disables the button, with a reason, for somebody who may not move it", async () => {
    show({
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read"] }],
    });

    expect(await screen.findByRole("button", { name: "Berangkat" })).toBeDisabled();
    expect(screen.getByText(/tidak punya izin/)).toBeInTheDocument();
  });

  it("offers the performer select only with bookings:update, while scheduled", async () => {
    show({
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read", "update"] }],
    });

    expect(
      await screen.findByRole("combobox", { name: /Yang menjalankan/ }),
    ).toBeInTheDocument();
  });

  it("states who goes, without a select, for ladder-only staff", async () => {
    show({
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read", "advanceStatus"] }],
    });

    expect(await screen.findByText(/Ikut groomer booking/)).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /Yang menjalankan/ }),
    ).not.toBeInTheDocument();
  });

  it("has no select once the trip has left, even with bookings:update", async () => {
    trips.get.mockResolvedValue(
      tripAt("otw_customer", { performerUserId: "user-1", performerName: "Mbak Sari" }),
    );
    show({
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read", "update"] }],
    });

    expect(await screen.findByText("Mbak Sari")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /Yang menjalankan/ }),
    ).not.toBeInTheDocument();
  });

  it("says so when the trip cannot be opened", async () => {
    trips.get.mockRejectedValue(new ApiError("Perjalanan tidak ditemukan", 404));
    show();

    expect(await screen.findByText("Perjalanan tidak ditemukan")).toBeInTheDocument();
  });
});

describe("HomeTripDetailScreen — the fee's own discount (12 October 2026)", () => {
  const permissions = [{ feature: "bookings", actions: ["read", "update"] }];

  it("saves a discount on an unbilled fee and shows what is left to pay", async () => {
    const base = tripAt("scheduled");
    trips.setFeeDiscount.mockResolvedValue({
      ...base,
      fee: {
        ...base.fee!,
        discount: { mode: "percent", value: "10.0000", resolvedAmount: "3500.0000" },
        netAmount: "31500.0000",
      },
    });
    show({ isSuperAdmin: false, permissions });

    await userEvent.type(await screen.findByLabelText("Diskon biaya kunjungan"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Simpan diskon" }));

    expect(trips.setFeeDiscount).toHaveBeenCalledWith("trip-1", { mode: "percent", value: "10" });
    expect(await screen.findByText("Yang ditagih")).toBeInTheDocument();
    expect(screen.getByLabelText("Diskon biaya kunjungan")).toHaveValue("10");
  });

  it("offers no fields once the fee is billed", async () => {
    trips.get.mockResolvedValue(
      tripAt("scheduled", {
        billing: { state: "billed", via: "pos", at: "2026-09-03T05:00:00.000Z", bookingId: null, bookingNumber: null },
      }),
    );
    show({ isSuperAdmin: false, permissions });

    expect(await screen.findByText(/Sudah ditagih di kasir/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Diskon biaya kunjungan")).not.toBeInTheDocument();
  });

  it("offers no fields without bookings:update", async () => {
    show({
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read", "advanceStatus"] }],
    });

    expect(await screen.findByText("Biaya kunjungan · Zona B")).toBeInTheDocument();
    expect(screen.queryByLabelText("Diskon biaya kunjungan")).not.toBeInTheDocument();
  });
});
