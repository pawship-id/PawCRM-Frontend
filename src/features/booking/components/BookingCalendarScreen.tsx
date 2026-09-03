"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  Alert,
  FilterPills,
  FilterSelect,
  Spinner,
  namedOptions,
} from "@/components";
import { Button } from "@/components/ui/button";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { bookingService } from "@/services/booking.service";
import type { BookingCalendar, BookingCalendarEntry, BookingStatus } from "@/types/api";

import { BOOKING_STATUS_LABELS } from "./BookingStatusBadge";

type View = "harian" | "mingguan";

const VIEWS: { value: View; label: string }[] = [
  { value: "harian", label: "Harian" },
  { value: "mingguan", label: "Mingguan" },
];

/** Where the grid starts and ends, and how tall half an hour is. */
const OPENS_AT = 8;
const CLOSES_AT = 20;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 28;

/**
 * A block with no duration still has to be drawn.
 *
 * ONE SLOT, and the block says so in its own text. The alternative — guessing an
 * hour — puts a number on the calendar that nobody chose, and FR-4's clash check
 * would later treat it as fact.
 */
const DEFAULT_SLOT_MINUTES = SLOT_MINUTES;

/**
 * How much of the day is already spoken for, per column.
 *
 * ─── LOAD, NOT CAPACITY, AND THE DIFFERENCE IS THE WHOLE POINT ─────────────
 *
 * "Capacity" would mean announcing a limit — "Sinta can take 8 hours" — and
 * nothing in this system knows anybody's working hours. A groomer on half days,
 * one who stays late on Saturdays, one who is training somebody: each has a
 * different ceiling and none of them is written down anywhere.
 *
 * So it reports what IS booked and lets the shop judge. "4j 30m terisi" answers
 * "who has room" without inventing a number nobody chose — and a wrong ceiling
 * would be worse than no ceiling, because somebody would start refusing work
 * against it.
 *
 * A ROW WITH NO DURATION COUNTS AS ONE SLOT, the same assumption the grid draws
 * it with. Counting it as zero would make a day of untimed work look empty.
 */
function loadOf(
  entries: BookingCalendarEntry[],
  groomerUserId: string | null,
): number {
  return entries
    .filter((entry) => (entry.groomerUserId ?? null) === groomerUserId)
    .reduce(
      (total, entry) => total + (entry.durationMin ?? DEFAULT_SLOT_MINUTES),
      0,
    );
}

