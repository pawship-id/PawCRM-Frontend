import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingDetailScreen } from "@/features/booking";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { petOptionService } from "@/services/petOption.service";
import type { Booking, BookingSession } from "@/types/api";

import { primePetOptions } from "./helpers/petOptions";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/petOption.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/branch.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const pets = petService as jest.Mocked<typeof petService>;
const customers = customerService as jest.Mocked<typeof customerService>;
const branches = branchService as jest.Mocked<typeof branchService>;

/** One turn at the service. `mandi` by default, with one person on it. */
const session = (over: Partial<BookingSession> = {}): BookingSession => ({
  sessionId: "se-1",
  sessionName: "mandi",
  groomers: [{ _id: "user-1", name: "Mbak Sari", offReason: null }],
  status: "pending",
  startedAt: null,
  finishedAt: null,
  notesSession: null,
  notesInternalSession: null,
  media: [],
  commissionWeight: null,
  ...over,
});

type Overrides = Omit<Partial<Booking>, "service"> & {
  service?: Partial<Booking["service"]>;
};

/**
 * ONE BOOKING — Mochi, one Full Grooming, one turn — in the shape `GET
 * /bookings/:id` sends. `in_progress` by default, because a turn can only be
 * worked once the booking is on the table, and most cases below press Mulai.
 */
const booking = ({ service, ...over }: Overrides = {}): Booking =>
  ({
    _id: "bk-1",
    tenantId: "t1",
    branchId: "branch-1",
    bookingNumber: "BK-260903-001",
    groupId: "grp-1",
    customerId: "cust-1",
    customerName: "Bu Lisa",
    petId: "pet-1",
    petName: "Mochi",
    petSize: "small",
    status: "in_progress",
    statusHistory: [],
    nextStatuses: [],
    cancelReason: null,
    scheduledAt: "2026-09-03T02:00:00.000Z",
    origin: "booking",
    posTransactionId: null,
    location: "in_store",
    pickupRequested: false,
    deliveryRequested: false,
    tripAddress: null,
    service: {
      serviceId: "svc-1",
      name: "Grooming Full Service",
      serviceType: "Grooming",
      price: "150000.0000",
      durationMin: 90,
      status: "pending",
      statusHistory: [],
      startedAt: null,
      finishedAt: null,
      sessions: [session()],
      addons: [],
      ...service,
    },
    groomerName: "Mbak Sari",
    belongings: [],
    internalNotes: null,
    customerNotes: null,
    notes: null,
    media: [],
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    billingState: "unbilled",
    totalAmount: null,
    totalDurationMin: null,
    createdBy: "user-9",
    createdByName: "Fitria",
    createdByRoleName: "Staff",
    createdAt: "2026-08-30T04:52:00.000Z",
    updatedAt: "2026-08-30T04:52:00.000Z",
    group: [],
    ...over,
  }) as Booking;

const PARFUM = {
  itemId: "ad-1",
  serviceId: "svc-addon",
  name: "Parfum",
  price: "20000.0000",
  durationMin: 10,
};

const LADDER_ONLY = [
  { feature: "bookings", actions: ["read", "advanceStatus"] },
];

beforeEach(() => {
  jest.clearAllMocks();
  /* The words for species, size and coat — tenant data, read via usePetOptions. */
  primePetOptions(petOptionService.list);
  bookings.getById.mockResolvedValue(booking());
  bookings.advanceSessionWork.mockResolvedValue(booking());
  bookings.setSessionCrew.mockResolvedValue(booking());
  bookings.changeStatus.mockResolvedValue(booking());
  bookings.checkBelonging.mockResolvedValue(booking());
  /* Who may be booked that day — read by the crew editor, best effort. */
  bookings.availability.mockResolvedValue([
    { _id: "user-1", fullName: "Mbak Sari", offReason: null },
  ] as never);
  customers.getById.mockResolvedValue({
    _id: "cust-1",
    name: "Bu Lisa",
    phone: "0812-3456-7890",
  } as never);
  branches.getById.mockResolvedValue({
    _id: "branch-1",
    name: "Cibubur",
  } as never);
  pets.getById.mockResolvedValue({
    _id: "pet-1",
    name: "Mochi",
    preferences: { text: null, tags: [] },
    medical: {
      allergies: [],
      conditions: [],
      medications: [],
      vaccinations: [],
      vet: { clinicName: null, phone: null },
    },
  } as never);
});

