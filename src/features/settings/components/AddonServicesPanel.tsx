"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Plus, X } from "lucide-react";

import { Alert, ConfirmDialog, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DraftSaveBar } from "@/features/grooming/components/DraftSaveBar";
import { serviceEditPath } from "@/features/grooming/serviceDisplay";
import {
  durationValue,
  priceDigits,
  priceText,
} from "@/features/grooming/serviceVariantDraft";
import { Can, usePermissions } from "@/features/permissions";
import {
  formatDurationRange,
  serviceDurationBounds,
} from "@/features/services/format";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import type { Service, ServiceStep, UpdateServiceInput } from "@/types/api";

import type { UseAddonServiceListResult } from "../hooks/useAddonServiceList";
import { byStepOrder } from "../serviceSteps";

/** The service form for an add-on — no Jenis layanan field, saved as `addon`. */
const NEW_SERVICE_PATH = "/dashboard/master/layanan/new?jenis=addon";

/** Radix Select forbids `value=""`, so "no tahapan" needs a word of its own. */
const NO_STEP = "none";

/** One row as the boxes hold it. Price and duration are the text typed. */
interface RowDraft {
  price: string;
  duration: string;
  stepId: string;
  commissionable: boolean;
  soldSeparately: boolean;
}

function seedRow(addon: Service): RowDraft {
  return {
    price: addon.hasVariants ? "" : priceText(addon.price),
    duration:
      addon.hasVariants || addon.durationMin === null
        ? ""
        : String(addon.durationMin),
    stepId: addon.addonStepId ?? NO_STEP,
    commissionable: addon.commissionable,
    soldSeparately: addon.soldSeparately,
  };
}

/** The PATCH a row's draft makes — only what differs from what is stored. */
function rowPatch(addon: Service, row: RowDraft): UpdateServiceInput {
  const seed = seedRow(addon);
  const patch: UpdateServiceInput = {};

  if (!addon.hasVariants) {
    if (row.price !== seed.price) patch.price = priceDigits(row.price) ?? "";
    if (row.duration !== seed.duration) {
      patch.durationMin = durationValue(row.duration) ?? undefined;
    }
  }
  if (row.stepId !== seed.stepId) {
    patch.addonStepId = row.stepId === NO_STEP ? null : row.stepId;
  }
  if (row.commissionable !== seed.commissionable) {
    patch.commissionable = row.commissionable;
  }
  if (row.soldSeparately !== seed.soldSeparately) {
    patch.soldSeparately = row.soldSeparately;
  }

  return patch;
}

/**
 * Add-on — one section of Pengaturan › Layanan, from the mockup's table: price,
 * length, tahapan, komisi and "dijual terpisah" edited in place, one ✕ per row.
 *
 * AN ADD-ON IS A SERVICE (`serviceType: "addon"`), in the same collection as
 * the main ones. Every save here is a PATCH /services/:id carrying only what
 * changed on that row, and the three add-on settings (`addonStepId`,
 * `commissionable`, `soldSeparately`) are ones the server resets on a main
 * service — nothing on this table can reach one.
 *
 * DRAFT + SIMPAN, like Varian & Harga on a service's page: a price typed
 * half-way must not be sent on every keystroke, and several rows are often
 * changed in one sitting. Saved row by row; a row the server refuses keeps its
 * draft and says so, the rows that went through are re-read.
 *
 * TAHAPAN IS AN ID from the add-on's own business line (`servicesteps`). A
 * retired step stays in the list only for the add-on that already holds it — it
 * may be kept, not picked, which is the server's rule too.
 *
 * A VARIANT-PRICED ADD-ON prices and times each variant, so its row shows "per
 * varian" and the range instead of boxes; those are edited on the service.
 */
