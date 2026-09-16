"use client";

import { useRef, useState } from "react";
import { ImagePlus, UserRound } from "lucide-react";

import { Alert, Card, SelectField, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { mediaService } from "@/services/media.service";
import type { AlbumMediaKind, Booking } from "@/types/api";

/**
 * THE BOOKING'S PHOTOGRAPHS FROM THIS VISIT, IN ONE PLACE.
 *
 * ─── ITS OWN ARRAY, NOT A VIEW OVER THE TURNS ─────────────────────────────
 *
 * A turn's photos (`service.sessions[].media[]`) are evidence for that stretch
 * of work and live beside its clock and its crew. This card is `booking.media`:
 * what the dog came in like, what it left like, and everything else — the way a
 * visit is actually looked back at. Which button somebody pressed decides where
 * a photo lands.
 */

const SECTIONS: { kind: AlbumMediaKind; title: string; empty: string }[] = [
  { kind: "before", title: "Foto Before", empty: "Belum ada foto before" },
  { kind: "after", title: "Foto After", empty: "Belum ada foto after" },
  { kind: "other", title: "Foto Lainnya", empty: "Belum ada foto lainnya" },
];

export function SessionAlbum({
  booking,
  onChanged,
}: {
  booking: Booking;
  onChanged: (booking: Booking) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [kind, setKind] = useState<AlbumMediaKind>("before");
  const [note, setNote] = useState("");
  /*
    ⚠️ THE FILE IS HELD, NOT SENT ON PICK.

    It used to upload the moment somebody chose one, which made "Pilih foto" the
    save button in disguise: the kind and the note were already typed, so the act
    was finished by a control that read as the start of one, and there was no way
    back short of deleting the photo afterwards. Now the dialog collects three
    answers and `Simpan` commits all three.
  */
  const [chosen, setChosen] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  /*
    ⚠️ THE BOOKING'S OWN ARRAY, AND ONLY IT — nothing to filter.

    THIS REPLACED A HACK. The album had no home of its own, so it wrote into the
    FIRST session and told its photos apart by a `kind` prefix — a visit photo
    living inside a bath, which would have gone with the turn the day somebody
    deleted it.
  */
  const photos = booking.media ?? [];

  function close() {
    if (busy) return;
    setAsking(false);
    setNote("");
    setKind("before");
    setChosen(null);
    setError(null);
    if (file.current) file.current.value = "";
  }

  async function submit() {
    if (!chosen) return;

    setBusy(true);
    setError(null);

    try {
      /*
        ─── TWO STEPS, IN THIS ORDER, AND THE FIRST IS NOT OURS ───────────────

        The bytes go to STORAGE first — local disk, GCS or Cloudinary, whichever
        this tenant is on — and that call answers with the url, the storage key,
        the driver and the derivatives. Only then is that answer written to the
        database beside the kind and the note.

        ⚠️ THE ORDER IS LOAD-BEARING. Writing the row first would store a url for
        bytes that may never arrive; failing here leaves an unreferenced object
        in the bucket instead, which `sweepOrphanMedia` is built to collect.
      */
      const asset = await mediaService.upload(chosen, { purpose: "booking" });

      /*
        THE WHOLE ALBUM GOES BACK — the API takes the list, not a delta — so the
        photos already in it have to travel with the new one or they are
        deleted. `uploadedByName` is resolved on read and must not return.
      */
      const existing = photos.map(({ uploadedByName: _name, ...rest }) => rest);

      onChanged(
        await bookingService.setMedia(booking._id, [
          ...existing,
          { ...asset, kind, alt: note.trim() || null },
        ]),
      );

      close();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? (caught.reason ?? caught.message)
          : "Fotonya gagal diunggah. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Album"
      action={
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">{photos.length} foto</span>

          {/*
            ⚠️ ONE BUTTON, NOT ONE PER SECTION. Three "Upload Before / After /
            Other" buttons put the same act on the screen three times and still
            leave the note to be typed afterwards; one button that ASKS collects
            both answers in the same breath, which is also the only moment
            somebody actually knows them.
          */}
          <Can feature="bookings" action="update">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAsking(true)}
            >
              <ImagePlus className="size-4" aria-hidden />
              Tambah foto
            </Button>
          </Can>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {SECTIONS.map((section) => {
          const rows = photos.filter((photo) => photo.kind === section.kind);

          return (
            <section key={section.kind} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold">{section.title}</h3>
                {rows.length > 0 && (
                  <span className="text-xs text-muted">{rows.length}</span>
                )}
              </div>

              {/*
                ⚠️ EVERY SECTION IS DRAWN, EMPTY OR NOT. An album that hid its
                "after" heading until somebody had taken one would answer "has
                anybody photographed the finished cut?" by saying nothing at all
                — and a missing heading reads as a page that failed to load, not
                as an answer.
              */}
              {rows.length === 0 ? (
                <p className="text-sm text-muted italic">{section.empty}</p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {rows.map((photo) => (
                    <li
                      key={photo._id ?? photo.storageKey}
                      className="flex flex-col gap-1"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.mediumUrl ?? photo.thumbUrl ?? photo.url}
                        alt={photo.alt ?? section.title}
                        className="aspect-square w-full rounded-xl border border-border object-cover"
                      />

                      {/* "Tanpa catatan" rather than a blank line: an empty slot
                          reads as a caption that failed to load. */}
                      <p className="truncate text-xs text-muted">
                        {photo.alt || "Tanpa catatan"}
                      </p>

                      <p className="flex min-w-0 items-center gap-1 text-xs text-muted">
                        <UserRound className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">
                          {photo.uploadedByName ?? "Tidak tercatat"}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {asking && (
        <Dialog open onOpenChange={(open) => !open && close()}>
          <DialogContent showCloseButton={!busy}>
            <DialogHeader>
              <DialogTitle>Tambah foto album</DialogTitle>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              {error && <Alert variant="error">{error}</Alert>}

              <SelectField
                label="Jenis foto"
                value={kind}
                disabled={busy}
                options={SECTIONS.map((section) => ({
                  value: section.kind,
                  label: section.title.replace(/^Foto /, ""),
                }))}
                onChange={(value) => setKind(value as AlbumMediaKind)}
              />

              {/*
                ⚠️ THE PICKER IS A FIELD, DIRECTLY UNDER THE KIND — not a button
                in the footer. A footer button reads as "finish this", and one
                that opened a file dialog instead put the last question in the
                place the answer belongs.
              */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="album-photo"
                  className="text-sm font-medium text-foreground"
                >
                  Gambar
                </label>

                <input
                  id="album-photo"
                  ref={file}
                  type="file"
                  accept="image/*,video/*"
                  disabled={busy}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none file:mr-3 file:rounded-md file:border-0 file:bg-surface-hover file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onChange={(event) =>
                    setChosen(event.target.files?.[0] ?? null)
                  }
                />
              </div>

              <TextField
                label="Catatan foto"
                value={note}
                disabled={busy}
                placeholder="Misal: kusut di leher"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            <DialogFooter>
              <Button variant="secondary" disabled={busy} onClick={close}>
                Batal
              </Button>
              {/*
                DISABLED UNTIL THERE IS A FILE, and the reason is on the button
                rather than in an error afterwards: a save that fails because
                nothing was chosen is a rule somebody learns by tripping over it.
              */}
              <Button disabled={busy || !chosen} onClick={() => void submit()}>
                {busy ? "Menyimpan…" : "Simpan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
