"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StatTile } from "@/components";
import { hotelStayService } from "@/services/hotel.service";
import type { HotelStayBooking, HotelTasks } from "@/types/api";

import { HOTEL_PATH } from "../paths";
import { addDays, isNight } from "../stay";

/**
 * The hotel's day, on Booking › Kalender (21 November 2026, PLAN-Hotel-V1.md
 * §4.5): who arrives, who goes home, who sleeps over, and how much of the
 * checklist is done. A stay is not a slot on a groomer's timeline, so it is a
 * strip above the grid rather than a column in it. Renders nothing on a day the
 * hotel has nobody.
 */
export function HotelDayStrip({
  date,
  branchId,
}: {
  date: string;
  branchId?: string | null;
}) {
  const [stays, setStays] = useState<HotelStayBooking[]>([]);
  const [tasks, setTasks] = useState<HotelTasks | null>(null);

  useEffect(() => {
    let active = true;
    const branchIds = branchId ? [branchId] : undefined;
    Promise.all([
      hotelStayService.list({
        from: addDays(date, -1),
        to: addDays(date, 1),
        branchIds,
        statuses: ["confirmed", "in_progress", "completed"],
      }),
      hotelStayService.tasks({ date, branchIds }),
    ])
      .then(([list, today]) => {
        if (!active) return;
        setStays(list.items);
        setTasks(today);
      })
      .catch(() => {
        if (active) {
          setStays([]);
          setTasks(null);
        }
      });
    return () => {
      active = false;
    };
  }, [date, branchId]);

  const arriving = stays.filter(
    (booking) => booking.stay.checkInDate === date,
  ).length;
  const leaving = stays.filter(
    (booking) => booking.stayFacts.end === date,
  ).length;
  const sleeping = stays.filter((booking) =>
    isNight(booking.stay, date),
  ).length;
  const items = (tasks?.stays ?? []).flatMap((stay) => stay.items);
  const done = items.filter((item) => item.doneBy).length;

  if (arriving + leaving + sleeping === 0) return null;

  return (
    <section aria-label="Hotel hari ini" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Hotel</h2>
        <Link
          href={HOTEL_PATH}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Buka ringkasan hotel →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Datang" value={String(arriving)} caption="hewan" />
        <StatTile label="Pulang" value={String(leaving)} caption="hewan" />
        <StatTile
          label="Menginap malam ini"
          value={String(sleeping)}
          caption="hewan"
        />
        <StatTile
          label="Tugas selesai"
          value={items.length ? `${done}/${items.length}` : "—"}
          caption="checklist hari ini"
        />
      </div>
    </section>
  );
}
