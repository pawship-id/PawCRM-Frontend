"use client";

import { useState } from "react";

import { Alert, CheckRow, CheckRowGroup, Spinner, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/services/api-error";
import { invalidateBusinessLines } from "@/hooks/useBusinessLines";
import { businessLineService } from "@/services/businessLine.service";
import type { BusinessLine } from "@/services/businessLine.service";
import { swalToast } from "@/lib/swal";
import { useAllocationTargets } from "../hooks/useAllocationTargets";

/** Order-insensitive comparison of two id lists. */
function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const seen = new Set(right);
  return left.every((id) => seen.has(id));
}

/** Backend cap — NAME_MAX_LENGTH in businessLine.model.js. */
const NAME_MAX_LENGTH = 60;

/** What the API accepts: `#RRGGBB`. Shorthand and named colours are refused. */
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * The colour a new line opens on.
 *
 * A REAL VALUE RATHER THAN AN EMPTY FIELD: the API requires a colour, and an
 * empty native colour input reports `#000000` anyway. Navy is the product's
 * working colour, so the default reads as deliberate rather than as something
 * the user forgot.
 */
const DEFAULT_COLOR = "#1A2B4C";

/**
 * Create or edit a line of business.
 *
 * A DIALOG, NOT A ROUTE: two fields do not earn a page, and the common case is
 * adding Grooming, Penitipan and Retail one after another — three round trips
 * through the router to type three words. Keeping the list on screen is also
 * what answers "does this name already exist".
 *
 * This used to cite the category form, which was the same shape. It is not any
 * more: a category gained a description and an image picker, and a form with an
 * uploader in it cannot live in a modal — see CategoryForm for where that line
 * falls. The test is the field count and what the fields DO, not the module.
 *
 * THE COLOUR IS REQUIRED BY THE API and is not decoration: reports render each
 * line in its own colour, and one without would come out as an unlabelled blank.
 * It is a native `<input type="color">` — a control nobody has to be taught —
 * with the hex beside it, because that is the value the API stores and the one
 * somebody matching a brand palette is copying.
 */
export function BusinessLineFormDialog({
  line,
  onClose,
  onSaved,
}: {
  /** Absent to create; present to edit that line. */
  line?: BusinessLine;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = line !== undefined;

  /**
   * The branches this line can be marked as running at.
   *
   * Reused from the chart of accounts rather than fetched again: it is the same
   * two lists, and it fails softly the same way — a refused `branches:read`
   * leaves the section out rather than blocking a rename.
   */
  const { branches } = useAllocationTargets();

  const [name, setName] = useState(line?.name ?? "");
  const [color, setColor] = useState(line?.color ?? DEFAULT_COLOR);
  const [branchIds, setBranchIds] = useState<string[]>(line?.branchIds ?? []);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const trimmed = name.trim();

    if (trimmed === "") {
      setFieldError("Nama lini bisnis wajib diisi.");
      return;
    }
    if (trimmed.length > NAME_MAX_LENGTH) {
      setFieldError(`Maksimal ${NAME_MAX_LENGTH} karakter.`);
      return;
    }
    if (!COLOR_PATTERN.test(color)) {
      setFormError("Warna harus berupa hex 6 digit, misalnya #1A2B4C.");
      return;
    }

    // An empty PATCH body is a 400 (`.min(1)`), so a save that changed nothing
    // closes instead of asking the server to do nothing.
    const renamed = editing && trimmed !== line.name;
    const recoloured = editing && color !== line.color;
    // Compared as SETS, not as arrays: ticking a box and unticking it leaves a
    // different order and the same meaning, and a PATCH for that would be a
    // write nobody asked for.
    const remapped =
      editing && !sameIds(branchIds, line.branchIds ?? []);
    if (editing && !renamed && !recoloured && !remapped) {
      onClose();
      return;
    }

    setBusy(true);
    setFieldError(null);
    setFormError(null);

    try {
      if (editing) {
        await businessLineService.update(line._id, {
          ...(renamed ? { name: trimmed } : {}),
          ...(recoloured ? { color } : {}),
          ...(remapped ? { branchIds } : {}),
        });
      } else {
        await businessLineService.create({ name: trimmed, color, branchIds });
      }
      /* Opsi Varian's "Lini bisnis" reads the shared list — refresh it. */
      invalidateBusinessLines();
      onSaved();
      swalToast(
        editing ? "Lini bisnis diperbarui." : `Lini bisnis ${trimmed} dibuat.`,
      );
      onClose();
    } catch (error) {
      // A name clash belongs on the field it is about; anything else is a
      // banner, because retyping the name would not fix it.
      if (error instanceof ApiError && error.status === 409) {
        setFieldError(
          `Nama "${trimmed}" sudah dipakai lini bisnis lain. Lini yang sudah dihapus juga masih memegang namanya sampai dipulihkan.`,
        );
      } else {
        setFormError(
          error instanceof ApiError
            ? error.message
            : "Terjadi kesalahan. Coba lagi.",
        );
      }
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Ubah lini bisnis" : "Lini bisnis baru"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Perubahan berlaku untuk laporan ke depan. Akun yang sudah menunjuk lini ini ikut namanya yang baru."
                : "Unit usaha yang laba ruginya dibaca terpisah — misalnya Grooming, Penitipan, atau Retail."}
            </DialogDescription>
          </DialogHeader>

          {formError && <Alert variant="error">{formError}</Alert>}

          <TextField
            label="Nama lini bisnis"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldError(null);
            }}
            error={fieldError ?? undefined}
            placeholder="mis. Grooming"
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            required
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="business-line-color">Warna</Label>
            <div className="flex items-center gap-3">
              <input
                id="business-line-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                disabled={busy}
                className="h-10 w-14 cursor-pointer rounded-md border border-border bg-surface p-1 outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <span className="text-sm text-muted uppercase tabular-nums">
                {color}
              </span>
            </div>
            <p className="text-xs text-muted">
              Dipakai untuk menandai lini ini di laporan laba rugi.
            </p>
          </div>

          {/* Left out entirely when there is one branch — a checklist with one
              box that means the same thing ticked or not is a question with no
              answer. */}
          {branches.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label>Cabang yang menjalankan lini ini</Label>
              <p className="text-xs text-muted">
                Dipakai untuk membagi beban bersama: biaya yang dialokasikan
                Shared-Lokasi hanya masuk ke lini-lini yang aktif di cabang
                tempat transaksinya dicatat.{" "}
                <span className="font-medium text-foreground">
                  Kosongkan semua kalau lini ini ada di semua cabang.
                </span>
              </p>
              <CheckRowGroup className="rounded-xl border border-border px-3">
                {branches.map((branch) => (
                  <CheckRow
                    key={branch._id}
                    label={branch.name}
                    checked={branchIds.includes(branch._id)}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      setBranchIds((previous) =>
                        checked
                          ? [...previous, branch._id]
                          : previous.filter((id) => id !== branch._id),
                      )
                    }
                  />
                ))}
              </CheckRowGroup>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner size={16} />}
              {editing ? "Simpan" : "Buat lini bisnis"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
