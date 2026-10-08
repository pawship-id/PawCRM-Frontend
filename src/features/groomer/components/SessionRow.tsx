"use client";

import Link from "next/link";
import { Play, Square, StickyNote, Users } from "lucide-react";

import { Button } from "@/components";
import { cn } from "@/lib/utils";
import type { GroomerSession } from "@/types/groomer";
import { clock, minutesBetween, stopwatch } from "../dates";
import { Pill } from "./Pill";

const STATUS: Record<GroomerSession["status"], { tone: "neutral" | "warning" | "success"; label: string }> = {
  pending: { tone: "neutral", label: "Belum mulai" },
  in_progress: { tone: "warning", label: "Berjalan" },
  done: { tone: "success", label: "Selesai" },
};

/**
 * ONE SESSION of a booking, as a row — the same on a card and on the detail
 * screen. WHO does what is per session, so each row says whose it is, how it
 * stands, and offers only what THIS groomer may do to it.
 *
 * A session that is somebody else's has no control at all, not even a disabled
 * one: nothing a groomer could do there, and a dead button invites pressing it.
 *
 * `onRecord` is the way to the notes and photos. On a card it goes to the detail
 * screen; on the detail screen it opens the sheet.
 */
export function SessionRow({
  session,
  now,
  busy,
  showClaim,
  onStart,
  onFinish,
  onClaim,
  onRecord,
  recordLabel = "Catatan & foto",
  linkTo,
}: {
  session: GroomerSession;
  now: number;
  busy: boolean;
  /** Offer "Ambil" on a session nobody holds — only the Open Job tab does. */
  showClaim: boolean;
  onStart: () => void;
  onFinish: () => void;
  onClaim: () => void;
  onRecord: () => void;
  recordLabel?: string;
  /** On a card the record control is a link to the detail screen, not a button. */
  linkTo?: string;
}) {
  const running = session.status === "in_progress";
  const done = session.status === "done";
  const elapsedSeconds =
    running && session.startedAt ? (now - new Date(session.startedAt).getTime()) / 1000 : 0;
  const over =
    running && session.estimateMin != null ? Math.floor(elapsedSeconds / 60) - session.estimateMin : 0;
  const took =
    done && session.startedAt && session.finishedAt
      ? minutesBetween(session.startedAt, session.finishedAt)
      : null;
  const late = took != null && session.estimateMin != null ? took - session.estimateMin : null;
  const status = STATUS[session.status];

  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-3",
        running ? "border-secondary bg-surface ring-2 ring-secondary/25" : "border-border bg-background",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{session.sessionName}</p>
          <p className="text-xs text-muted tabular-nums">
            {session.estimateMin != null ? `${session.estimateMin} mnt` : "—"}
            {took != null && ` · ${took} mnt`}
            {session.startedAt && session.finishedAt && ` · ${clock(session.startedAt)}–${clock(session.finishedAt)}`}
          </p>
        </div>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>

      {session.others.length > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <Users className="size-3.5" aria-hidden="true" />
          {session.mine ? "Bersama" : "Dipegang"} {session.others.join(", ")}
        </p>
      )}
      {!session.mine && session.open && (
        <p className="mt-1 text-xs text-muted">Belum ada groomer</p>
      )}

      {running && (
        <p className="mt-2 text-center">
          <span className="block text-2xl font-bold tabular-nums text-warning">{stopwatch(elapsedSeconds)}</span>
          <span className="text-xs text-muted">
            berjalan{session.estimateMin != null && ` · estimasi ${session.estimateMin} mnt`}
            {over > 0 && ` · lewat ${over} mnt`}
          </span>
        </p>
      )}
      {late != null && (
        <p className="mt-2">
          {late > 0 ? <Pill tone="danger">+{late} mnt dari estimasi</Pill> : <Pill tone="success">Tepat waktu</Pill>}
        </p>
      )}

      {session.mine && (
        <div className="mt-3 flex flex-wrap gap-2">
          {session.status === "pending" && (
            <Button className="min-h-11 flex-1" onClick={onStart} loading={busy} disabled={!session.canStart}>
              <Play className="size-4" aria-hidden="true" />
              Mulai
            </Button>
          )}
          {running && (
            <Button
              className="min-h-11 flex-1 bg-secondary text-secondary-foreground hover:bg-secondary-hover"
              onClick={onFinish}
              loading={busy}
            >
              <Square className="size-4" aria-hidden="true" />
              Selesaikan
            </Button>
          )}
          {linkTo ? (
            <Link
              href={linkTo}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border-[1.5px] border-primary/40 bg-surface px-3 text-sm font-medium text-primary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60"
            >
              <StickyNote className="size-4" aria-hidden="true" />
              {recordLabel}
            </Link>
          ) : (
            <Button variant="secondary" className="min-h-11 flex-1" onClick={onRecord}>
              <StickyNote className="size-4" aria-hidden="true" />
              {recordLabel}
            </Button>
          )}
        </div>
      )}
      {session.mine && session.status === "pending" && session.startBlock && (
        <p className="mt-2 text-xs text-muted">{session.startBlock}</p>
      )}

      {!session.mine && session.open && showClaim && (
        <Button fullWidth className="mt-3 min-h-11" onClick={onClaim} loading={busy}>
          Ambil sesi ini
        </Button>
      )}
    </li>
  );
}
