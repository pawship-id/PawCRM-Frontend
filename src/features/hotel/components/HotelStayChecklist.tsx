"use client";

import { useState } from "react";

import { SelectField } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { hotelStayService } from "@/services/hotel.service";
import type { HotelSettings, HotelStayBooking } from "@/types/api";

import { useHotelStaff } from "../hooks/useHotelStaff";
import { dayItems, isNight, shortDate, stayDays } from "../stay";

/**
 * A stay's daily checklist (21 November 2026, PLAN-Hotel-V1.md §4.2): a tab per
 * day, the day's PIC, and each task — the tahapan at their clock times, the
 * medicine, and the add-ons staff do. Under `night_pic` a step is the PIC's;
 * an add-on (and every step under `by_step`) names who did it.
 */
export function HotelStayChecklist({
  booking,
  split,
  mayTick,
  onChanged,
}: {
  booking: HotelStayBooking;
  split: HotelSettings["commission"]["split"];
  mayTick: boolean;
  onChanged: (updated: HotelStayBooking) => void;
}) {
  const today = booking.stayFacts.today;
  const days = stayDays(booking.stay);
  const [day, setDay] = useState(() =>
    days.includes(today) ? today : (days[days.length - 2] ?? days[0]),
  );
  const [busy, setBusy] = useState(false);
  const { staff, nameOf } = useHotelStaff(day);

  if (booking.status === "confirmed") {
    return (
      <p className="text-sm text-muted">
        Checklist harian muncul setelah hewan check-in.
      </p>
    );
  }
  if (booking.status === "cancelled")
    return <p className="text-sm text-muted">Booking dibatalkan.</p>;

  const recorded = booking.stay.days.find((one) => one.date === day);
  const done = new Map((recorded?.tasks ?? []).map((task) => [task.key, task]));
  const items = dayItems(booking, day);
  const future = day > today;
  const locked = future || !mayTick || busy;
  const staffOptions = staff.map((row) => ({
    value: row._id,
    label: row.fullName,
    disabled: Boolean(row.offReason),
  }));

  async function save(body: Parameters<typeof hotelStayService.setDay>[2]) {
    setBusy(true);
    try {
      onChanged(await hotelStayService.setDay(booking._id, day, body));
    } catch (error) {
      swalToast(
        error instanceof ApiError
          ? (error.reason ?? error.fullMessage)
          : "Belum tersimpan. Coba lagi.",
        "error",
        6000,
      );
    } finally {
      setBusy(false);
    }
  }

  const needsWho = (kind: string) => kind === "addon" || split === "by_step";

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        role="tablist"
        aria-label="Hari menginap"
      >
        {days.map((date, index) => {
          const its = dayItems(booking, date);
          const ticked = (
            booking.stay.days.find((one) => one.date === date)?.tasks ?? []
          ).length;
          return (
            <button
              key={date}
              type="button"
              role="tab"
              aria-selected={date === day}
              onClick={() => setDay(date)}
              className={cn(
                "flex min-w-24 flex-none flex-col items-start rounded-xl border px-3 py-2 text-left transition focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                date === day
                  ? "border-primary bg-surface-selected"
                  : "border-border bg-surface",
                date > today && "opacity-70",
              )}
            >
              <span className="text-sm font-semibold">Hari {index + 1}</span>
              <span className="text-xs text-muted tabular-nums">
                {shortDate(date)}
              </span>
              <span className="text-xs font-semibold text-primary tabular-nums">
                {isNight(booking.stay, date)
                  ? date > today
                    ? `${its.length} tugas`
                    : `${ticked}/${its.length}`
                  : "Pulang"}
              </span>
            </button>
          );
        })}
      </div>

      {isNight(booking.stay, day) && split === "night_pic" && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-tint-warning/40 p-3">
          <SelectField
            label="PIC hari ini"
            value={recorded?.picUserId ?? ""}
            onChange={(picUserId) =>
              void save({ picUserId: picUserId || null })
            }
            options={staffOptions}
            placeholder="Pilih staf…"
            disabled={locked}
            className="min-w-56"
          />
          <span className="pb-3 text-xs text-muted">
            Komisi malam {shortDate(day)} untuk PIC ini.
          </span>
        </div>
      )}

      {!isNight(booking.stay, day) ? (
        <p className="text-sm text-muted">
          Hari pulang — tidak ada kegiatan harian.
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">
          Layanan ini belum punya tahapan. Tambahkan di Layanan &amp; Harga.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {items.map((item) => {
            const task = done.get(item.key);
            return (
              <li
                key={item.key}
                className={cn(
                  "flex flex-wrap items-center gap-3 px-4 py-2",
                  task && "bg-tint-success/40",
                )}
              >
                <span className="w-14 flex-none text-sm font-semibold tabular-nums text-muted">
                  {item.time ?? "—"}
                </span>
                <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 text-sm">
                  <Checkbox
                    checked={Boolean(task)}
                    disabled={locked || (needsWho(item.kind) && !task)}
                    onCheckedChange={(next) =>
                      void save({
                        task: { key: item.key, done: next === true },
                      })
                    }
                    aria-label={`${item.label} selesai`}
                  />
                  <span className={cn(task && "text-muted line-through")}>
                    {item.label}
                    {item.detail && (
                      <span className="text-muted"> · {item.detail}</span>
                    )}
                  </span>
                  {item.kind === "addon" && (
                    <Badge
                      variant="outline"
                      className="border-transparent bg-tint-brand text-primary"
                    >
                      Add-on
                    </Badge>
                  )}
                </label>
                {needsWho(item.kind) ? (
                  <SelectField
                    label={`Siapa yang mengerjakan ${item.label}`}
                    value={task?.doneBy ?? ""}
                    onChange={(doneBy) =>
                      void save({
                        task: doneBy
                          ? { key: item.key, done: true, doneBy }
                          : { key: item.key, done: false },
                      })
                    }
                    options={staffOptions}
                    placeholder="Siapa?"
                    disabled={locked}
                    className="w-48 [&_label]:sr-only"
                  />
                ) : (
                  task && (
                    <span className="text-xs text-muted">
                      oleh {nameOf(task.doneBy)}
                    </span>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
      {future && (
        <p className="text-xs text-muted">
          Hari ini belum tiba — belum bisa dicentang.
        </p>
      )}
    </div>
  );
}
