"use client";

import { useState } from "react";

import { Card, TextareaField } from "@/components";
import { Button as UIButton } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { tenantService } from "@/services/tenant.service";
import type { Tenant, TenantSettings } from "@/types/api";

/** Mirrors INVOICE_FOOTER_MAX_LENGTH in tenant.model.js. */
const MAX_LENGTH = 600;

/**
 * WHAT IS PRINTED AT THE FOOT OF EVERY INVOICE — free text the shop writes for
 * itself.
 *
 * WHY IT EXISTS. The print mockup carries "Pembayaran ditujukan ke: BCA … a.n.
 * …", and an invoice that bills a customer without saying where to send the
 * money makes them ring up to ask. There was nowhere to store that, so the sheet
 * shipped without the line.
 *
 * ONE BLOCK RATHER THAN bank-name / number / holder, which was the obvious
 * shape. A shop with two accounts, or one that wants payment terms, a returns
 * policy or a thank-you line, would need a second field and then a third — and
 * each of those is a release. A paragraph the shop edits itself covers all of
 * them and never needs one.
 *
 * THE COST, STATED RATHER THAN HIDDEN: nothing can validate an account number in
 * here, and nothing downstream can read one back out. This is a paragraph on a
 * piece of paper, not data — so the hint tells somebody to check what they typed
 * rather than implying the system will.
 *
 * EMPTY IS A REAL VALUE, not an unfinished form. A shop that takes every payment
 * at the counter has nothing to put here, and one that changes bank must be able
 * to CLEAR it rather than leave stale details on every invoice it sends. So
 * Simpan stays available with the box emptied — the usual "disabled until
 * answered" rule would trap exactly that case.
 *
 * GATED ON `tenants:update`, the same grant the tax card takes and the same one
 * the route behind it carries.
 */
export function InvoiceFooterForm({
  tenant,
  onSaved,
}: {
  tenant: Tenant;
  /** Called after a successful save; the parent re-reads the tenant. */
  onSaved: () => void;
}) {
  const current = tenant.settings.invoiceFooterNote ?? "";

  const [note, setNote] = useState(current);
  const [saving, setSaving] = useState(false);

  const changed = note !== current;
  const tooLong = note.length > MAX_LENGTH;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!changed || tooLong) return;

    setSaving(true);

    try {
      const patch: Partial<TenantSettings> = { invoiceFooterNote: note };

      await tenantService.updateSettings(patch);
      // Released before the parent re-renders: this form stays mounted, and a
      // button locked forever is worse than the error that locked it.
      setSaving(false);
      onSaved();
      swalToast("Catatan kaki faktur tersimpan.");
    } catch (error) {
      swalToast(
        error instanceof ApiError
          ? error.message
          : "Terjadi kesalahan. Coba lagi.",
        "error",
        8000,
      );
      setSaving(false);
    }
  }

  return (
    <Card
      title="Catatan kaki faktur"
      description="Dicetak di bagian bawah setiap faktur yang Anda cetak."
    >
      <Can
        feature="tenants"
        action="update"
        fallback={
          <div className="text-sm">
            {current ? (
              // `whitespace-pre-line` here for the same reason the sheet has it:
              // bank details are two or three lines.
              <p className="whitespace-pre-line">{current}</p>
            ) : (
              <p className="text-muted">Belum diisi.</p>
            )}
            <p className="mt-2 text-xs text-muted">
              Role Anda tidak bisa mengubah setelan ini.
            </p>
          </div>
        }
      >
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <TextareaField
            label="Catatan"
            name="invoiceFooterNote"
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            error={tooLong ? `Maksimal ${MAX_LENGTH} karakter` : undefined}
            hint={
              // What it is FOR, with an example — an empty box labelled
              // "Catatan" tells nobody that this is where bank details go.
              "Misalnya nomor rekening dan syarat pembayaran. Contoh: " +
              "“Pembayaran ke BCA 1234567890 a.n. Toko Anda. Mohon cantumkan " +
              "nomor faktur pada berita transfer.” " +
              "Periksa sendiri nomor rekeningnya — sistem tidak bisa mengeceknya. " +
              "Kosongkan kalau tidak perlu dicetak."
            }
            disabled={saving}
          />

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted tabular-nums">
              {note.length}/{MAX_LENGTH}
            </span>
            <UIButton type="submit" disabled={!changed || tooLong || saving}>
              Simpan catatan
            </UIButton>
          </div>
        </form>
      </Can>
    </Card>
  );
}