const show = (options = {}) =>
  renderWithAuth(<BookingDetailScreen id="bk-1" />, options);

/** Opens a folded turn by its name. The row being worked on opens itself. */
async function openSession(name = /^mandi/i) {
  await userEvent.click(await screen.findByRole("button", { name }));
}

/**
 * ONE BOOKING, WHOLE — `/dashboard/booking/:id`.
 *
 * A booking is one animal and one main service, so the overview and the work
 * sheet that used to live under `/hewan/:petId` are one page now.
 */
describe("BookingDetailScreen — the header", () => {
  it("has exactly one h1, and it is the booking number", async () => {
    show();

    const headings = await screen.findAllByRole("heading", { level: 1 });

    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("BK-260903-001");
  });

  it("says a draft has no number rather than showing a blank", async () => {
    bookings.getById.mockResolvedValue(
      booking({ bookingNumber: null, status: "draft" }),
    );

    show();

    expect(
      await screen.findByRole("heading", { name: /booking \(draf\)/i }),
    ).toBeInTheDocument();
  });

  it("names the animal, the service, and whose it is with their number", async () => {
    show();

    await screen.findByText("BK-260903-001");
    expect(screen.getAllByText(/Mochi/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Grooming Full Service/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bu Lisa/).length).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText(/0812-3456-7890/)).length,
    ).toBeGreaterThan(0);
  });

  it("shows the booking's status and billing as words", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        status: "completed",
        billingState: "billed",
        pulledToInvoiceAt: "2026-09-03T06:00:00.000Z",
      }),
    );

    show();

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Sudah ditagih")).toBeInTheDocument();
  });

  it("says a basket holds it, rather than that it was paid, until the till settles", async () => {
    bookings.getById.mockResolvedValue(
      booking({ pulledToCartAt: "2026-09-03T04:00:00.000Z" }),
    );

    show();

    expect(await screen.findByText(/ada di keranjang/i)).toBeInTheDocument();
  });

  it("says who wrote the booking down, with their role", async () => {
    show();

    expect(
      await screen.findByText(/dibuat .* Fitria \(staff\)/i),
    ).toBeInTheDocument();
  });

  it("offers Ubah, pointing at the edit route for this booking", async () => {
    show();

    const edit = await screen.findByRole("link", { name: /^ubah$/i });
    expect(edit).toHaveAttribute("href", "/dashboard/booking/bk-1/edit");
  });

  it.each(["completed", "return_to_pawrents", "cancelled"] as const)(
    "offers no Ubah on a %s booking",
    async (status) => {
      /* The server refuses a PATCH once the work is completed; a cancelled
         booking has nowhere left to go. */
      bookings.getById.mockResolvedValue(booking({ status }));

      show();

      await screen.findByText("BK-260903-001");
      expect(
        screen.queryByRole("link", { name: /^ubah$/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /edit layanan/i }),
      ).not.toBeInTheDocument();
    },
  );

  it("shows a groomer the status moves but not the edit button", async () => {
    /* `advanceStatus` without `update`: a groomer checks a dog in and marks it
       done, and has no business repricing it. */
    bookings.getById.mockResolvedValue(booking({ status: "confirmed" }));

    show({ isSuperAdmin: false, permissions: LADDER_ONLY });

    await screen.findByText("BK-260903-001");
    expect(
      screen.queryByRole("link", { name: /^ubah$/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mark arrived →/i }),
    ).toBeInTheDocument();
  });

  it("shows why a cancelled booking was called off", async () => {
    bookings.getById.mockResolvedValue(
      booking({ status: "cancelled", cancelReason: "Pelanggan batal" }),
    );

    show();

    expect(await screen.findByText(/pelanggan batal/i)).toBeInTheDocument();
  });

  it("links Cetak at the printable pet card", async () => {
    show();

    expect(await screen.findByRole("link", { name: /cetak/i })).toHaveAttribute(
      "href",
      "/dashboard/master/pets/pet-1/print",
    );
  });

  it("builds a working wa.me link from a locally-formatted number", async () => {
    show();

    expect(
      await screen.findByRole("link", { name: /whatsapp/i }),
    ).toHaveAttribute("href", "https://wa.me/6281234567890");
  });

  it("offers no WhatsApp button when the customer has no number", async () => {
    customers.getById.mockResolvedValue({
      _id: "cust-1",
      name: "Bu Lisa",
      phone: null,
    } as never);

    show();

    await screen.findByText("BK-260903-001");
    await waitFor(() => expect(customers.getById).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: /whatsapp/i }),
    ).not.toBeInTheDocument();
  });

  it("says plainly when the booking is not there", async () => {
    bookings.getById.mockRejectedValue(new ApiError("Not found", 404));

    show();

    expect(
      await screen.findByText(/tidak ada, atau bukan milik toko/i),
    ).toBeInTheDocument();
  });

  it("still shows the work when the pet, customer and branch cannot be read", async () => {
    pets.getById.mockRejectedValue(new Error("offline"));
    customers.getById.mockRejectedValue(new Error("offline"));
    branches.getById.mockRejectedValue(new Error("offline"));

    show();

    expect(
      await screen.findByText(/profil hewan tidak bisa dimuat/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^mandi/i })).toBeInTheDocument();
  });
});

