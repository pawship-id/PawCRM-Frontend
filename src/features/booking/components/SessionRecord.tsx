"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2, UserRound } from "lucide-react";

import { Alert, TextareaField } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { mediaService } from "@/services/media.service";
import type {
  Booking,
  BookingSession,
  SessionMedia,
  SessionMediaKind,
} from "@/types/api";

/** Mirrors MAX_SESSION_MEDIA in bookingItem.model.js. */
const MAX_MEDIA = 9;

/**
 * ─── WHAT A PHOTO IS A PHOTO OF ────────────────────────────────────────────
 *
 * ⚠️ THE STORED VALUES ARE ENGLISH AND THE LABELS ARE NOT, and that is the
 * opposite of the booking STATUS names (ui-rules §12, the one exception). The
 * exception was granted because the shop SAYS those words out loud —
 * "bookingnya masih requested". Nobody says "kindnya other"; they say sebelum
 * and sesudah. So this is an ordinary enum with ordinary Bahasa labels.
 */
const KIND_LABELS: Record<SessionMediaKind, string> = {
  before: "Sebelum",
  after: "Sesudah",
  other: "Lainnya",
};

const KIND_TONES: Record<SessionMediaKind, string> = {
  before: "bg-tint-info text-info",
  after: "bg-tint-success text-success",
  other: "bg-tint-neutral text-muted",
};

/**
 * WHAT HAPPENED ON ONE TURN — its two notes and its photographs.
 *
 * ─── WHY THIS IS NOT PART OF `SessionCrew` ─────────────────────────────────
 *
 * They close at different moments. The crew is ARRANGED and shuts the instant a
 * turn is marked done (a finished turn's crew is a record, not a setting); the
 * record is WRITTEN DOWN, and the "after" shot is taken last of all. One
 * component would need one of the two rules to be wrong.
 *
 * ─── THE NOTES SAVE ON BLUR, THE GALLERY SAVES ON THE ACT ──────────────────
 *
 * A note is prose somebody is still typing, so saving per keystroke would be a
 * request per letter and a half-sentence stored if the tab closed. A photo
 * added, re-labelled or removed is a finished act with nothing to wait for.
 */
