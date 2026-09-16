import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TodayScreen } from "@/features/booking";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import type { Booking, BookingMainService, PageResult } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/branch.service");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/dashboard/booking",
}));

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const branches = branchService as jest.Mocked<typeof branchService>;

/** Today at `hour`, in the browser's zone — which is the shop's. */
function at(hour: number, minute = 0): string {
  const now = new Date();
  now.setHours(hour, minute, 0, 0);
  return now.toISOString();
}

function service(over: Partial<BookingMainService> = {}): BookingMainService {
  return {
    serviceId: "svc-groom",
    name: "Basic Grooming",
    serviceType: "Grooming",
    price: "120000.0000",
    durationMin: 90,
    status: "pending",
    statusHistory: [],
    startedAt: null,
    finishedAt: null,
    sessions: [],
    addons: [],
    ...over,
  };
}

function booking(over: Partial<Booking> = {}): Booking {
  return {
    _id: "bk-1",
    bookingNumber: "BK-260911-001",
    customerName: "Bu Rina",
    petId: "pet-1",
    petName: "Bella",
    status: "confirmed",
    statusHistory: [],
    nextStatuses: ["arrived"],
    scheduledAt: at(9),
    location: "in_store",
    pickupRequested: false,
    deliveryRequested: false,
    tripAddress: null,
    posTransactionId: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    internalNotes: null,
    groomerName: "Belum ditentukan",
    totalAmount: "120000.0000",
    service: service(),
    ...over,
  } as Booking;
}