export function AddonServicesPanel({
  list,
  steps,
  intro,
}: {
  list: UseAddonServiceListResult;
  /** Every line's tahapan, retired and deleted ones included — the hub's load. */
  steps: ServiceStep[];
  intro?: ReactNode;
}) {
  const { addons, attachedCount, loading, error, refetch } = list;
  const { can } = usePermissions();
  const mayUpdate = can("services", "update");

  const [edits, setEdits] = useState<Record<string, RowDraft>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const firstLoad = loading && addons.length === 0;

  const rowOf = (addon: Service) => edits[addon._id] ?? seedRow(addon);

  function change(addon: Service, next: Partial<RowDraft>) {
    setEdits((current) => ({
      ...current,
      [addon._id]: { ...(current[addon._id] ?? seedRow(addon)), ...next },
    }));
  }

  const dirty = addons.filter(
    (addon) =>
      edits[addon._id] !== undefined &&
      Object.keys(rowPatch(addon, edits[addon._id])).length > 0,
  );

  /* The first box that cannot be sent, named — the bar's reason. */
  const problem = (() => {
    for (const addon of dirty) {
      if (addon.hasVariants) continue;
      const row = edits[addon._id];
      if (priceDigits(row.price) === null) {
        return `Harga ${addon.name} belum benar.`;
      }
      if (durationValue(row.duration) === null) {
        return `Durasi ${addon.name} diisi menit antara 1 dan 1440.`;
      }
    }
    return null;
  })();

  async function save() {
    setSaving(true);
    setSaveError(null);

    const failed: string[] = [];
    const kept: Record<string, RowDraft> = {};

    for (const addon of dirty) {
      try {
        await serviceService.update(addon._id, rowPatch(addon, edits[addon._id]));
      } catch (err) {
        kept[addon._id] = edits[addon._id];
        failed.push(
          `${addon.name}: ${err instanceof ApiError ? err.fullMessage : "gagal disimpan"}`,
        );
      }
    }

    setEdits(kept);
    setSaving(false);
    refetch();

    if (failed.length > 0) {
      setSaveError(failed.join(" · "));
    } else {
      swalToast("Add-on tersimpan.");
    }
  }

  function discard() {
    setEdits({});
    setSaveError(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await serviceService.remove(pendingDelete._id);
      const removedId = pendingDelete._id;
      setEdits((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => id !== removedId),
        ),
      );
      setPendingDelete(null);
      refetch();
      swalToast("Add-on dihapus.");
    } catch (err) {
      // `fullMessage`: the 409's reason says how many services still carry it.
      setDeleteError(
        err instanceof ApiError ? err.fullMessage : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setDeleting(false);
    }
  }

  /** The step choices for one add-on: its line's live steps, plus what it holds. */
  function stepChoices(addon: Service) {
    return steps
      .filter(
        (step) =>
          step.businessLineId === addon.businessLineId &&
          step.deletedAt === null &&
          (step.isActive || step._id === addon.addonStepId),
      )
      .sort(byStepOrder);
  }

  const disabled = !mayUpdate || saving;

  return (
    <div className="flex flex-col gap-5">
      {intro}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Ditempel ke layanan utama dari form layanan itu.
        </p>
        <Can feature="services" action="create">
          <Button asChild>
            <Link href={NEW_SERVICE_PATH}>
              <Plus className="size-4" aria-hidden />
              Tambah add-on
            </Link>
          </Button>
        </Can>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {saveError && <Alert variant="error">{saveError}</Alert>}

      {dirty.length > 0 && (
        <DraftSaveBar
          problem={problem}
          saving={saving}
          saveLabel="Simpan add-on"
          onDiscard={discard}
          onSave={() => void save()}
        />
      )}

      {firstLoad ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat add-on…
        </div>
      ) : error && addons.length === 0 ? null : addons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <p className="font-semibold text-foreground">Belum ada add-on.</p>
          <p className="mt-1 text-sm text-muted">
            Buat layanan baru dan pilih jenis Add-on.
          </p>
          <Can feature="services" action="create">
            <Button asChild variant="ghost" className="mt-2">
              <Link href={NEW_SERVICE_PATH}>Tambah yang pertama →</Link>
            </Button>
          </Can>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <Table className={loading ? "min-w-215 opacity-60" : "min-w-215"}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[24%]">Nama</TableHead>
                <TableHead className="w-[14%]">Harga</TableHead>
                <TableHead className="w-[10%]">Durasi Menit</TableHead>
                <TableHead className="w-[22%]">Tahapan</TableHead>
                <TableHead className="w-[9%]">Komisi</TableHead>
                <TableHead className="w-[14%]">Dijual terpisah</TableHead>
                <TableHead className="w-[7%]">
                  <span className="sr-only">Hapus</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {addons.map((addon) => {
                const row = rowOf(addon);
                const attached = attachedCount[addon._id] ?? 0;
                const choices = stepChoices(addon);
                const heldMissing =
                  addon.addonStepId !== null &&
                  !choices.some((step) => step._id === addon.addonStepId);
                const priceBad =
                  !addon.hasVariants && priceDigits(row.price) === null;
                const durationBad =
                  !addon.hasVariants && durationValue(row.duration) === null;

                return (
                  <TableRow key={addon._id}>
                    <TableCell>
                      <Link
                        href={serviceEditPath(addon._id)}
                        className="rounded-sm font-bold text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        {addon.name}
                      </Link>
                      <p className="text-xs text-muted">
                        dipakai {attached} layanan
                        {addon.hasVariants && " · per varian"}
                        {!addon.isActive && " · nonaktif"}
                      </p>
                    </TableCell>

                    <TableCell>
                      {addon.hasVariants ? (
                        <span className="rounded-full bg-tint-warning px-2 py-0.5 text-xs font-medium text-warning">
                          per varian
                        </span>
                      ) : (
                        <Input
                          inputMode="numeric"
                          aria-label={`Harga ${addon.name}`}
                          aria-invalid={priceBad || undefined}
                          value={row.price}
                          disabled={disabled}
                          onChange={(event) =>
                            change(addon, { price: event.target.value })
                          }
                          onBlur={() => {
                            const digits = priceDigits(row.price);
                            if (digits !== null && edits[addon._id]) {
                              change(addon, { price: priceText(digits) });
                            }
                          }}
                          className="h-9 w-28 tabular-nums"
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      {addon.hasVariants ? (
                        <span className="text-sm tabular-nums text-muted">
                          {formatDurationRange(serviceDurationBounds(addon))}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min={1}
                          max={1440}
                          aria-label={`Durasi ${addon.name} dalam menit`}
                          aria-invalid={durationBad || undefined}
                          value={row.duration}
                          disabled={disabled}
                          onChange={(event) =>
                            change(addon, { duration: event.target.value })
                          }
                          className="h-9 w-20 tabular-nums"
                        />
                      )}
                    </TableCell>

                    <TableCell>
                      <Select
                        value={row.stepId}
                        disabled={disabled}
                        onValueChange={(next) => change(addon, { stepId: next })}
                      >
                        <SelectTrigger
                          aria-label={`Tahapan ${addon.name}`}
                          className="w-full max-w-52"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_STEP}>— tidak ada —</SelectItem>
                          {choices.map((step) => (
                            <SelectItem key={step._id} value={step._id}>
                              {step.name}
                              {!step.isActive && " (nonaktif)"}
                            </SelectItem>
                          ))}
                          {heldMissing && (
                            <SelectItem value={addon.addonStepId as string}>
                              Tahapan dihapus
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    <TableCell>
                      <Switch
                        aria-label={`Komisi ${addon.name}`}
                        checked={row.commissionable}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                          change(addon, { commissionable: checked })
                        }
                      />
                    </TableCell>

                    <TableCell>
                      <Switch
                        aria-label={`Dijual terpisah ${addon.name}`}
                        checked={row.soldSeparately}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                          change(addon, { soldSeparately: checked })
                        }
                      />
                    </TableCell>

                    <TableCell className="text-right">
                      <Can feature="services" action="delete">
                        <Button
                          variant="ghost"
                          className="size-9 text-muted hover:bg-tint-danger hover:text-danger-ink"
                          aria-label={`Hapus ${addon.name}`}
                          disabled={saving}
                          onClick={() => {
                            setDeleteError(null);
                            setPendingDelete(addon);
                          }}
                        >
                          <X className="size-4" aria-hidden />
                        </Button>
                      </Can>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={`Hapus ${pendingDelete.name}?`}
          confirmLabel="Hapus add-on"
          destructive
          busy={deleting}
          error={deleteError}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        >
          {(attachedCount[pendingDelete._id] ?? 0) > 0
            ? `Masih dipakai ${attachedCount[pendingDelete._id]} layanan — lepas dulu dari layanan itu.`
            : "Add-on ini tidak muncul lagi di pilihan. Bisa dipulihkan dari daftar layanan."}
        </ConfirmDialog>
      )}
    </div>
  );
}
