"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Alert, Card, SelectField, Spinner, StatTile } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { GroomingModuleHeader } from "@/features/grooming/components/GroomingModuleHeader";
import { Can, usePermissions } from "@/features/permissions";
import { useHotelRoomTypes } from "@/hooks/useHotelRoomTypes";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { hotelStayService } from "@/services/hotel.service";
import { tenantService } from "@/services/tenant.service";
import type { HotelSettings, HotelStayBooking, HotelTasks } from "@/types/api";
import { formatMoneyShort, toDecimalString, toMinor } from "@/utils/decimal";

import { useHotelStaff } from "../hooks/useHotelStaff";
import { HOTEL_LINE } from "../line";
import { HOTEL_NEW_BOOKING_PATH, hotelBookingPath } from "../paths";
import { withHotelDefaults } from "../settings";
import { addDays, isNight, localToday, roomText } from "../stay";
import { HotelStayDialog, type StayAction } from "./HotelStayDialogs";
import { stayBillState } from "./StayBillBadge";

/**
 * Layanan › Hotel › Ringkasan (21 November 2026, PLAN-Hotel-V1.md §4.5) —
 * seragam dengan Ringkasan Grooming. This month's figures, then today's work:
 * who comes, who goes, which night has no PIC yet, and every task of every
 * animal in, grouped by time and kegiatan, ticked by one chosen staff member.
 */
