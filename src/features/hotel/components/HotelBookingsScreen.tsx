"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import {
  Alert,
  Card,
  DataTable,
  FilterBar,
  FilterSearch,
  FilterSelect,
  withAll,
  type DataTableColumn,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GroomingModuleHeader } from "@/features/grooming/components/GroomingModuleHeader";
import { GroomingStatCard } from "@/features/grooming/components/GroomingStatCard";
import { useBranchOptions } from "@/features/inventory/hooks/useBranchOptions";
import { Can } from "@/features/permissions";
import { useHotelRoomTypes } from "@/hooks/useHotelRoomTypes";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { hotelStayService } from "@/services/hotel.service";
import type { HotelRoomType, HotelStayBooking } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

import { HOTEL_LINE } from "../line";
import { HOTEL_NEW_BOOKING_PATH, hotelBookingPath } from "../paths";
import {
  addDays,
  isNight,
  localToday,
  roomText,
  shortDate,
  STAY_STATUS,
  stayFlag,
} from "../stay";
import { HotelStayDialog, type StayAction } from "./HotelStayDialogs";
import { StayBillBadge } from "./StayBillBadge";

type Lens = "inap" | "datang" | "pulang" | null;
const BOARD_DAYS = 14;
const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

/**
 * Layanan › Hotel › Booking (21 November 2026, PLAN-Hotel-V1.md §4.5). Two
 * views of the same stays: a list, and a 14-day room board where an empty cell
 * opens a new booking in that room on that day.
 */
