import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomerBookingScreen, GroomerScreen } from "@/features/groomer";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { groomerService } from "@/services/groomer.service";
import type {
  GroomerBooking,
  GroomerBookingDetail,
  GroomerJobs,
  GroomerSession,
} from "@/types/groomer";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/groomer.service");
jest.mock("@/services/booking.service");
jest.mock("@/services/media.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mockPush = jest.fn();
let mockSearch = new URLSearchParams();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => mockPush(href) }),
  usePathname: () => "/groomer",
  useParams: () => ({ id: "b1" }),
  useSearchParams: () => mockSearch,
}));

const groomer = groomerService as jest.Mocked<typeof groomerService>;
const bookings = bookingService as jest.Mocked<typeof bookingService>;

const NOW = new Date("2026-09-03T02:41:00.000Z"); // 09.41 in Jakarta

const pet = (name: string, extra = {}) => ({
  name,
  species: "Anjing",
  breed: "Shih Tzu",
  size: "Medium",
  furType: "Long Hair",
  weightKg: 6.5,
  tags: ["trauma dryer"],
  handling: "Dryer pelan dan jauh.",
  ...extra,
});

const session = (id: string, overrides: Partial<GroomerSession> = {}): GroomerSession => ({
  sessionId: id,
  sessionName: "Mandi & Basic Wash",
  estimateMin: 45,
  status: "pending",
  mine: true,
  open: false,
  others: [],
  startedAt: null,
  finishedAt: null,
  canStart: true,
  startBlock: null,
  afterCount: 0,
  ...overrides,
});

const booking = (id: string, overrides: Partial<GroomerBooking> = {}): GroomerBooking => ({
  bookingId: id,
  scheduledAt: "2026-09-03T04:00:00.000Z",
  status: "in_progress",
  serviceName: "Basic Grooming",
  addons: [],
  canMarkArrived: false,
  pet: pet("Coco"),
  sessions: [session("s1")],
  ...overrides,
});

const week = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"].map(
  (date) => ({ date, mine: date === "2026-09-03" ? 1 : 0, isToday: date === "2026-09-03" }),
);

const day = (overrides: Partial<GroomerJobs> = {}): GroomerJobs => ({
  date: "2026-09-03",
  settings: { showOwnCommission: false, allowOpenJobClaim: true },
  week,
  load: { plannedMin: 90, capacityMin: 420, offReason: null },
  saya: [booking("b1")],
  open: [
    booking("b2", {
      pet: pet("Oyen", { tags: [], handling: null }),
      sessions: [session("s2", { mine: false, open: true, sessionName: "Blow Dry & Combing" })],
    }),
  ],
  lain: [
    booking("b3", {
      pet: pet("Bruno", { tags: [], handling: null }),
      sessions: [session("s3", { mine: false, others: ["Bayu"], status: "in_progress" })],
    }),
  ],
  selesai: [],
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
  mockSearch = new URLSearchParams();
  jest.useFakeTimers({ advanceTimers: true }).setSystemTime(NOW);
  groomer.jobs.mockResolvedValue(day());
});

afterEach(() => jest.useRealTimers());

const render = () => renderWithAuth(<GroomerScreen />);
const setup = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

/** Cards start folded; open every one on screen, as a groomer would by tapping. */
async function unfold(user: ReturnType<typeof setup>) {
  for (const toggle of await screen.findAllByRole("button", { name: /Lihat sesi/ })) {
    await user.click(toggle);
  }
}

