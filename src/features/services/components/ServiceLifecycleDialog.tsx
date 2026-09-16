"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import type { Service } from "@/types/api";

/** A row's Hapus or Pulihkan, and the service it targets. */
export interface ServiceLifecycleAction {
  kind: "delete" | "restore";
  service: Service;
}

/**
 * The confirm step behind a service row's Hapus and Pulihkan.
 *
 * LIFTED OUT OF `ServicesTable` on 13 September 2026, when the catalogue-wide
 * list at `/dashboard/master/layanan/katalog` was removed and Grooming › Layanan
 * & Harga became the list services are deleted and restored from. The copy and
 * the error rule came with it unchanged.
 *
 * Render it unconditionally with `action={null}` when nothing is pending: it
 * stays mounted, so a request that settles after the dialog closes still lands
 * on a live component.
 */
export function ServiceLifecycleDialog({
  action,
  onCancel,
  onDone,
}: {
  action: ServiceLifecycleAction | null;
  onCancel: () => void;
  /** The API accepted it — close, and re-read the list. */
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    if (busy) return;
    setError(null);
    onCancel();
  }

  async function confirm() {
    if (!action) return;
    const { kind, service } = action;

    setBusy(true);
    setError(null);
    try {
      if (kind === "delete") await serviceService.remove(service._id);
      else await serviceService.restore(service._id);
      onDone();
      swalToast(kind === "delete" ? "Layanan dihapus." : "Layanan dipulihkan.");
    } catch (err) {
      // `reason` first: the delete refusal's message is only a headline, and the
      // count of bundles in the way — the part that says what to do — is in
      // `reason`. Same rule as the customer delete guard.
      setError(
        err instanceof ApiError
          ? (err.reason ?? err.message)
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!action) return null;

  return (
    <ConfirmDialog
      title={action.kind === "delete" ? "Hapus layanan" : "Pulihkan layanan"}
      confirmLabel={action.kind === "delete" ? "Hapus" : "Pulihkan"}
      destructive={action.kind === "delete"}
      busy={busy}
      error={error}
      onConfirm={confirm}
      onCancel={cancel}
    >
      {action.kind === "delete" ? (
        <>
          Hapus <strong>{action.service.name}</strong>? Ini ditolak kalau masih
          dipakai paket bundling. Kalau layanannya cuma berhenti ditawarkan,
          lebih tepat ditandai tidak aktif lewat form-nya — namanya tetap muncul
          di struk-struk lama.
        </>
      ) : (
        <>
          Pulihkan <strong>{action.service.name}</strong>? Ini gagal kalau
          kodenya sudah dipakai layanan lain.
        </>
      )}
    </ConfirmDialog>
  );
}