export function HotelBookingsScreen() {
  const router = useRouter();
  const [view, setView] = useState<"daftar" | "papan">("daftar");
  const [lens, setLens] = useState<Lens>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [stays, setStays] = useState<HotelStayBooking[]>([]);
  const [today, setToday] = useState(localToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [acting, setActing] = useState<{
    action: StayAction;
    booking: HotelStayBooking;
  } | null>(null);
  const roomTypes = useHotelRoomTypes();

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a reload shows the old rows dimmed
    setLoading(true);
    hotelStayService
      .list({ from: addDays(localToday(), -45) })
      .then((result) => {
        if (!active) return;
        setStays(result.items);
        setToday(result.today);
        setError(null);
      })
      .catch(
        (err: unknown) =>
          active &&
          setError(
            err instanceof ApiError
              ? err.fullMessage
              : "Booking hotel tidak bisa dimuat.",
          ),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const live = stays.filter((booking) => booking.status !== "cancelled");
  const inap = live.filter((booking) => booking.status === "in_progress");
  const datang = live.filter(
    (booking) =>
      booking.status === "confirmed" && booking.stay.checkInDate === today,
  );
  const pulang = inap.filter((booking) => booking.stay.checkOutDate <= today);
  const tonight = live.filter(
    (booking) => booking.status !== "completed" && isNight(booking.stay, today),
  ).length;
  const capacity = roomTypes.items.reduce(
    (sum, roomType) => sum + roomType.usableCapacity,
    0,
  );

  const rows = useMemo(() => {
    const order: Record<string, number> = {
      in_progress: 0,
      confirmed: 1,
      completed: 2,
      cancelled: 3,
    };
    let list = [...stays].sort(
      (a, b) =>
        (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
        a.stay.checkInDate.localeCompare(b.stay.checkInDate),
    );
    if (lens === "inap") list = inap;
    if (lens === "datang") list = datang;
    if (lens === "pulang") list = pulang;
    if (status) list = list.filter((booking) => booking.status === status);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((booking) =>
        [booking.bookingNumber, booking.petName, booking.customerName].some(
          (value) => value?.toLowerCase().includes(q),
        ),
      );
    }
    return list;
  }, [stays, lens, status, search, inap, datang, pulang]);

  const columns: DataTableColumn<HotelStayBooking>[] = [
    {
      id: "code",
      header: "Kode",
      cell: (row) => (
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {row.bookingNumber ?? "—"}
        </span>
      ),
    },
    {
      id: "pet",
      header: "Hewan",
      cell: (row) => (
        <>
          <span className="block text-sm font-semibold text-foreground">
            {row.petName ?? "—"}
          </span>
          <span className="block text-xs text-muted">{row.customerName}</span>
        </>
      ),
    },
    {
      id: "service",
      header: "Layanan & kamar",
      cell: (row) => (
        <>
          <span className="block text-sm">{row.service.name}</span>
          <span className="block text-xs text-muted">{roomText(row.stay)}</span>
        </>
      ),
    },
    {
      id: "in",
      header: "Masuk",
      cell: (row) => (
        <>
          <span className="block text-sm tabular-nums">
            {shortDate(row.stay.checkInDate)}
          </span>
          <span className="block text-xs text-muted tabular-nums">
            {row.stay.arrivalTime ?? "—"}
          </span>
        </>
      ),
    },
    {
      id: "out",
      header: "Keluar",
      cell: (row) => (
        <>
          <span className="block text-sm tabular-nums">
            {shortDate(row.stayFacts.end)}
          </span>
          <span className="block text-xs text-muted tabular-nums">
            {row.stayFacts.nights} malam
          </span>
        </>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => {
        const flag = stayFlag(row, today);
        const tone = STAY_STATUS[row.status] ?? STAY_STATUS.confirmed;
        return (
          <>
            <Badge
              variant="outline"
              className={cn("border-transparent", tone.className)}
            >
              {tone.label}
            </Badge>
            {flag && (
              <span className="mt-1 block text-xs font-semibold text-warning">
                {flag}
              </span>
            )}
          </>
        );
      },
    },
    {
      id: "bill",
      header: "Tagihan",
      cell: (row) => <StayBillBadge booking={row} />,
    },
    {
      id: "act",
      header: "",
      align: "right",
      cell: (row) =>
        row.status === "confirmed" ? (
          <Can feature="bookings" action="update">
            <Button
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                setActing({ action: "checkin", booking: row });
              }}
            >
              Check-in
            </Button>
          </Can>
        ) : row.status === "in_progress" ? (
          <Can feature="bookings" action="update">
            <Button
              size="sm"
              variant={row.stay.checkOutDate <= today ? "default" : "secondary"}
              onClick={(event) => {
                event.stopPropagation();
                setActing({ action: "checkout", booking: row });
              }}
            >
              Check-out
            </Button>
          </Can>
        ) : null,
    },
  ];

  const lensCard = (key: Exclude<Lens, null>) => ({
    pressed: lens === key,
    onPress: () => {
      setLens((current) => (current === key ? null : key));
      setView("daftar");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <GroomingModuleHeader
        line={HOTEL_LINE}
        action={
          <Can feature="bookings" action="create">
            <Button asChild>
              <Link href={HOTEL_NEW_BOOKING_PATH}>
                <Plus className="size-4" />
                Booking hotel
              </Link>
            </Button>
          </Can>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GroomingStatCard
          label="Sedang menginap"
          value={String(inap.length)}
          caption="hewan di hotel sekarang"
          loading={loading}
          {...lensCard("inap")}
        />
        <GroomingStatCard
          label="Datang hari ini"
          value={String(datang.length)}
          caption={shortDate(today)}
          loading={loading}
          {...lensCard("datang")}
        />
        <GroomingStatCard
          label="Pulang hari ini"
          value={String(pulang.length)}
          caption="termasuk yang lewat jadwal"
          loading={loading}
          {...lensCard("pulang")}
        />
        <GroomingStatCard
          label="Terisi malam ini"
          value={`${tonight} / ${capacity}`}
          caption={`${capacity ? Math.round((tonight / capacity) * 100) : 0}% kapasitas`}
          loading={loading}
          onPress={() => setView("papan")}
        />
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        role="tablist"
        aria-label="Tampilan booking"
      >
        {(["daftar", "papan"] as const).map((key) => (
          <Button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            variant={view === key ? "default" : "secondary"}
            size="sm"
            onClick={() => setView(key)}
          >
            {key === "daftar" ? "Daftar booking" : "Papan kamar"}
          </Button>
        ))}
      </div>

      {error && (
        <Alert variant="error">
          <span className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={reload}
            >
              Muat ulang
            </Button>
          </span>
        </Alert>
      )}

      {view === "daftar" ? (
        <Card>
          <div className="flex flex-col gap-4">
            <FilterBar
              search={
                <FilterSearch
                  value={search}
                  onChange={setSearch}
                  placeholder="Cari hewan, pemilik, atau kode booking"
                  ariaLabel="Cari booking hotel"
                />
              }
            >
              <FilterSelect
                label="Status"
                value={status}
                onChange={setStatus}
                options={withAll(
                  Object.entries(STAY_STATUS).map(([value, tone]) => ({
                    value,
                    label: tone.label,
                  })),
                  "Semua status",
                )}
              />
              {lens && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setLens(null)}
                >
                  Lepas filter kartu
                </Button>
              )}
            </FilterBar>
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row) => row._id}
              loading={loading}
              loadingLabel="Memuat booking hotel…"
              onRowClick={(row) => router.push(hotelBookingPath(row._id))}
              empty={
                <span>
                  Belum ada booking hotel untuk filter ini. Buat lewat{" "}
                  <b>Booking hotel</b> →
                </span>
              }
            />
          </div>
        </Card>
      ) : (
        <RoomBoard stays={live} roomTypes={roomTypes.items} today={today} />
      )}

      {acting && (
        <HotelStayDialog
          action={acting.action}
          booking={acting.booking}
          onClose={() => setActing(null)}
          onDone={() => {
            setActing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

/** The 14-day room board for one branch. One cell is one night. */
function RoomBoard({
  stays,
  roomTypes,
  today,
}: {
  stays: HotelStayBooking[];
  roomTypes: HotelRoomType[];
  today: string;
}) {
  const router = useRouter();
  const { branches } = useBranchOptions();
  const branchIds = [
    ...new Set(roomTypes.map((roomType) => roomType.branchId)),
  ];
  const [branchId, setBranchId] = useState("");
  const [start, setStart] = useState(addDays(today, -2));
  const active = branchId || branchIds[0] || "";
  const days = Array.from({ length: BOARD_DAYS }, (_, index) =>
    addDays(start, index),
  );
  const here = roomTypes.filter((roomType) => roomType.branchId === active);
  const branchName = (id: string) =>
    branches.find((branch) => branch._id === id)?.name ?? "Cabang";

  const occupants = (
    roomType: HotelRoomType,
    unitId: string | null,
    date: string,
  ) =>
    stays.filter(
      (booking) =>
        booking.stay.roomTypeId === roomType._id &&
        (unitId === null || booking.stay.unitId === unitId) &&
        isNight(booking.stay, date),
    );

  const newAt = (
    roomType: HotelRoomType,
    unitId: string | null,
    date: string,
  ) =>
    router.push(
      `${HOTEL_NEW_BOOKING_PATH}?roomTypeId=${roomType._id}${unitId ? `&unitId=${unitId}` : ""}&date=${date}`,
    );

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {branchIds.length > 1 && (
            <FilterSelect
              label="Cabang"
              value={active}
              onChange={setBranchId}
              options={branchIds.map((id) => ({
                value: id,
                label: branchName(id),
              }))}
            />
          )}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="size-9 p-0"
              aria-label="Minggu sebelumnya"
              onClick={() => setStart(addDays(start, -7))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-36 text-center text-sm font-semibold tabular-nums">
              {shortDate(days[0])} – {shortDate(days[BOARD_DAYS - 1])}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="size-9 p-0"
              aria-label="Minggu berikutnya"
              onClick={() => setStart(addDays(start, 7))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setStart(addDays(today, -2))}
            >
              Hari ini
            </Button>
          </div>
          <span className="text-xs text-muted">
            Klik kotak kosong untuk booking di kamar dan tanggal itu.
          </span>
        </div>

        {here.length === 0 ? (
          <p className="text-sm text-muted">
            Belum ada tipe kamar di cabang ini.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <div
              className="grid min-w-[900px]"
              style={{
                gridTemplateColumns: `112px repeat(${BOARD_DAYS}, minmax(0, 1fr))`,
              }}
            >
              <div className="sticky left-0 z-10 border-b border-border bg-surface px-3 py-2 text-xs font-semibold text-muted">
                Kamar
              </div>
              {days.map((date) => {
                const weekday =
                  WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
                return (
                  <div
                    key={date}
                    className={cn(
                      "border-b border-l border-border py-2 text-center text-xs font-semibold",
                      date === today
                        ? "bg-primary text-primary-foreground"
                        : "text-muted",
                    )}
                  >
                    <div>{weekday}</div>
                    <div className="text-sm tabular-nums">
                      {Number(date.slice(8))}
                    </div>
                  </div>
                );
              })}

              {here.map((roomType) => (
                <BoardRoomType
                  key={roomType._id}
                  roomType={roomType}
                  days={days}
                  today={today}
                  occupants={occupants}
                  onNew={newAt}
                  onOpen={(id) => router.push(hotelBookingPath(id))}
                />
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-4 text-xs text-muted">
          {(["confirmed", "in_progress", "completed"] as const).map((key) => (
            <span key={key} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-block size-3 rounded",
                  STAY_STATUS[key].className,
                )}
              />
              {STAY_STATUS[key].label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded bg-tint-neutral" />
            Perbaikan
          </span>
        </div>
      </div>
    </Card>
  );
}

function BoardRoomType({
  roomType,
  days,
  today,
  occupants,
  onNew,
  onOpen,
}: {
  roomType: HotelRoomType;
  days: string[];
  today: string;
  occupants: (
    roomType: HotelRoomType,
    unitId: string | null,
    date: string,
  ) => HotelStayBooking[];
  onNew: (roomType: HotelRoomType, unitId: string | null, date: string) => void;
  onOpen: (id: string) => void;
}) {
  const header = (
    <div
      className="col-span-full border-b border-border bg-surface-hover px-3 py-2 text-sm font-semibold text-foreground"
      style={{ gridColumn: "1 / -1" }}
    >
      {roomType.name}
      <span className="ml-2 text-xs font-normal text-muted">
        {roomType.mode === "zone"
          ? `Zona · maks ${roomType.capacity}`
          : `${roomType.units.length} kamar`}
      </span>
    </div>
  );

  if (roomType.mode === "zone") {
    return (
      <>
        {header}
        <div className="sticky left-0 z-10 border-b border-border bg-surface px-3 py-2 text-sm font-semibold">
          Zona
        </div>
        {days.map((date) => {
          const here = occupants(roomType, null, date);
          return (
            <div
              key={date}
              className={cn(
                "border-b border-l border-border p-1",
                date === today && "bg-surface-selected",
              )}
            >
              <button
                type="button"
                disabled={roomType.closed}
                onClick={() =>
                  here[0] ? onOpen(here[0]._id) : onNew(roomType, null, date)
                }
                title={
                  here.map((booking) => booking.petName).join(", ") || "Kosong"
                }
                className="h-9 w-full rounded-md bg-tint-neutral text-xs font-semibold tabular-nums transition hover:bg-surface-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
              >
                {roomType.closed ? "—" : `${here.length}/${roomType.capacity}`}
              </button>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <>
      {header}
      {roomType.units.map((unit) => (
        <BoardUnitRow
          key={unit._id ?? unit.code}
          roomType={roomType}
          unit={unit}
          days={days}
          today={today}
          occupants={occupants}
          onNew={onNew}
          onOpen={onOpen}
        />
      ))}
    </>
  );
}

function BoardUnitRow({
  roomType,
  unit,
  days,
  today,
  occupants,
  onNew,
  onOpen,
}: {
  roomType: HotelRoomType;
  unit: HotelRoomType["units"][number];
  days: string[];
  today: string;
  occupants: (
    roomType: HotelRoomType,
    unitId: string | null,
    date: string,
  ) => HotelStayBooking[];
  onNew: (roomType: HotelRoomType, unitId: string | null, date: string) => void;
  onOpen: (id: string) => void;
}) {
  const label = (
    <div className="sticky left-0 z-10 border-b border-border bg-surface px-3 py-2">
      <div className="text-sm font-semibold tabular-nums">{unit.code}</div>
      {unit.underRepair && (
        <div className="text-xs font-semibold text-warning">Perbaikan</div>
      )}
    </div>
  );
  if (unit.underRepair) {
    return (
      <>
        {label}
        <div
          className="border-b border-l border-border bg-tint-neutral"
          style={{ gridColumn: `span ${days.length}` }}
        />
      </>
    );
  }

  /* Runs of nights with the same occupants become one bar. */
  const cells: { from: number; to: number; ids: string }[] = [];
  days.forEach((date, index) => {
    const ids = occupants(roomType, unit._id ?? null, date)
      .map((booking) => booking._id)
      .sort()
      .join(",");
    const last = cells[cells.length - 1];
    if (last && last.ids === ids && ids) last.to = index;
    else cells.push({ from: index, to: index, ids });
  });

  return (
    <>
      {label}
      {cells.map((cell) => {
        const date = days[cell.from];
        if (!cell.ids) {
          return (
            <div
              key={date}
              className={cn(
                "border-b border-l border-border p-1",
                date === today && "bg-surface-selected",
              )}
            >
              <button
                type="button"
                aria-label={`Booking ${unit.code} ${shortDate(date)}`}
                onClick={() => onNew(roomType, unit._id ?? null, date)}
                className="h-9 w-full rounded-md text-transparent transition hover:bg-surface-hover hover:text-muted focus-visible:text-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                +
              </button>
            </div>
          );
        }
        const here = occupants(roomType, unit._id ?? null, date);
        const first = here[0];
        const tone = STAY_STATUS[first.status] ?? STAY_STATUS.confirmed;
        return (
          <div
            key={date}
            className="border-b border-l border-border p-1"
            style={{ gridColumn: `span ${cell.to - cell.from + 1}` }}
          >
            <button
              type="button"
              onClick={() => onOpen(first._id)}
              title={`${here.map((booking) => booking.petName).join(", ")} · ${shortDate(first.stay.checkInDate)} – ${shortDate(first.stay.checkOutDate)}`}
              className={cn(
                "flex h-9 w-full flex-col justify-center overflow-hidden rounded-md px-2 text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                tone.className,
              )}
            >
              <span className="truncate text-xs font-bold">
                {here.map((booking) => booking.petName).join(", ")}
              </span>
              <span className="truncate text-xs">
                {formatMoney(first.stay.nightPrice)}/mlm
              </span>
            </button>
          </div>
        );
      })}
    </>
  );
}