describe("BookingDetailScreen — the status track", () => {
  it("has one segment per rung the booking walks, and none for draft", async () => {
    bookings.getById.mockResolvedValue(booking({ status: "in_progress" }));

    show();

    /* requested, confirmed, arrived, in_progress, completed, return_to_pawrents */
    expect(
      await screen.findByRole("img", { name: "4 dari 6 tahap: In Progress" }),
    ).toBeInTheDocument();
  });

  it("grows the track when a van was booked", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        status: "confirmed",
        pickupRequested: true,
        deliveryRequested: true,
      }),
    );

    show();

    expect(
      await screen.findByRole("img", { name: "2 dari 8 tahap: Confirmed" }),
    ).toBeInTheDocument();
  });

  it("names the last move and who made it under Status sejak", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        statusHistory: [
          {
            status: "in_progress",
            at: new Date("2026-09-03T10:15:00").toISOString(),
            by: "user-2",
            byName: "Rio",
            byRoleName: "Groomer",
            implied: false,
          },
        ],
      }),
    );

    show();

    /* Scoped to the block: the trail in the rail names the same move too. */
    const since = (await screen.findByText("Status sejak")).parentElement!;
    expect(within(since).getByText(/^10\.15 · Rio \(groomer\)$/)).toBeInTheDocument();
  });

  it("moving the booking updates the page from the answer, without re-reading it", async () => {
    bookings.getById.mockResolvedValue(booking({ status: "confirmed" }));
    bookings.changeStatus.mockResolvedValue(booking({ status: "arrived" }));

    show();

    await userEvent.click(
      await screen.findByRole("button", { name: /mark arrived →/i }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /^mark arrived$/i }),
    );

    /* ⚠️ THE BADGE MOVED — asserted first, because "no second fetch" is
       trivially true of a page that also did not update. */
    expect(await screen.findByText("Arrived")).toBeInTheDocument();
    expect(bookings.changeStatus).toHaveBeenCalledWith("bk-1", "arrived", null);
    expect(bookings.getById).toHaveBeenCalledTimes(1);
  });

  it("warns that something is unfinished before completing, and stops once it is done", async () => {
    show();

    expect(
      await screen.findByText(/layanan belum selesai/i),
    ).toBeInTheDocument();
  });

  it("says nothing is blocking once every turn is done", async () => {
    bookings.getById.mockResolvedValue(
      booking({ service: { sessions: [session({ status: "done" })] } }),
    );

    show();

    await screen.findByText("BK-260903-001");
    expect(screen.queryByText(/layanan belum selesai/i)).not.toBeInTheDocument();
  });
});

