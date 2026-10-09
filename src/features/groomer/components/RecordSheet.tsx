"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";

import { Alert, Button, TextareaField } from "@/components";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { mediaService } from "@/services/media.service";
import type { SessionMediaKind } from "@/types/api";
import type { GroomerBooking, GroomerSession } from "@/types/groomer";
import { Pill } from "./Pill";

/**
 * Catatan & foto for one turn — a bottom sheet, because a groomer opens it with
 * a wet dog in the other hand and the thumb is at the bottom of the screen.
 *
 * ─── TWO NOTES, AND WHO READS EACH ─────────────────────────────────────────
 * "Catatan hasil" is written to be read by the owner someday (the portal is not
 * built, so for now it is stored); "Catatan internal" is the team's. They are
 * labelled with who reads them, because a groomer deciding what to write needs to
 * know.
 *
 * ─── A PHOTO IS ATTACHED THE MOMENT IT IS UPLOADED ─────────────────────────
 * Not on Simpan. The "after" photo is what lets the turn be closed, and a groomer
 * who took it and then lost signal before pressing Simpan would find it gone and
 * the turn still unclosable. The notes are the only thing Simpan holds.
 *
 * The record route takes the gallery WHOLESALE, so every attach sends the stored
 * photos back with the new one — they arrive from the server complete for exactly
 * this reason.
 */
export function RecordSheet({
  booking,
  session,
  needAfter,
  onClose,
  onChanged,
}: {
  booking: GroomerBooking;
  session: GroomerSession;
  /** Opened because Selesaikan was pressed with no "after" photo. */
  needAfter: boolean;
  onClose: () => void;
  /** The session changed on the server — reload. */
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState(session.notesSession ?? "");
  const [internal, setInternal] = useState(session.notesInternalSession ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<SessionMediaKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* The server's list, reloaded after every attach — the parent hands a fresh `session`. */
  const media = session.media ?? [];
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);

  const afterCount = media.filter((one) => one.kind === "after").length;
  const finished = session.status === "done";

  async function attach(kind: SessionMediaKind, file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(kind);

    try {
      const asset = await mediaService.upload(file, { purpose: "booking" });
      await bookingService.setSessionRecord(booking.bookingId, session.sessionId, {
        media: [...media, { ...asset, kind }],
      });
      swalToast(kind === "after" ? "Foto after ditambahkan" : "Foto ditambahkan");
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Foto gagal diunggah. Coba lagi.");
    } finally {
      setUploading(null);
    }
  }

  async function save() {
    setError(null);
    setSaving(true);

    try {
      await bookingService.setSessionRecord(booking.bookingId, session.sessionId, {
        notesSession: notes.trim() === "" ? null : notes.trim(),
        notesInternalSession: internal.trim() === "" ? null : internal.trim(),
      });
      swalToast("Catatan tersimpan");
      onChanged();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Catatan gagal disimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="top-auto bottom-0 max-h-[90dvh] translate-y-0 gap-0 overflow-y-auto rounded-b-none rounded-t-2xl p-4 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="text-base font-bold">
            {booking.pet.name} · {session.sessionName}
          </DialogTitle>
          <DialogDescription>
            {[booking.pet.breed, booking.pet.size, booking.pet.furType].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-3 space-y-4">
          {needAfter && afterCount === 0 && (
            <Alert variant="warning">
              Foto after belum ada. Ambil fotonya dulu, baru sesi ini bisa diselesaikan.
            </Alert>
          )}
          {error && <Alert variant="error">{error}</Alert>}

          {booking.pet.handling && (
            <div className="rounded-lg bg-tint-warning px-3 py-2 text-sm text-warning">
              <p className="text-xs font-semibold">Catatan penanganan</p>
              {booking.pet.handling}
            </div>
          )}

          <TextareaField
            label="Catatan hasil"
            hint={<Pill tone="success">dibaca pemilik</Pill>}
            rows={3}
            value={notes}
            maxLength={500}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Kondisi yang ditemukan dan hasilnya…"
          />
          <TextareaField
            label="Catatan internal"
            hint={<Pill>tim saja</Pill>}
            rows={3}
            value={internal}
            maxLength={500}
            onChange={(event) => setInternal(event.target.value)}
            placeholder="Cara penanganan, hal yang perlu diingat…"
          />

          <PhotoRow
            title="Foto proses"
            photos={media.filter((one) => one.kind !== "after")}
            busy={uploading === "other"}
            onPick={() => beforeInput.current?.click()}
          />
          <PhotoRow
            title="Foto after"
            badge={
              afterCount > 0 ? (
                <Pill tone="success">ada</Pill>
              ) : (
                <Pill tone="danger">wajib</Pill>
              )
            }
            photos={media.filter((one) => one.kind === "after")}
            busy={uploading === "after"}
            onPick={() => afterInput.current?.click()}
          />

          {/* `capture` opens the camera on a phone and a file picker on a desktop. */}
          <input
            ref={beforeInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              void attach("other", event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <input
            ref={afterInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              void attach("after", event.target.files?.[0]);
              event.target.value = "";
            }}
          />

          <Button fullWidth className="min-h-11" onClick={save} loading={saving}>
            Simpan
          </Button>
          {finished && (
            <p className="text-center text-xs text-muted">
              Sesi ini sudah selesai — catatan dan foto masih bisa dilengkapi.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PhotoRow({
  title,
  badge,
  photos,
  busy,
  onPick,
}: {
  title: string;
  badge?: React.ReactNode;
  photos: { _id: string; url: string; thumbUrl?: string | null; mediumUrl?: string | null }[];
  busy: boolean;
  onPick: () => void;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {title} ({photos.length}) {badge}
      </p>
      <ul className="flex flex-wrap gap-2">
        {photos.map((photo, index) => (
          <li key={photo._id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.thumbUrl ?? photo.mediumUrl ?? photo.url}
              alt={`${title} ${index + 1}`}
              className="size-16 rounded-lg object-cover"
            />
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onPick}
            disabled={busy}
            aria-label={`Tambah ${title.toLowerCase()}`}
            className="flex size-16 items-center justify-center rounded-lg border border-dashed border-border text-muted transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 disabled:opacity-50"
          >
            <Camera className="size-5" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </div>
  );
}