describe("GroomerScreen — the list", () => {
  describe("folding a card", () => {
    const threeSessions = () =>
      booking("b1", {
        sessions: [
          session("s1", { status: "done", afterCount: 1 }),
          session("s1b", { sessionName: "Blow Dry" }),
          session("s1c", { sessionName: "Potong Kuku", mine: false, open: true }),
        ],
      });

    it("starts folded, with the state in one line instead of every row", async () => {
      groomer.jobs.mockResolvedValue(day({ saya: [threeSessions()] }));
      render();

      const toggle = await screen.findByRole("button", { name: /Lihat sesi \(3\)/ });

      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(within(toggle).getByText("1/3 selesai")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Mulai/ })).not.toBeInTheDocument();
    });

    it("opens and folds again", async () => {
      groomer.jobs.mockResolvedValue(day({ saya: [threeSessions()], lain: [] }));
      const user = setup();
      render();

      await user.click(await screen.findByRole("button", { name: /Lihat sesi/ }));

      expect(screen.getByRole("button", { name: /Sembunyikan sesi/ })).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("button", { name: /Mulai/ })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Sembunyikan sesi/ }));

      expect(screen.queryByRole("button", { name: /Mulai/ })).not.toBeInTheDocument();
    });

    it("opens by itself when a session of mine is running — its stopwatch must not hide", async () => {
      groomer.jobs.mockResolvedValue(
        day({
          saya: [
            booking("b1", {
              sessions: [session("s1", { status: "in_progress", startedAt: "2026-09-03T02:29:00.000Z", afterCount: 1 })],
            }),
          ],
        }),
      );
      render();

      expect(await screen.findByRole("button", { name: /Sembunyikan sesi/ })).toBeInTheDocument();
      expect(screen.getByText("12:00")).toBeInTheDocument();
    });

    it("keeps 'Hewan sudah datang' on the folded card, where the dog arrives", async () => {
      groomer.jobs.mockResolvedValue(
        day({ saya: [booking("b1", { status: "confirmed", canMarkArrived: true })], lain: [] }),
      );
      render();

      expect(await screen.findByRole("button", { name: /Hewan sudah datang/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Lihat sesi/ })).toHaveAttribute("aria-expanded", "false");
    });

    it("says on a folded Open Job card how many sessions have nobody", async () => {
      const user = setup();
      render();

      await user.click(await screen.findByRole("tab", { name: /Open Job/ }));

      expect(await screen.findByText("1 belum ada groomer")).toBeInTheDocument();
    });
  });

  it("makes one card of a booking, with its sessions as rows", async () => {
    groomer.jobs.mockResolvedValue(
      day({
        saya: [
          booking("b1", {
            sessions: [
              session("s1"),
              session("s1b", { sessionName: "Blow Dry", mine: false, others: ["Rina"] }),
            ],
          }),
        ],
      }),
    );
    render();

    const headings = await screen.findAllByRole("heading", { name: "Coco" });
    expect(headings).toHaveLength(1);

    const card = headings[0].closest("li")!;
    expect(within(card).getByText("Mandi & Basic Wash")).toBeInTheDocument();
    expect(within(card).getByText("Blow Dry")).toBeInTheDocument();
    expect(within(card).getByText(/Dipegang Rina/)).toBeInTheDocument();
  });

  it("says who a session is shared with", async () => {
    groomer.jobs.mockResolvedValue(
      day({ saya: [booking("b1", { sessions: [session("s1", { others: ["Rina"] })] })] }),
    );
    render();

    expect(await screen.findByText(/Bersama Rina/)).toBeInTheDocument();
  });

  it("draws a booking held by others with no control", async () => {
    const user = setup();
    render();
    await unfold(user);
    const card = (await screen.findByRole("heading", { name: "Bruno" })).closest("li")!;

    expect(within(card).queryByRole("button", { name: /Mulai|Selesaikan|Ambil|datang/ })).not.toBeInTheDocument();
    expect(within(card).getByText(/Dipegang Bayu/)).toBeInTheDocument();
  });

  it("never draws an owner or a price — they are not in the data", async () => {
    render();
    await screen.findByRole("heading", { name: "Coco" });

    expect(screen.queryByText(/Rp\s?\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pemilik:/i)).not.toBeInTheDocument();
  });

  it("starts a session and reloads the day", async () => {
    bookings.advanceSessionWork.mockResolvedValue({} as never);
    const user = setup();
    render();

    await unfold(user);
    await user.click(await screen.findByRole("button", { name: /Mulai/ }));

    expect(bookings.advanceSessionWork).toHaveBeenCalledWith("b1", "s1", "in_progress");
    await waitFor(() => expect(groomer.jobs).toHaveBeenCalledTimes(2));
    expect(swalToast).toHaveBeenCalledWith("Coco dimulai");
  });

  it("marks a confirmed dog as arrived", async () => {
    groomer.jobs.mockResolvedValue(
      day({
        saya: [
          booking("b1", {
            status: "confirmed",
            canMarkArrived: true,
            sessions: [session("s1", { canStart: false, startBlock: "Tandai hewan sudah datang dulu" })],
          }),
        ],
      }),
    );
    bookings.changeStatus.mockResolvedValue({} as never);
    const user = setup();
    render();

    await unfold(user);

    expect(await screen.findByRole("button", { name: /Mulai/ })).toBeDisabled();
    expect(screen.getByText("Tandai hewan sudah datang dulu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Hewan sudah datang/ }));

    expect(bookings.changeStatus).toHaveBeenCalledWith("b1", "arrived");
    expect(swalToast).toHaveBeenCalledWith("Coco ditandai sudah datang");
  });

  it("offers 'sudah datang' only when the server says it is allowed", async () => {
    render();
    await screen.findByRole("heading", { name: "Coco" });

    expect(screen.queryByRole("button", { name: /Hewan sudah datang/ })).not.toBeInTheDocument();
  });

  it("sends a finish with no after photo to the detail, instead of finishing", async () => {
    groomer.jobs.mockResolvedValue(
      day({
        saya: [
          booking("b1", {
            sessions: [session("s1", { status: "in_progress", startedAt: "2026-09-03T02:12:00.000Z" })],
          }),
        ],
      }),
    );
    const user = setup();
    render();

    await user.click(await screen.findByRole("button", { name: /Selesaikan/ }));

    expect(bookings.advanceSessionWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/groomer/booking/b1?foto=after&sesi=s1");
  });

  it("finishes a session that has its after photo", async () => {
    groomer.jobs.mockResolvedValue(
      day({
        saya: [
          booking("b1", {
            sessions: [
              session("s1", { status: "in_progress", startedAt: "2026-09-03T02:12:00.000Z", afterCount: 1 }),
            ],
          }),
        ],
      }),
    );
    bookings.advanceSessionWork.mockResolvedValue({} as never);
    const user = setup();
    render();

    await user.click(await screen.findByRole("button", { name: /Selesaikan/ }));

    expect(bookings.advanceSessionWork).toHaveBeenCalledWith("b1", "s1", "done");
  });

  it("shows the stopwatch for a running session", async () => {
    groomer.jobs.mockResolvedValue(
      day({
        saya: [
          booking("b1", {
            sessions: [session("s1", { status: "in_progress", startedAt: "2026-09-03T02:29:00.000Z", afterCount: 1 })],
          }),
        ],
      }),
    );
    render();

    expect(await screen.findByText("12:00")).toBeInTheDocument();
  });

  it("links the notes and photos to the detail screen", async () => {
    const user = setup();
    render();
    await unfold(user);

    const link = await screen.findByRole("link", { name: /Catatan & foto/ });

    expect(link).toHaveAttribute("href", "/groomer/booking/b1");
  });

  describe("the commission summary", () => {
    const commission = (amount: string | null) =>
      groomer.commission.mockResolvedValue({
        period: "2026-09",
        earned: amount
          ? { groomerUserId: "g", groomerName: "Budi", rows: 12, reversedRows: 0, amount }
          : null,
        total: amount ?? "0",
        outstanding: { groomerUserId: "g", branchId: "br", periods: [], amount: "0", recordCount: 0 },
      });

    it("shows the month on Selesai when the shop allows it — and no figure per job", async () => {
      groomer.jobs.mockResolvedValue(
        day({ settings: { showOwnCommission: true, allowOpenJobClaim: true } }),
      );
      commission("300000.0000");
      const user = setup();
      render();

      await user.click(await screen.findByRole("tab", { name: /Selesai/ }));

      expect(await screen.findByText("Rp 300.000")).toBeInTheDocument();
      expect(screen.getByText(/dari 12 layanan/)).toBeInTheDocument();
    });

    it("is not asked for, not even fetched, while the shop keeps it hidden", async () => {
      const user = setup();
      render();

      await user.click(await screen.findByRole("tab", { name: /Selesai/ }));

      expect(screen.queryByLabelText("Komisi bulan ini")).not.toBeInTheDocument();
      expect(groomer.commission).not.toHaveBeenCalled();
    });

    it("says so in a line when the read fails, and leaves the list alone", async () => {
      groomer.jobs.mockResolvedValue(
        day({ settings: { showOwnCommission: true, allowOpenJobClaim: true } }),
      );
      groomer.commission.mockRejectedValue(new ApiError("Forbidden", 403));
      const user = setup();
      render();

      await user.click(await screen.findByRole("tab", { name: /Selesai/ }));

      expect(await screen.findByText("Komisi tidak bisa dimuat sekarang.")).toBeInTheDocument();
      expect(screen.getByText("Belum ada yang selesai.")).toBeInTheDocument();
    });
  });

  it("takes an open session", async () => {
    bookings.claimSession.mockResolvedValue({} as never);
    const user = setup();
    render();

    await user.click(await screen.findByRole("tab", { name: /Open Job/ }));
    await unfold(user);
    await user.click(screen.getByRole("button", { name: "Ambil sesi ini" }));

    expect(bookings.claimSession).toHaveBeenCalledWith("b2", "s2");
  });

  it("shows the server's own words when somebody got there first, then reloads", async () => {
    bookings.claimSession.mockRejectedValue(
      new ApiError("Job ini sudah dipegang groomer lain", 409),
    );
    const user = setup();
    render();

    await user.click(await screen.findByRole("tab", { name: /Open Job/ }));
    await unfold(user);
    await user.click(screen.getByRole("button", { name: "Ambil sesi ini" }));

    await waitFor(() =>
      expect(swalToast).toHaveBeenCalledWith("Job ini sudah dipegang groomer lain", "error", 5000),
    );
    expect(groomer.jobs).toHaveBeenCalledTimes(2);
  });

  it("has no Open Job tab while the manager has claiming off", async () => {
    groomer.jobs.mockResolvedValue(
      day({ settings: { showOwnCommission: false, allowOpenJobClaim: false }, open: [] }),
    );
    render();

    await screen.findByRole("heading", { name: "Coco" });

    expect(screen.queryByRole("tab", { name: /Open Job/ })).not.toBeInTheDocument();
  });

  it("asks for another day when its tab is pressed", async () => {
    const user = setup();
    render();
    await screen.findByRole("heading", { name: "Coco" });

    await user.click(screen.getByRole("tab", { name: /Jum/ }));

    await waitFor(() => expect(groomer.jobs).toHaveBeenLastCalledWith("2026-09-04"));
  });

  it("says so when there is nothing today", async () => {
    groomer.jobs.mockResolvedValue(day({ saya: [], lain: [], open: [] }));
    render();

    expect(await screen.findByText("Belum ada tugas di hari ini.")).toBeInTheDocument();
  });

  it("offers a retry when the day cannot be loaded", async () => {
    groomer.jobs.mockRejectedValueOnce(new ApiError("Server error", 500));
    const user = setup();
    render();

    await user.click(await screen.findByRole("button", { name: /Muat ulang/ }));

    expect(await screen.findByRole("heading", { name: "Coco" })).toBeInTheDocument();
  });
});

describe("GroomerBookingScreen — the detail", () => {
  const detail = (overrides: Partial<GroomerBooking> = {}): GroomerBookingDetail => ({
    settings: { showOwnCommission: false, allowOpenJobClaim: true },
    booking: booking("b1", {
      sessions: [
        session("s1", {
          status: "in_progress",
          startedAt: "2026-09-03T02:12:00.000Z",
          notesSession: "kusut di perut",
          notesInternalSession: null,
          media: [],
        }),
        session("s2", { sessionName: "Blow Dry", mine: false, others: ["Rina"] }),
      ],
      ...overrides,
    }),
  });

  beforeEach(() => {
    groomer.booking.mockResolvedValue(detail());
  });

  const renderDetail = () => renderWithAuth(<GroomerBookingScreen />);

  it("shows every session of the booking, and a way back", async () => {
    renderDetail();

    expect(await screen.findByText("Mandi & Basic Wash")).toBeInTheDocument();
    expect(screen.getByText("Blow Dry")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Kembali/ })).toHaveAttribute("href", "/groomer");
    expect(groomer.booking).toHaveBeenCalledWith("b1");
  });

  it("opens the sheet with its reason when sent here to take the after photo", async () => {
    mockSearch = new URLSearchParams("foto=after&sesi=s1");
    renderDetail();

    expect(await screen.findByText(/Foto after belum ada/)).toBeInTheDocument();
  });

  it("opens the notes of a session of mine, with what was written", async () => {
    const user = setup();
    renderDetail();

    await user.click(await screen.findByRole("button", { name: /catatan & foto/i }));

    expect(await screen.findByDisplayValue("kusut di perut")).toBeInTheDocument();
  });

  it("gives a colleague's session no control", async () => {
    renderDetail();
    const row = (await screen.findByText("Blow Dry")).closest("li")!;

    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  });

  it("says plainly when the booking is not the groomer's", async () => {
    groomer.booking.mockRejectedValue(new ApiError("Booking tidak ditemukan", 404));
    renderDetail();

    expect(await screen.findByText("Booking ini tidak ada di daftarmu.")).toBeInTheDocument();
  });

  it("finishes from the detail only once there is an after photo", async () => {
    bookings.advanceSessionWork.mockResolvedValue({} as never);
    groomer.booking.mockResolvedValue(
      detail({
        sessions: [
          session("s1", { status: "in_progress", startedAt: "2026-09-03T02:12:00.000Z", afterCount: 1, media: [] }),
        ],
      }),
    );
    const user = setup();
    renderDetail();

    await user.click(await screen.findByRole("button", { name: /Selesaikan/ }));

    expect(bookings.advanceSessionWork).toHaveBeenCalledWith("b1", "s1", "done");
  });
});