function page(items: Booking[]): PageResult<Booking> {
  return {
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  bookings.list.mockResolvedValue(page([booking()]));
  branches.list.mockResolvedValue({
    items: [{ _id: "b1", name: "Cibubur" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
});

describe("Hari Ini", () => {
  it("draws one column per line of business, and no column for a line nobody booked", async () => {
    bookings.list.mockResolvedValue(
      page([
        booking(),
        booking({
          _id: "bk-2",
          petName: "Bruno",
          service: service({ serviceType: "Hotel", name: "Menginap" }),
        }),
      ]),
    );

    renderWithAuth(<TodayScreen />);

    expect(await screen.findByRole("region", { name: "Grooming" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Hotel" })).toBeInTheDocument();
    /* Nothing writes a journey yet, so that column is the disabled one. */
    expect(screen.queryByRole("region", { name: "Antar-Jemput" })).toBeNull();
    expect(
      screen.getByRole("region", { name: "Antar-Jemput — segera" }),
    ).toBeInTheDocument();
  });

  /*
    THE TILES AND THE CARDS COME FROM ONE ARRAY, so a tile can never disagree
    with the column under it. "beban" is LOAD, never a capacity ceiling —
    nothing in this system states a groomer's working hours.
  */
  it("reports the day's load per line, and its value", async () => {
    bookings.list.mockResolvedValue(
      page([booking(), booking({ _id: "bk-2", petName: "Coco", scheduledAt: at(13) })]),
    );

    renderWithAuth(<TodayScreen />);

    const summary = await screen.findByRole("region", { name: "Ringkasan hari ini" });
    expect(within(summary).getByText("Grooming")).toBeInTheDocument();
    expect(within(summary).getByText("beban 3j")).toBeInTheDocument();
    expect(within(summary).getByText("Nilai hari ini")).toBeInTheDocument();
    /*
      AWAITED, because a tile shows a dash until its read has landed — the
      branch resolves after the first fetch and re-asks for the sole branch.
      A zero standing in for "not here yet" is the one thing a tile must not do.
    */
    expect(await within(summary).findByText("Rp 240 rb")).toBeInTheDocument();
  });

  /*
    BADGED "Segera", never blank and never a plausible-looking zero: a tile that
    invented a number would be indistinguishable from one that meant it.
  */
  it("keeps the mockup's three unbacked tiles on the row, disabled", async () => {
    renderWithAuth(<TodayScreen />);

    const summary = await screen.findByRole("region", { name: "Ringkasan hari ini" });

    for (const label of ["Okupansi hotel", "Masuk / keluar", "Perjalanan"]) {
      const tile = within(summary).getByText(label).closest("[aria-disabled]");
      expect(tile).not.toBeNull();
      expect(within(tile as HTMLElement).getByText("Segera")).toBeInTheDocument();
    }
  });

  /*
    BOTH COLUMNS STAND ON THE BOARD AND SAY "Segera" — on request (16 September
    2026). Not faked with rows, and not left off: somebody reading this screen
    every morning should see where penitipan and antar-jemput will appear.
  */
  it("keeps Hotel and Antar-Jemput on the board, disabled", async () => {
    renderWithAuth(<TodayScreen />);

    for (const name of ["Hotel — segera", "Antar-Jemput — segera"]) {
      const column = await screen.findByRole("region", { name });
      expect(within(column).getByText("Segera")).toBeInTheDocument();
    }
  });

  /* A tenant that really books a line called Hotel gets the live one instead. */
  it("drops the disabled Hotel column when the shop actually books one", async () => {
    bookings.list.mockResolvedValue(
      page([
        booking({
          _id: "bk-2",
          petName: "Bruno",
          service: service({ serviceType: "Hotel", name: "Menginap" }),
        }),
      ]),
    );

    renderWithAuth(<TodayScreen />);

    expect(await screen.findByRole("region", { name: "Hotel" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Hotel — segera" })).toBeNull();
    /* The other one is still waiting on its records. */
    expect(
      screen.getByRole("region", { name: "Antar-Jemput — segera" }),
    ).toBeInTheDocument();
  });

  /* The legs a booking asked for live in its panel while the column waits. */
  it("says which journey a booking asked for, in the panel", async () => {
    bookings.list.mockResolvedValue(
      page([booking({ pickupRequested: true, tripAddress: "Jl. Citraland C2" })]),
    );

    renderWithAuth(<TodayScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: /bella · basic grooming/i }),
    );

    const panel = screen.getByRole("region", { name: /rincian bella/i });
    expect(within(panel).getByText("Dijemput")).toBeInTheDocument();
    expect(within(panel).getByText("Jl. Citraland C2")).toBeInTheDocument();
  });

  /*
    THE CARD ANSWERS "APA YANG DIKERJAKAN, SIAPA YANG PEGANG" — the name, the
    work under it, then status and whoever is on it. Not the customer: a day
    sheet is not a list of owners.
  */
  it("shows the service under the animal, then status and groomer", async () => {
    bookings.list.mockResolvedValue(
      page([
        booking({
          service: service({
            sessions: [
              {
                sessionId: "s1",
                sessionName: "Mandi",
                status: "pending",
                groomers: [{ _id: "u-sinta", name: "Sinta" }],
              },
            ],
          } as Partial<BookingMainService>),
        }),
      ]),
    );

    renderWithAuth(<TodayScreen />);

    const card = await screen.findByRole("button", {
      name: /bella · basic grooming/i,
    });

    expect(within(card).getByText("Basic Grooming")).toBeInTheDocument();
    expect(within(card).getByText("Confirmed")).toBeInTheDocument();
    expect(within(card).getByText("Sinta")).toBeInTheDocument();
    expect(within(card).getByText("90 mnt")).toBeInTheDocument();
    /* The owner's name belongs to the panel, not to every card. */
    expect(within(card).queryByText("Bu Rina")).toBeNull();
  });

  it("says so on the card when nobody is on the work yet", async () => {
    renderWithAuth(<TodayScreen />);

    const card = await screen.findByRole("button", {
      name: /bella · basic grooming/i,
    });

    expect(within(card).getByText("Belum ditentukan")).toBeInTheDocument();
  });

  it("opens one booking in the side panel, with the way into it", async () => {
    renderWithAuth(<TodayScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: /bella · basic grooming/i }),
    );

    const panel = screen.getByRole("region", { name: /rincian bella/i });
    expect(within(panel).getByText("BK-260911-001")).toBeInTheDocument();
    expect(within(panel).getByText("Belum ditentukan")).toBeInTheDocument();
    expect(
      within(panel).getByRole("link", { name: "Buka detail" }),
    ).toHaveAttribute("href", "/dashboard/booking/bk-1");
  });

  it("says what an empty day is, and still shows where the rest will go", async () => {
    bookings.list.mockResolvedValue(page([]));

    renderWithAuth(<TodayScreen />);

    expect(
      await screen.findByText(/tidak ada kegiatan pada tanggal ini/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Antar-Jemput — segera" }),
    ).toBeInTheDocument();
  });

  /*
    THE RANGE FOLLOWS THE VIEW. A week is one read of seven days, so stepping
    between days inside it asks the server nothing more.
  */
  it("reads a week when the weekly view is picked", async () => {
    renderWithAuth(<TodayScreen />);
    await screen.findByRole("region", { name: "Grooming" });

    await userEvent.click(screen.getByRole("button", { name: "Mingguan" }));

    await waitFor(() => {
      const last = bookings.list.mock.calls.at(-1)?.[0];
      expect(last?.scheduledFrom).not.toBe(last?.scheduledTo);
    });
  });

  it("opens the day somebody clicks in the monthly view", async () => {
    renderWithAuth(<TodayScreen />);
    await screen.findByRole("region", { name: "Grooming" });

    await userEvent.click(screen.getByRole("button", { name: "Bulanan" }));

    const label = new Date().toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    await userEvent.click(
      await screen.findByRole("button", { name: `${label} · 1 booking` }),
    );

    expect(await screen.findByRole("region", { name: "Grooming" })).toBeInTheDocument();
  });

  it("narrows to one line of business from the filter panel", async () => {
    bookings.list.mockResolvedValue(
      page([
        booking(),
        booking({
          _id: "bk-2",
          petName: "Bruno",
          service: service({ serviceType: "Hotel", name: "Menginap" }),
        }),
      ]),
    );

    renderWithAuth(<TodayScreen />);
    await screen.findByRole("region", { name: "Hotel" });

    await userEvent.click(screen.getByRole("button", { name: "Filter" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("checkbox", { name: "Hotel" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Terapkan" }));

    expect(screen.queryByRole("region", { name: "Grooming" })).toBeNull();
    expect(screen.getByRole("region", { name: "Hotel" })).toBeInTheDocument();
    /* The button says how much it is hiding — §8's collapsed-bar rule. */
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  it("offers the two forms behind Booking baru", async () => {
    renderWithAuth(<TodayScreen />);
    await screen.findByRole("region", { name: "Grooming" });

    await userEvent.click(screen.getByRole("button", { name: /booking baru/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("link", { name: /grooming/i })).toHaveAttribute(
      "href",
      "/dashboard/layanan/grooming/new",
    );
    expect(
      within(dialog).getByRole("link", { name: /layanan lain/i }),
    ).toHaveAttribute("href", "/dashboard/booking/new");
  });
});