export function HotelSummaryScreen() {
  const { can } = usePermissions();
  const roomTypes = useHotelRoomTypes();
  const [stays, setStays] = useState<HotelStayBooking[]>([]);
  const [tasks, setTasks] = useState<HotelTasks | null>(null);
  const [today, setToday] = useState(localToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [acting, setActing] = useState<{
    action: StayAction;
    booking: HotelStayBooking;
  } | null>(null);
  const [who, setWho] = useState("");
  const [settings, setSettings] = useState<HotelSettings>(
    withHotelDefaults(undefined),
  );
  const { staff } = useHotelStaff(today);

  const monthStart = `${localToday().slice(0, 8)}01`;
  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a reload keeps the old figures visible
    setLoading(true);
    Promise.all([
      hotelStayService.list({ from: addDays(monthStart, -31) }),
      hotelStayService.tasks(),
    ])
      .then(([list, todayTasks]) => {
        if (!active) return;
        setStays(list.items);
        setToday(list.today);
        setTasks(todayTasks);
        setError(null);
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof ApiError
              ? err.fullMessage
              : "Ringkasan hotel tidak bisa dimuat.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [nonce, monthStart]);

  useEffect(() => {
    tenantService
      .me()
      .then((tenant) => setSettings(withHotelDefaults(tenant.settings?.hotel)))
      .catch(() => undefined);
  }, []);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const live = stays.filter((booking) => booking.status !== "cancelled");
  const [monthYear, monthNumber] = monthStart.split("-").map(Number);
  const monthEnd =
    monthNumber === 12
      ? `${monthYear + 1}-01-01`
      : `${monthYear}-${String(monthNumber + 1).padStart(2, "0")}-01`;

  const figures = useMemo(() => {
    let nights = 0;
    let gross = 0n;
    live.forEach((booking) => {
      const perNight = toMinor(booking.stay.nightPrice) ?? 0n;
      for (
        let date = booking.stay.checkInDate;
        date < booking.stayFacts.end;
        date = addDays(date, 1)
      ) {
        if (date >= monthStart && date < monthEnd) {
          nights += 1;
          gross += perNight;
        }
      }
    });
    const thisMonth = live.filter(
      (booking) => booking.stay.checkInDate >= monthStart,
    );
    const withAddon = thisMonth.filter((booking) =>
      booking.service.addons.some((addon) => addon.hotel),
    ).length;
    const lengths = thisMonth.map((booking) => booking.stayFacts.nights);
    return {
      nights,
      gross: toDecimalString(gross),
      perNight: nights ? toDecimalString(gross / BigInt(nights)) : "0",
      attach: thisMonth.length
        ? Math.round((withAddon / thisMonth.length) * 100)
        : 0,
      avgLength: lengths.length
        ? (lengths.reduce((a, b) => a + b, 0) / lengths.length)
            .toFixed(1)
            .replace(".", ",")
        : "0",
    };
  }, [live, monthStart, monthEnd]);

  const tonight = live.filter(
    (booking) => booking.status !== "completed" && isNight(booking.stay, today),
  ).length;
  const capacity = roomTypes.items.reduce(
    (sum, roomType) => sum + roomType.usableCapacity,
    0,
  );
  const datang = live.filter(
    (booking) =>
      booking.status === "confirmed" && booking.stay.checkInDate <= today,
  );
  const pulang = live.filter(
    (booking) =>
      booking.status === "in_progress" && booking.stay.checkOutDate <= today,
  );
  const noPic =
    settings.commission.split === "night_pic"
      ? live.filter(
          (booking) =>
            booking.status === "in_progress" &&
            isNight(booking.stay, today) &&
            !booking.stay.days.find((day) => day.date === today)?.picUserId,
        )
      : [];
  const mayTick = can("bookings", "update") || can("bookings", "advanceStatus");

  async function setPic(booking: HotelStayBooking, picUserId: string) {
    try {
      await hotelStayService.setDay(booking._id, today, {
        picUserId: picUserId || null,
      });
      reload();
    } catch (err) {
      swalToast(
        err instanceof ApiError
          ? (err.reason ?? err.fullMessage)
          : "Belum tersimpan.",
        "error",
        6000,
      );
    }
  }

  async function tick(stayId: string, key: string, done: boolean) {
    if (done && !who) {
      swalToast(
        "Pilih dulu siapa yang mengerjakan, di atas daftar tugas.",
        "error",
        4000,
      );
      return;
    }
    try {
      await hotelStayService.setDay(stayId, today, {
        task: { key, done, doneBy: done ? who : null },
      });
      reload();
    } catch (err) {
      swalToast(
        err instanceof ApiError
          ? (err.reason ?? err.fullMessage)
          : "Belum tersimpan.",
        "error",
        6000,
      );
    }
  }

  /* Today's tasks, grouped by clock time and kegiatan. */
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        time: string;
        label: string;
        rows: {
          stay: HotelTasks["stays"][number];
          key: string;
          detail?: string;
          doneBy: string | null;
        }[];
      }
    >();
    (tasks?.stays ?? []).forEach((stay) =>
      stay.items.forEach((item) => {
        const base =
          item.kind === "addon" ? item.label.replace(/ ×\d+$/, "") : item.label;
        const id = `${item.time ?? "99:99"}|${base}`;
        if (!map.has(id))
          map.set(id, { time: item.time ?? "—", label: base, rows: [] });
        map
          .get(id)!
          .rows.push({
            stay,
            key: item.key,
            detail: item.detail,
            doneBy: item.doneBy,
          });
      }),
    );
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, group]) => group);
  }, [tasks]);
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const doneCount = groups.reduce(
    (sum, group) => sum + group.rows.filter((row) => row.doneBy).length,
    0,
  );
  const staffName = (id: string | null) =>
    id ? (staff.find((row) => row._id === id)?.fullName ?? "Staf") : null;

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Malam terjual"
          value={String(figures.nights)}
          caption="bulan ini"
          loading={loading}
          hint="Jumlah malam menginap semua hewan bulan ini. Satu hewan menginap 3 malam = 3. Booking batal tidak dihitung."
        />
        <StatTile
          label="Nilai menginap"
          value={formatMoneyShort(figures.gross)}
          caption="bulan ini · sebelum diskon"
          loading={loading}
          hint="Harga per malam × malam yang jatuh di bulan ini. Add-on dan diskon tidak termasuk."
        />
        <StatTile
          label="Rata-rata per malam"
          value={formatMoneyShort(figures.perNight)}
          caption="sebelum diskon"
          loading={loading}
          hint="Nilai menginap dibagi malam terjual. Naik kalau makin banyak kamar yang lebih mahal."
        />
        <StatTile
          label="Okupansi malam ini"
          value={`${tonight} / ${capacity}`}
          caption={`${capacity ? Math.round((tonight / capacity) * 100) : 0}% kapasitas`}
          loading={loading}
          hint="Hewan yang menginap malam ini dibagi kapasitas kamar yang bisa dipakai. Kamar dan zona yang sedang perbaikan tidak dihitung."
        />
        <StatTile
          label="Lama menginap rata-rata"
          value={`${figures.avgLength} malam`}
          caption="booking yang masuk bulan ini"
          loading={loading}
        />
        <StatTile
          label="Add-on attach rate"
          value={`${figures.attach}%`}
          caption="booking dengan minimal 1 add-on"
          loading={loading}
          hint="Persentase booking bulan ini yang memakai minimal satu add-on, misalnya CCTV kamar atau extra walk."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Datang hari ini"
          description={`${datang.length} hewan, termasuk yang belum datang`}
        >
          <StayRows
            rows={datang}
            empty="Tidak ada yang datang hari ini."
            action="checkin"
            today={today}
            onAct={(booking) => setActing({ action: "checkin", booking })}
          />
        </Card>
        <Card
          title="Pulang hari ini"
          description={`${pulang.length} hewan, termasuk yang lewat jadwal`}
        >
          <StayRows
            rows={pulang}
            empty="Tidak ada yang pulang hari ini."
            action="checkout"
            today={today}
            onAct={(booking) => setActing({ action: "checkout", booking })}
          />
        </Card>
      </div>

      {noPic.length > 0 && (
        <Card
          title="Belum ada PIC malam ini"
          description="Komisi malam ini diberikan ke PIC yang dipilih di sini."
        >
          <ul className="divide-y divide-border">
            {noPic.map((booking) => (
              <li
                key={booking._id}
                className="flex flex-wrap items-end justify-between gap-3 py-2"
              >
                <span className="pb-3 text-sm">
                  <b>{booking.petName}</b>{" "}
                  <span className="text-muted">· {roomText(booking.stay)}</span>
                </span>
                <SelectField
                  label={`PIC malam ini untuk ${booking.petName}`}
                  value=""
                  onChange={(id) => id && void setPic(booking, id)}
                  options={staff.map((row) => ({
                    value: row._id,
                    label: row.fullName,
                    disabled: Boolean(row.offReason),
                  }))}
                  placeholder="Pilih PIC…"
                  disabled={!mayTick}
                  className="w-56 [&_label]:sr-only"
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Tugas hari ini"
        description="Gabungan checklist semua hewan yang menginap. Checklist lengkap per hewan ada di detail bookingnya."
      >
        {loading && !tasks ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner size={16} /> Memuat tugas…
          </p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted">
            Tidak ada hewan yang sedang menginap.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3 rounded-xl bg-tint-warning/40 p-3">
              <SelectField
                label="Dikerjakan oleh"
                value={who}
                onChange={setWho}
                options={staff.map((row) => ({
                  value: row._id,
                  label: row.fullName,
                  disabled: Boolean(row.offReason),
                }))}
                placeholder="Pilih staf…"
                disabled={!mayTick}
                className="w-56"
              />
              <span className="pb-3 text-xs text-muted">
                Pilih nama sekali, lalu centang tugas yang sudah dikerjakan.
              </span>
              <span className="ml-auto pb-3 text-sm font-bold tabular-nums">
                {doneCount} dari {total} selesai
              </span>
            </div>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {groups.map((group) => (
                <li
                  key={`${group.time}|${group.label}`}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:gap-4"
                >
                  <span className="w-14 flex-none text-lg font-extrabold tabular-nums">
                    {group.time}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{group.label}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.rows.map((row) => (
                        <label
                          key={`${row.stay._id}|${row.key}`}
                          className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm",
                            row.doneBy
                              ? "border-transparent bg-tint-success/60"
                              : "border-border bg-surface",
                          )}
                        >
                          <Checkbox
                            checked={Boolean(row.doneBy)}
                            disabled={!mayTick}
                            onCheckedChange={(next) =>
                              void tick(row.stay._id, row.key, next === true)
                            }
                            aria-label={`${group.label} ${row.stay.petName} selesai`}
                          />
                          <span
                            className={cn(
                              row.doneBy && "text-muted line-through",
                            )}
                          >
                            <b>{row.stay.petName}</b> ·{" "}
                            {row.stay.unitCode ?? row.stay.roomTypeName}
                            {row.detail ? ` · ${row.detail}` : ""}
                          </span>
                          {row.doneBy && (
                            <span className="text-xs font-semibold text-success">
                              {staffName(row.doneBy)}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

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

function StayRows({
  rows,
  empty,
  action,
  today,
  onAct,
}: {
  rows: HotelStayBooking[];
  empty: string;
  action: StayAction;
  today: string;
  onAct: (booking: HotelStayBooking) => void;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((booking) => (
        <li
          key={booking._id}
          className="flex flex-wrap items-center justify-between gap-3 py-2"
        >
          <Link
            href={hotelBookingPath(booking._id)}
            className="min-w-0 rounded text-sm hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <b>{booking.petName}</b> · {booking.customerName}
            <span className="block text-xs text-muted">
              {roomText(booking.stay)} ·{" "}
              {action === "checkin"
                ? `jam ${booking.stay.arrivalTime ?? "—"}`
                : `jemput ${booking.stay.pickupTime ?? "—"}`}
              {action === "checkin" && booking.stay.checkInDate < today
                ? " · belum datang"
                : ""}{" "}
              · {stayBillState(booking).label}
            </span>
          </Link>
          <Can feature="bookings" action="update">
            <Button size="sm" onClick={() => onAct(booking)}>
              {action === "checkin" ? "Check-in" : "Check-out"}
            </Button>
          </Can>
        </li>
      ))}
    </ul>
  );
}
