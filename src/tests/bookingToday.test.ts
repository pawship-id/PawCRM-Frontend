import {
  columnsOn,
  groupsOf,
  matchesTodayFilters,
  mixOn,
  rowsOn,
  summariseTodayDay,
  toTodayRows,
  tripsOn,
  LINE_UNKNOWN,
} from "@/features/booking/today";
import { addMonths, monthGrid, startOfWeek, weekTitleOf } from "@/features/booking/day";
import type { Booking, BookingMainService } from "@/types/api";

function service(over: Partial<BookingMainService> = {}): BookingMainService {
  return {
    serviceId: "svc-groom",
    name: "Basic Grooming",
    serviceType: "Grooming",
    price: "120000.0000",
    durationMin: 60,
    status: "pending",
    statusHistory: [],
    startedAt: null,
    finishedAt: null,
    sessions: [],
    addons: [],
    ...over,
  };
}

/* The times are LOCAL on purpose — the board's axis is the shop's clock. */
function booking(over: Partial<Booking> = {}): Booking {
  return {
    _id: "bk-1",
    bookingNumber: "BK-260911-001",
    customerName: "Bu Rina",
    petId: "pet-1",
    petName: "Bella",
    status: "confirmed",
    statusHistory: [],
    nextStatuses: [],
    scheduledAt: "2026-09-11T09:00:00",
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

const DAY = "2026-09-11";

describe("Hari Ini — columns", () => {
  it("makes one column per line of business, alphabetically, Lainnya last", () => {
    const rows = toTodayRows([
      booking({ _id: "a", service: service({ serviceType: "Hotel" }) }),
      booking({ _id: "b", service: service({ serviceType: null }) }),
      booking({ _id: "c" }),
    ]);

    expect(columnsOn(rows, DAY).map((column) => column.name)).toEqual([
      "Grooming",
      "Hotel",
      LINE_UNKNOWN,
    ]);
  });

  /*
    A COLUMN NOBODY BOOKED IS NOT DRAWN — the screen narrows to the shop that is
    reading it, which is the whole reason the columns are read off the day.
  */
  it("draws no column for a line with nothing on that day", () => {
    const rows = toTodayRows([booking()]);

    expect(columnsOn(rows, DAY)).toHaveLength(1);
    expect(columnsOn(rows, "2026-09-12")).toEqual([]);
  });

  /*
    ONLY LINES OF BUSINESS. Antar-Jemput is drawn disabled by the day view (16
    September 2026, on request) rather than listed here — `tripsOn` is the query
    it will run once a journey is a record of its own.
  */
  it("leaves the trip column to the view, and still finds the day's journeys", () => {
    const rows = toTodayRows([
      booking(),
      booking({ _id: "bk-2", pickupRequested: true, petName: "Milo" }),
    ]);
    const columns = columnsOn(rows, DAY);

    expect(columns.map((column) => column.name)).toEqual(["Grooming"]);
    /* Both bookings are grooming — the journey does not take one out. */
    expect(columns[0].rows).toHaveLength(2);
    expect(tripsOn(rows, DAY).map((row) => row.booking.petName)).toEqual([
      "Milo",
    ]);
  });

  it("counts a house call as a journey even with no pickup asked for", () => {
    const rows = toTodayRows([booking({ location: "in_home" })]);

    expect(rows[0].trip).toEqual({ pickup: false, delivery: false, inHome: true });
  });

  it("sorts a column by the clock, then by the animal", () => {
    const rows = toTodayRows([
      booking({ _id: "late", scheduledAt: "2026-09-11T15:30:00", petName: "Coco" }),
      booking({ _id: "early", scheduledAt: "2026-09-11T08:00:00", petName: "Oyen" }),
    ]);

    expect(rowsOn(rows, DAY).map((row) => row.booking.petName)).toEqual([
      "Oyen",
      "Coco",
    ]);
  });

  /* Noon, and the heading carries no hours — the system has no session blocks. */
  it("splits a column into Pagi and Siang at noon, dropping an empty half", () => {
    const morning = toTodayRows([booking()]);
    expect(groupsOf(rowsOn(morning, DAY)).map((group) => group.label)).toEqual([
      "Pagi",
    ]);

    const both = toTodayRows([
      booking(),
      booking({ _id: "bk-2", scheduledAt: "2026-09-11T12:00:00" }),
    ]);
    expect(groupsOf(rowsOn(both, DAY)).map((group) => group.label)).toEqual([
      "Pagi",
      "Siang",
    ]);
  });
});

describe("Hari Ini — the day's numbers", () => {
  it("sums minutes and value per line, and counts the journeys left", () => {
    const rows = toTodayRows([
      booking(),
      booking({
        _id: "bk-2",
        deliveryRequested: true,
        status: "completed",
        service: service({ serviceType: "Hotel", price: "280000.0000", durationMin: null }),
      }),
      booking({ _id: "bk-3", pickupRequested: true }),
    ]);

    const summary = summariseTodayDay(rows, DAY);

    expect(summary.count).toBe(3);
    expect(summary.lines).toEqual([
      { name: "Grooming", count: 2, minutes: 120 },
      { name: "Hotel", count: 1, minutes: 0 },
    ]);
    expect(summary.value).toBe("520000.0000");
    expect(summary.trips).toBe(2);
    /* The completed one has been driven; the confirmed one has not. */
    expect(summary.tripsLeft).toBe(1);
  });

  /* A booking nobody is doing is not work, and not money either. */
  it("counts a cancelled booking for nothing", () => {
    const rows = toTodayRows([booking({ status: "cancelled" })]);
    const summary = summariseTodayDay(rows, DAY);

    expect(summary.count).toBe(0);
    expect(summary.value).toBe("0.0000");
    /* It is still ON the board — a card that vanished would read as lost. */
    expect(rowsOn(rows, DAY)).toHaveLength(1);
  });

  it("gives the mix bar one slice per line, in whole percent", () => {
    const rows = toTodayRows([
      booking(),
      booking({ _id: "bk-2" }),
      booking({ _id: "bk-3", service: service({ serviceType: "Hotel" }) }),
    ]);

    expect(mixOn(rows, DAY)).toEqual([
      { name: "Grooming", count: 2, percent: 67 },
      { name: "Hotel", count: 1, percent: 33 },
    ]);
  });
});

describe("Hari Ini — narrowing", () => {
  const rows = toTodayRows([
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
    booking({ _id: "bk-2", service: service({ serviceType: "Hotel" }) }),
  ]);

  it("keeps everything when nothing is ticked", () => {
    expect(
      rows.filter((row) => matchesTodayFilters(row, { lines: [], groomerIds: [] })),
    ).toHaveLength(2);
  });

  it("narrows by line and by whoever is on a turn", () => {
    expect(
      rows.filter((row) =>
        matchesTodayFilters(row, { lines: ["Hotel"], groomerIds: [] }),
      ).map((row) => row.key),
    ).toEqual(["bk-2"]);

    expect(
      rows.filter((row) =>
        matchesTodayFilters(row, { lines: [], groomerIds: ["u-sinta"] }),
      ).map((row) => row.key),
    ).toEqual(["bk-1"]);
  });
});

/*
  THE DATE HELPERS ARE THE AXIS EVERY VIEW IS DRAWN ON, and the UTC mistake they
  exist to avoid is invisible until somebody east of Greenwich clicks "next".
*/
describe("Hari Ini — the axis", () => {
  it("starts a week on Monday", () => {
    expect(startOfWeek("2026-09-11")).toBe("2026-09-07");
    expect(startOfWeek("2026-09-07")).toBe("2026-09-07");
    /* Sunday belongs to the week that has just ended. */
    expect(startOfWeek("2026-09-13")).toBe("2026-09-07");
  });

  it("steps whole months without skipping one off the 31st", () => {
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-01");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-01");
  });

  it("draws six weeks, every month", () => {
    expect(monthGrid("2026-09-11")).toHaveLength(42);
    expect(monthGrid("2026-09-11")[0]).toBe("2026-08-31");
  });

  it("says the month once when a week does not straddle two", () => {
    expect(weekTitleOf("2026-09-07")).toBe("7 – 13 September 2026");
    expect(weekTitleOf("2026-08-31")).toBe("31 Agustus – 6 September 2026");
  });
});