export function SessionRecord({
  bookingId,
  session,
  onChanged,
}: {
  bookingId: string;
  session: BookingSession;
  onChanged: (booking: Booking) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  /*
    THE BOXES ARE LOCAL WHILE SOMEBODY TYPES, then saved on blur. Reading them
    straight off `session` would make every keystroke a controlled round trip.
  */
  const [notes, setNotes] = useState(session.notesSession ?? "");
  const [internal, setInternal] = useState(session.notesInternalSession ?? "");

  const media = session.media ?? [];

  async function save(
    patch: Parameters<typeof bookingService.setSessionRecord>[2],
  ) {
    setBusy(true);
    setError(null);

    try {
      onChanged(
        await bookingService.setSessionRecord(
          bookingId,
          session.sessionId,
          patch,
        ),
      );
      return true;
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.reason ?? caught.message)
          : "Tidak bisa disimpan. Coba lagi.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  /*
    ⚠️ THE GALLERY IS SENT WHOLESALE, so every write rebuilds the list from what
    is on screen. `token` is absent on anything already stored — the API only
    demands it of an asset it has not seen — and `uploadedByName` is a read-side
    field that must not travel back.
  */
  const asPayload = (rows: SessionMedia[]) =>
    rows.map(({ uploadedByName: _name, ...asset }) => asset);

  async function upload(chosen: File) {
    setUploading(true);
    setError(null);

    try {
      const asset = await mediaService.upload(chosen, { purpose: "booking" });

      /*
        ⚠️ `other` ON ARRIVAL, never a guess. A shot taken mid-groom is neither
        a before nor an after, and picking one for somebody produces a gallery
        whose labels are wrong. It is re-labelled in one click below.
      */
      await save({
        media: [...asPayload(media), { ...asset, kind: "other" as const }],
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.reason ?? caught.message)
          : "Fotonya gagal diunggah. Coba lagi.",
      );
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }

  const replace = (index: number, changed: Partial<SessionMedia>) =>
    save({
      media: asPayload(
        media.map((row, at) => (at === index ? { ...row, ...changed } : row)),
      ),
    });

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert variant="error">{error}</Alert>}

      <Can
        feature="bookings"
        action="update"
        fallback={
          <>
            {session.notesSession && (
              <p className="text-sm text-foreground">{session.notesSession}</p>
            )}
            <Gallery media={media} />
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {/*
            TWO NOTES, LABELLED BY AUDIENCE. The model keeps them apart so that
            "galak" cannot be read as a standing fact when it happened once —
            and a screen that showed them as one box would undo exactly that.
          */}
          <TextareaField
            label="Catatan sesi"
            hint="Boleh dibaca pemilik"
            value={notes}
            rows={2}
            disabled={busy}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() =>
              notes !== (session.notesSession ?? "") &&
              void save({ notesSession: notes })
            }
          />

          <TextareaField
            label="Catatan internal"
            hint="Untuk yang pegang berikutnya"
            value={internal}
            rows={2}
            disabled={busy}
            onChange={(event) => setInternal(event.target.value)}
            onBlur={() =>
              internal !== (session.notesInternalSession ?? "") &&
              void save({ notesInternalSession: internal })
            }
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              Foto
            </p>
            <span className="text-xs text-muted">
              {media.length} dari {MAX_MEDIA}
            </span>
          </div>

          {media.length === 0 && (
            <p className="text-sm text-muted">
              Belum ada foto di sesi ini. Tambah yang pertama →
            </p>
          )}

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {media.map((row, index) => (
              <li
                key={row._id ?? row.storageKey}
                className="flex flex-col gap-2 rounded-xl border border-border p-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.thumbUrl ?? row.mediumUrl ?? row.url}
                  alt={row.alt ?? `Foto ${KIND_LABELS[row.kind]}`}
                  className="h-32 w-full rounded-lg object-cover"
                />

                <input
                  aria-label={`Catatan foto ${index + 1}`}
                  placeholder="Catatan foto…"
                  defaultValue={row.alt ?? ""}
                  disabled={busy}
                  className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onBlur={(event) =>
                    event.target.value !== (row.alt ?? "") &&
                    void replace(index, { alt: event.target.value || null })
                  }
                />

                <div className="flex items-center gap-2">
                  {/*
                    ⚠️ A LABEL, NOT A PICKER — the shop's decision.

                    A photo taken on a turn is filed as `other` and stays there;
                    nobody is asked to classify a shot while they are holding a
                    wet dog, which is exactly when the wrong answer gets picked.

                    THE BADGE IS BACK BECAUSE THE SELECT WAS BOTH. With the
                    picker gone nothing else on the tile says what the photo is,
                    and `before` / `after` do still occur — on data written
                    before this decision, and if another screen ever sets them.
                  */}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_TONES[row.kind]}`}
                  >
                    {KIND_LABELS[row.kind]}
                  </span>

                  {/*
                    WHO TOOK IT. Read from `uploadedByName`, which the API
                    resolves — `uploadedBy` is an id and answers this with
                    nothing. "Tidak tercatat" rather than a blank: an empty slot
                    reads as a field that failed to load.
                  */}
                  <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
                    <UserRound className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">
                      {row.uploadedByName ?? "Tidak tercatat"}
                    </span>
                  </span>

                  <button
                    type="button"
                    aria-label={`Hapus foto ${index + 1}`}
                    disabled={busy}
                    className="ml-auto inline-flex size-7 items-center justify-center rounded-md text-muted transition hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    onClick={() =>
                      void save({
                        media: asPayload(media.filter((_, at) => at !== index)),
                      })
                    }
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {media.length < MAX_MEDIA && (
            <div>
              <input
                ref={file}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  if (chosen) void upload(chosen);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy || uploading}
                onClick={() => file.current?.click()}
              >
                <ImagePlus className="size-4" aria-hidden />
                {uploading ? "Mengunggah…" : "Tambah foto"}
              </Button>
            </div>
          )}
        </div>
      </Can>
    </div>
  );
}

/** The read-only view: a role that may not edit still sees the work. */
function Gallery({ media }: { media: SessionMedia[] }) {
  if (media.length === 0) return null;

  return (
    <ul className="grid gap-2 sm:grid-cols-3">
      {media.map((row) => (
        <li key={row._id ?? row.storageKey} className="flex flex-col gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={row.thumbUrl ?? row.mediumUrl ?? row.url}
            alt={row.alt ?? `Foto ${KIND_LABELS[row.kind]}`}
            className="h-24 w-full rounded-lg object-cover"
          />
          <span className="text-xs text-muted">
            {KIND_LABELS[row.kind]}
            {row.uploadedByName ? ` · ${row.uploadedByName}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