describe("BookingDetailScreen — the Kunjungan card", () => {
  it("shows the total the API sent", async () => {
    bookings.getById.mockResolvedValue(booking({ totalAmount: "274000.0000" }));

    show();

    expect(await screen.findByText("Rp 274.000")).toBeInTheDocument();
  });

  it("hangs the add-on off its service, and counts it when no total was computed", async () => {
    bookings.getById.mockResolvedValue(
      booking({ service: { addons: [PARFUM] } }),
    );

    show();

    expect(await screen.findByText(/\+ Parfum/)).toBeInTheDocument();
    // 150.000 + 20.000
    expect(screen.getByText(/Rp\s?170[.,]000/)).toBeInTheDocument();
  });

  it("says when the visit ends, not only when it starts", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        scheduledAt: new Date("2026-09-05T20:30:00").toISOString(),
        totalDurationMin: 121,
      }),
    );

    show();

    // 20.30 + 121 menit.
    expect(await screen.findByText(/20\.30 – 22\.31/)).toBeInTheDocument();
  });

  it("names the branch it was booked to", async () => {
    show();

    expect(await screen.findByText("Cibubur")).toBeInTheDocument();
  });

  it("spells out that there is no trip rather than leaving it blank", async () => {
    show();

    expect(await screen.findByText("Tidak ada")).toBeInTheDocument();
  });

  it("names the trip and where it goes when there is one", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        pickupRequested: true,
        deliveryRequested: true,
        tripAddress: "Jl. Kenanga 5",
      }),
    );

    show();

    expect(
      await screen.findByText("Jemput & antar pulang"),
    ).toBeInTheDocument();
    expect(screen.getByText("Jl. Kenanga 5")).toBeInTheDocument();
  });

  it("offers the way to correct the price, and keeps it from somebody who may not", async () => {
    const { unmount } = show();

    expect(
      await screen.findByRole("link", { name: /edit layanan/i }),
    ).toHaveAttribute("href", "/dashboard/booking/bk-1/edit");

    unmount();
    show({ isSuperAdmin: false, permissions: LADDER_ONLY });

    await screen.findByText("BK-260903-001");
    expect(
      screen.queryByRole("link", { name: /edit layanan/i }),
    ).not.toBeInTheDocument();
  });

  it("warns about a severe allergy from the animal's profile", async () => {
    pets.getById.mockResolvedValue({
      _id: "pet-1",
      name: "Mochi",
      preferences: { text: null, tags: [] },
      medical: {
        allergies: [{ name: "Sampo strawberry", severity: "severe", note: null }],
        conditions: [],
        medications: [],
        vaccinations: [],
        vet: { clinicName: null, phone: null },
      },
    } as never);

    show();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sampo strawberry",
    );
  });
});

describe("BookingDetailScreen — the turns", () => {
  it("keeps turns folded, and opens the one being worked on", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        service: {
          sessions: [
            session(),
            session({
              sessionId: "se-2",
              sessionName: "blow dry",
              status: "in_progress",
              startedAt: new Date().toISOString(),
            }),
          ],
        },
      }),
    );

    show();

    expect(
      await screen.findByRole("button", { name: /^mandi/i }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: /^blow dry/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("starts a turn through its session route, and the button becomes the one that finishes it", async () => {
    bookings.advanceSessionWork.mockResolvedValue(
      booking({
        service: {
          sessions: [
            session({
              status: "in_progress",
              startedAt: new Date().toISOString(),
            }),
          ],
        },
      }),
    );

    show();
    await openSession();

    await userEvent.click(screen.getByRole("button", { name: "Mulai" }));

    await waitFor(() =>
      expect(bookings.advanceSessionWork).toHaveBeenCalledWith(
        "bk-1",
        "se-1",
        "in_progress",
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Selesai" }),
    ).toBeInTheDocument();
  });

  it("offers no way to reopen finished work", async () => {
    bookings.getById.mockResolvedValue(
      booking({ service: { sessions: [session({ status: "done" })] } }),
    );

    show();
    await openSession();

    expect(
      screen.queryByRole("button", { name: /buka lagi/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^(mulai|selesai)$/i }),
    ).not.toBeInTheDocument();
  });

  it.each(["draft", "requested", "confirmed", "arrived"] as const)(
    "keeps Mulai disabled while the booking is %s, and says why",
    async (status) => {
      bookings.getById.mockResolvedValue(booking({ status }));

      show();
      await openSession();

      expect(screen.getByRole("button", { name: "Mulai" })).toBeDisabled();
      expect(
        screen.getByText(/sudah in progress/i),
      ).toBeInTheDocument();
    },
  );

  it("names the crew once the rung is no longer the blocker", async () => {
    bookings.getById.mockResolvedValue(
      booking({ service: { sessions: [session({ groomers: [] })] } }),
    );

    show();
    await openSession();

    expect(screen.getByText(/tentukan groomernya dulu/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mulai" }),
    ).not.toBeInTheDocument();
  });

  it("carries the leave warning, and says what to do about it", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        service: {
          sessions: [
            session({
              status: "in_progress",
              groomers: [
                { _id: "user-1", name: "Mbak Sari", offReason: "Libur setiap Kamis" },
              ],
            }),
          ],
        },
      }),
    );

    show();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/libur setiap kamis/i);
    expect(alert).toHaveTextContent(/ganti groomer atau hubungi pelanggan/i);
  });

  it("adds a turn by name only, without naming a service", async () => {
    show();

    await userEvent.click(
      await screen.findByRole("button", { name: /tambah sesi/i }),
    );
    await userEvent.type(
      screen.getByLabelText(/nama sesi baru/i),
      "blow dry",
    );
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    await waitFor(() =>
      expect(bookings.setSessionCrew).toHaveBeenCalledWith("bk-1", {
        sessionName: "blow dry",
      }),
    );
  });

  it.each(["completed", "return_to_pawrents"] as const)(
    "offers no new turn once the booking is %s",
    async (status) => {
      bookings.getById.mockResolvedValue(booking({ status }));

      show();

      await screen.findByText("BK-260903-001");
      expect(
        screen.queryByRole("button", { name: /tambah sesi/i }),
      ).not.toBeInTheDocument();
    },
  );
});