/** "4j 30m", "45m", "8j" — never "0j 0m". */
function hoursMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}j`;
  return `${hours}j ${rest}m`;
}

/**
 * COLOUR IS NEVER THE ONLY DIFFERENCE. Every block also carries its status as
 * TEXT — for the reader who cannot separate these hues, and for the screen in a
 * sunlit reception that washes them out.
 */
const STATUS_TONE: Record<BookingStatus, string> = {
  draft: "border-border bg-surface-hover text-muted",
  confirmed: "border-primary/40 bg-navy-100 text-primary",
  check_in: "border-primary bg-navy-100 text-primary",
  in_progress: "border-warning bg-tint-warning text-foreground",
  completed: "border-success bg-tint-success text-foreground",
  cancelled: "border-danger bg-tint-danger text-danger-ink",
};

/**
 * A Date as `YYYY-MM-DD` IN THE BROWSER'S OWN ZONE — which is the shop's.
 *
 * `toISOString().slice(0, 10)` is what the rest of this codebase writes and it is
 * WRONG HERE, in a way a test caught rather than a reader: it converts to UTC
 * first, so east of Greenwich the date goes BACKWARDS. In Jakarta (UTC+7),
 * `addDays("2026-09-02", 1)` came back as `"2026-09-02"` — and the calendar's
 * "berikutnya" button moved nothing at all.
 *
 * Everywhere else in this app the field is a bookkeeping date somebody reads and
 * corrects. Here it is the axis the whole screen is drawn on.
 */
function localDate(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
}

const dayKey = (iso: string) => localDate(new Date(iso));

function addDays(value: string, days: number): string {
  const at = new Date(`${value}T00:00:00`);
  at.setDate(at.getDate() + days);
  return localDate(at);
}

/** Monday of the week `value` falls in — Indonesian weeks start there. */
function startOfWeek(value: string): string {
  const at = new Date(`${value}T00:00:00`);
  const offset = (at.getDay() + 6) % 7;
  at.setDate(at.getDate() - offset);
  return localDate(at);
}

function todayValue(): string {
  return localDate(new Date());
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });

const longDay = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * The day sheet, drawn — FR-3 / PCR-042.
 *
 * A BLOCK IS A ROW, NOT A BOOKING. Since PCR-040 a visit may bring Mochi and
 * Coco with different groomers, so one booking shows up in two columns at once.
 * Blocks of one visit carry the same `bookingId` and are outlined together, and
 * clicking either opens the whole visit.
 *
 * "BELUM DITENTUKAN" IS A COLUMN, and it is last. A row nobody is assigned to is
 * the ordinary state of a booking taken over the phone; leaving it off the
 * calendar would hide exactly the work that still needs somebody put on it.
 *
 * AN EMPTY SLOT AND A CLOSED ONE LOOK DIFFERENT because they mean different
 * things. FR-4 adds the third case — a groomer who is off — and there is nothing
 * to draw it from until the roster is read.
 *
 * NO DRAG AND DROP. Moving a block has to trigger the clash check, the leave
 * check and an audit trail; that is FR-4, and building it here would be building
 * FR-4 twice.
 */
export function BookingCalendarScreen() {
  /*
    THE BRANCH IS A FILTER ON THIS SCREEN — FR-3 kriteria 3.9, and the pattern
    every other list in this app follows.

    IT USED TO FOLLOW `session.currentBranchId` SILENTLY, which is the TILL's
    idea of a branch: a terminal stands in one shop all day. A calendar is read
    by whoever is answering the phone, and an owner with two shops looking at one
    of them without being told which is worse than one extra control.

    `soleBranch` STILL ANSWERS IT for a shop with one branch — one option is not
    a choice.
  */
  const scope = useBranchScope();
  const [pickedBranch, setPickedBranch] = useState("");
  const branchId = pickedBranch || scope.soleBranch;

  const [view, setView] = useState<View>("harian");
  const [anchor, setAnchor] = useState<string>(todayValue);
  const [data, setData] = useState<BookingCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<BookingCalendarEntry | null>(null);

  const from = view === "harian" ? anchor : startOfWeek(anchor);
  const to = view === "harian" ? anchor : addDays(startOfWeek(anchor), 6);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    bookingService
      .calendar({
        branchId: branchId || undefined,
        dateFrom: from,
        dateTo: to,
      })
      .then((result) => {
        if (active) {
          setData(result);
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError("Kalender tidak bisa dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [from, to, branchId]);

  const columns = [
    ...(data?.groomers ?? []).map((groomer) => ({
      id: groomer._id,
      label: groomer.name ?? "—",
      /*
        IN TODAY, NOTHING BOOKED. The column exists so somebody can be GIVEN
        work — which is the question a receptionist brings to this screen ("siapa
        yang bisa ambil anjing jam dua") and the one a calendar of busy people
        cannot answer, because the person who can is the one with no blocks.
      */
      idle: groomer.idle === true,
    })),
    /* LAST, ALWAYS — it is the column somebody has to empty. */
    /* Never "idle": it is work waiting for a person, not a person waiting for
       work — the opposite state, and the column somebody has to empty. */
    ...(data?.hasUnassigned
      ? [{ id: null as string | null, label: "Belum ditentukan", idle: false }]
      : []),
  ];

  const slots = Array.from(
    { length: ((CLOSES_AT - OPENS_AT) * 60) / SLOT_MINUTES },
    (_, index) => OPENS_AT * 60 + index * SLOT_MINUTES,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Sebelumnya"
            onClick={() => setAnchor((prev) => addDays(prev, view === "harian" ? -1 : -7))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground">
            {view === "harian" ? longDay(anchor) : `${longDay(from)} – ${longDay(to)}`}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Berikutnya"
            onClick={() => setAnchor((prev) => addDays(prev, view === "harian" ? 1 : 7))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAnchor(todayValue())}
          >
            Hari ini
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/*
            EMPTY MEANS EVERY BRANCH, which is a legitimate question for an owner
            with two shops — and a wrong DEFAULT for one, which is why
            `soleBranch` fills it in when there is only one.
          */}
          {scope.branches.length > 1 && (
            <FilterSelect
              label="Cabang"
              ariaLabel="Filter cabang"
              value={branchId}
              options={namedOptions(scope.branches)}
              onChange={setPickedBranch}
            />
          )}

          <FilterPills
            value={view}
            options={VIEWS}
            onChange={setView}
            ariaLabel="Tampilan kalender"
          />
        </div>
      </div>

      {/*
        THE LEGEND IS ALWAYS VISIBLE, not a tooltip. A colour key somebody has to
        hover for is a key nobody reads, and the blocks carry the words anyway —
        this is what ties the two together.
      */}
      <ul className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(STATUS_TONE) as BookingStatus[])
          .filter((status) => status !== "cancelled")
          .map((status) => (
            <li
              key={status}
              className={`rounded-full border px-2 py-0.5 ${STATUS_TONE[status]}`}
            >
              {BOOKING_STATUS_LABELS[status]}
            </li>
          ))}
      </ul>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat kalender…
        </div>
      ) : view === "mingguan" ? (
        <WeekView from={from} entries={data?.entries ?? []} onOpen={setOpen} />
      ) : columns.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
          Tidak ada booking hari ini.
        </p>
      ) : (
        <DayGrid
          slots={slots}
          columns={columns}
          entries={data?.entries ?? []}
          onOpen={setOpen}
        />
      )}

      {open && <DetailPanel entry={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Minutes past midnight, in the browser's zone — which is the shop's. */
function minutesOf(iso: string): number {
  const at = new Date(iso);
  return at.getHours() * 60 + at.getMinutes();
}

function DayGrid({
  slots,
  columns,
  entries,
  onOpen,
}: {
  slots: number[];
  columns: { id: string | null; label: string; idle: boolean }[];
  entries: BookingCalendarEntry[];
  onOpen: (entry: BookingCalendarEntry) => void;
}) {
  return (
    /* WIDE CONTENT SCROLLS INSIDE ITS OWN BOX — a shop with six groomers must
       not make the whole page scroll sideways. */
    <div className="overflow-x-auto rounded-xl border border-border">
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `72px repeat(${columns.length}, minmax(160px, 1fr))`,
        }}
      >
        <div className="border-b border-border bg-surface px-2 py-2 text-xs text-muted">
          Jam
        </div>
        {columns.map((column) => (
          <div
            key={column.id ?? "unassigned"}
            className="border-b border-l border-border bg-surface px-2 py-2 text-sm font-semibold text-foreground"
          >
            {column.label}
            {/*
              LABELLED, NOT LEFT AS A BLANK COLUMN. An empty column with no
              explanation reads as a loading failure; "kosong" says the person is
              here and free, which is the whole reason the column was added.

              A COLUMN WITH WORK CARRIES ITS LOAD INSTEAD — see `loadOf`. The two
              are mutually exclusive by construction: idle means no blocks, and
              no blocks means no hours to report.
            */}
            <span className="ml-1 text-xs font-normal text-muted">
              {column.idle
                ? "· kosong"
                : `· ${hoursMinutes(loadOf(entries, column.id))} terisi`}
            </span>
          </div>
        ))}

        {slots.map((minutes) => (
          <Row
            key={minutes}
            minutes={minutes}
            columns={columns}
            entries={entries}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  minutes,
  columns,
  entries,
  onOpen,
}: {
  minutes: number;
  columns: { id: string | null; label: string; idle: boolean }[];
  entries: BookingCalendarEntry[];
  onOpen: (entry: BookingCalendarEntry) => void;
}) {
  const label = `${String(Math.floor(minutes / 60)).padStart(2, "0")}.${String(minutes % 60).padStart(2, "0")}`;

  return (
    <>
      <div
        className="border-b border-border px-2 py-1 text-xs tabular-nums text-muted"
        style={{ height: SLOT_HEIGHT }}
      >
        {minutes % 60 === 0 ? label : ""}
      </div>

      {columns.map((column) => {
        const here = entries.filter(
          (entry) =>
            (entry.groomerUserId ?? null) === column.id &&
            minutesOf(entry.startAt) >= minutes &&
            minutesOf(entry.startAt) < minutes + SLOT_MINUTES,
        );

        return (
          <div
            key={`${column.id ?? "unassigned"}-${minutes}`}
            className="border-b border-l border-border p-0.5"
            style={{ height: SLOT_HEIGHT }}
          >
            {here.map((entry) => (
              <Block key={entry._id} entry={entry} onOpen={onOpen} />
            ))}
          </div>
        );
      })}
    </>
  );
}

function Block({
  entry,
  onOpen,
}: {
  entry: BookingCalendarEntry;
  onOpen: (entry: BookingCalendarEntry) => void;
}) {
  const minutes = entry.durationMin ?? DEFAULT_SLOT_MINUTES;
  const height = Math.max(
    SLOT_HEIGHT - 4,
    (minutes / SLOT_MINUTES) * SLOT_HEIGHT - 4,
  );

  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      style={{ height }}
      className={`relative z-10 w-full overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-xs ${STATUS_TONE[entry.status]}`}
    >
      <span className="block truncate font-semibold">
        {entry.petName ?? "—"}
      </span>
      <span className="block truncate">{entry.serviceName}</span>
      {/* THE STATUS AS WORDS. Colour is never the only difference. */}
      <span className="block truncate opacity-80">
        {BOOKING_STATUS_LABELS[entry.status]}
        {entry.durationMin === null && " · durasi belum diisi"}
      </span>
    </button>
  );
}

/**
 * The week, summarised rather than drawn hour by hour.
 *
 * SEVEN DAYS OF HALF-HOUR SLOTS is a grid nobody can read on a laptop. What the
 * weekly view is actually asked is "which day is full" — so it answers in counts
 * and hours, and the daily view is one click away for the day somebody picked.
 */
function WeekView({
  from,
  entries,
  onOpen,
}: {
  from: string;
  entries: BookingCalendarEntry[];
  onOpen: (entry: BookingCalendarEntry) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(from, index));

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {days.map((day) => {
        const here = entries.filter((entry) => dayKey(entry.startAt) === day);
        const minutes = here.reduce(
          (sum, entry) => sum + (entry.durationMin ?? DEFAULT_SLOT_MINUTES),
          0,
        );

        return (
          <div key={day} className="rounded-lg border border-border p-3">
            <p className="text-sm font-semibold text-foreground">
              {new Date(`${day}T00:00:00`).toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "short",
              })}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {here.length} layanan · {Math.round((minutes / 60) * 10) / 10} jam
            </p>

            <ul className="mt-2 flex flex-col gap-1">
              {here.slice(0, 6).map((entry) => (
                <li key={entry._id}>
                  <Block entry={entry} onOpen={onOpen} />
                </li>
              ))}
              {here.length > 6 && (
                <li className="text-xs text-muted">
                  +{here.length - 6} lagi — buka tampilan harian
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/**
 * What one block is.
 *
 * IT OPENS THE WHOLE VISIT, not just the row that was clicked: Mochi's block
 * names Coco too, because the customer is collecting both and the person reading
 * this is about to talk to them.
 */
function DetailPanel({
  entry,
  onClose,
}: {
  entry: BookingCalendarEntry;
  onClose: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {entry.petName ?? "—"} · {entry.serviceName}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {clock(entry.startAt)}
            {entry.durationMin ? ` · ${entry.durationMin} menit` : " · durasi belum diisi"}
            {" · "}
            {entry.groomerName ?? "Belum ditentukan"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {entry.customerName ?? "—"}
            {entry.bookingNumber ? ` · ${entry.bookingNumber}` : ""}
          </p>
          {entry.notes && (
            <p className="mt-1 text-xs text-muted">{entry.notes}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/*
            THE WAY OUT OF THE CALENDAR AND INTO THE BOOKING. A block answers
            "who is where at ten"; the questions that follow it — what else is on
            this visit, has it been billed, what is this animal allergic to —
            live on the booking, and making somebody find it by number would be
            a search for something they are already looking at.
          */}
          <Button asChild variant="secondary" size="sm">
            <Link href={`/dashboard/booking/${entry.bookingId}`}>
              Buka booking
            </Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </div>
  );
}
