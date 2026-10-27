"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components";
import { homeTripConfirmCopy } from "@/features/booking/homeTrip";
import type { HomeTripStatus } from "@/types/api";

/**
 * ─── WHICH TAPS ASK FIRST (27 October 2026) ─────────────────────────────────
 *
 * §9: an act the groomer cannot take back by themselves asks for an explicit
 * yes. On this app that is:
 *
 *   · "Ambil sesi ini" — the session leaves every other groomer's list, and only
 *     an admin can hand it back.
 *   · "Selesaikan" — the stopwatch stops and the turn counts as done (commission
 *     reads it); reopening it is an admin's job.
 *   · "Hewan sudah datang" — moves the BOOKING's status, which nobody walks back.
 *   · The home-visit trip (Berangkat, Sampai di rumah, Pulang, Sampai di toko) —
 *     forward only, each rung stamped with the hour, and the next rung's button
 *     appears IN THE SAME PLACE, so a double tap would otherwise record two.
 *
 * "MULAI" DOES NOT ASK. It is pressed for every session, all day; it only starts
 * the groomer's own stopwatch (the booking is already In Progress — `canStart`
 * waits for that), and a session started too early is put back by the server's
 * `in_progress → pending` move, not a record somebody else relies on. A dialog on
 * the most frequent tap in the app is the one people learn to dismiss blind.
 */
export interface GroomerAsk {
  title: string;
  body: string;
  confirmLabel: string;
  run: () => Promise<void>;
}

/** One pending question per screen, and the dialog that asks it. */
export function useGroomerConfirm() {
  const [ask, setAsk] = useState<GroomerAsk | null>(null);
  const [busy, setBusy] = useState(false);

  const dialog = ask ? (
    <ConfirmDialog
      title={ask.title}
      confirmLabel={ask.confirmLabel}
      busy={busy}
      touch
      onCancel={() => setAsk(null)}
      onConfirm={async () => {
        setBusy(true);
        try {
          // `run` toasts its own success or refusal and reloads the screen.
          await ask.run();
        } finally {
          setBusy(false);
          setAsk(null);
        }
      }}
    >
      {ask.body}
    </ConfirmDialog>
  ) : null;

  return { confirm: setAsk, dialog };
}

const who = (petName: string | null) => petName ?? "hewan ini";

export function claimAsk(sessionName: string, petName: string | null, run: () => Promise<void>): GroomerAsk {
  return {
    title: "Ambil sesi ini?",
    body: `${sessionName} untuk ${who(petName)} jadi tugas Anda dan hilang dari daftar groomer lain. Kalau batal, minta admin melepasnya.`,
    confirmLabel: "Ambil sesi",
    run,
  };
}

export function finishAsk(sessionName: string, petName: string | null, run: () => Promise<void>): GroomerAsk {
  return {
    title: "Selesaikan sesi?",
    body: `${sessionName} untuk ${who(petName)} ditandai selesai dan stopwatch berhenti. Kalau ternyata belum, minta admin membukanya lagi.`,
    confirmLabel: "Selesaikan sesi",
    run,
  };
}

export function arriveAsk(petName: string | null, run: () => Promise<void>): GroomerAsk {
  return {
    title: "Hewan sudah datang?",
    body: `${petName ?? "Hewan ini"} dicatat sudah datang, dengan jam sekarang. Ini tidak bisa dibatalkan dari aplikasi groomer.`,
    confirmLabel: "Tandai sudah datang",
    run,
  };
}

export function tripAsk(to: HomeTripStatus, run: () => Promise<void>): GroomerAsk {
  return { ...homeTripConfirmCopy(to), run };
}