describe("BookingDetailScreen — the rail and the cards beside the work", () => {
  it("carries the booking's two notes, editable", async () => {
    bookings.getById.mockResolvedValue(
      booking({ internalNotes: "Takut hairdryer" }),
    );

    show();

    expect(
      await screen.findByDisplayValue("Takut hairdryer"),
    ).toBeInTheDocument();
  });

  it("carries the titipan list, and ticks a thing back out from here", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        belongings: [
          {
            _id: "bel-1",
            name: "Carrier biru",
            checkedInAt: "2026-09-03T02:00:00.000Z",
            checkedOutAt: null,
            checkedInBy: null,
            checkedOutBy: null,
          },
        ],
      }),
    );

    show();

    expect(await screen.findByText("1 belum kembali")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/carrier biru keluar/i));

    await waitFor(() =>
      expect(bookings.checkBelonging).toHaveBeenCalledWith("bk-1", "bel-1", {
        checkedOut: true,
      }),
    );
  });

  it("lists the other bookings of the same visit, each linking to its own page", async () => {
    bookings.getById.mockResolvedValue(
      booking({
        group: [
          {
            _id: "bk-2",
            bookingNumber: "BK-260903-002",
            petId: "pet-2",
            petName: "Coco",
            serviceName: "Potong Kuku",
            status: "confirmed",
            scheduledAt: "2026-09-03T02:00:00.000Z",
            pickupRequested: false,
            deliveryRequested: false,
          },
          {
            _id: "bk-3",
            bookingNumber: null,
            petId: "pet-1",
            petName: "Mochi",
            serviceName: "Penitipan",
            status: "draft",
            scheduledAt: "2026-09-03T02:00:00.000Z",
            pickupRequested: false,
            deliveryRequested: false,
          },
        ],
      }),
    );

    show();

    const card = (await screen.findByText("Satu kunjungan")).closest(
      "section, div[class*='rounded']",
    ) as HTMLElement;

    expect(screen.getByText("2 booking lain")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /coco/i })).toHaveAttribute(
      "href",
      "/dashboard/booking/bk-2",
    );
    /* The same animal with a second service is a sibling too. */
    expect(
      within(card).getByRole("link", { name: /penitipan/i }),
    ).toHaveAttribute("href", "/dashboard/booking/bk-3");
    expect(within(card).getByText(/Potong Kuku · BK-260903-002/)).toBeInTheDocument();
  });

  it.each([
    ["an empty group", []],
    ["no group at all", undefined],
  ])("leaves the Satu kunjungan card out for %s", async (_label, group) => {
    bookings.getById.mockResolvedValue(booking({ group }));

    show();

    await screen.findByText("BK-260903-001");
    expect(screen.queryByText("Satu kunjungan")).not.toBeInTheDocument();
  });

  it("points at the commission report rather than showing the money", async () => {
    show();

    expect(
      await screen.findByRole("link", { name: /laporan › komisi/i }),
    ).toHaveAttribute("href", "/dashboard/reports/commissions");
  });
});
