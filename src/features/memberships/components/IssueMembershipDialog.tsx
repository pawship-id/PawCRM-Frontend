"use client";

import { useEffect, useState } from "react";

import { Alert, SelectField, TextField, TextareaField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/services/api-error";
import { membershipService } from "@/services/membership.service";
import { swalToast } from "@/lib/swal";
import type { MembershipPlan, PetMembership } from "@/types/membership";

import { formatDuration, formatRupiah } from "../labels";

/**
 * Issue a card to one animal, by hand.
 *
 * ─── TWO DATE FIELDS, AND THEY ARE GENUINELY DIFFERENT ─────────────────────
 *
 * "Tanggal beli" is when the money was agreed; "Mulai berlaku" is when cover
 * starts. They diverge often enough to be worth two controls: a card bought on
 * a Saturday to run from the 1st so the monthly quota is tidy, a renewal bought
 * today that begins when the current card lapses. Cover is counted from the
 * START — deferring activation must not cost the customer days they paid for —
 * and the preview line under the fields says what that works out to, because
 * nobody should have to add 365 days in their head.
 *
 * THIS DIALOG TAKES NO MONEY. It records that a card exists. Selling one at the
 * till is a POS line and goes through the till's own journal.
 */
export function IssueMembershipDialog({
  petId,
  petName,
  open,
  onClose,
  onIssued,
}: {
  petId: string;
  petName?: string | null;
  open: boolean;
  onClose: () => void;
  onIssued: (membership: PetMembership) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;

    // ONLY SELLABLE PACKAGES. A retired one is retired precisely so it stops
    // being offered, and offering it here would be the one place the switch
    // did not work.
    membershipService
      .listPlans({ isActive: true, limit: 100, sort: "nameAsc" })
      .then((result) => {
        if (!active) return;
        setPlans(result.items);
        setPlanId((current) => current || (result.items[0]?.id ?? ""));
      })
      .catch(() => {
        if (active) setPlans([]);
      });

    return () => {
      active = false;
    };
  }, [open]);

  const plan = plans.find((entry) => entry.id === planId) ?? null;

  /**
   * The last day of cover, previewed.
   *
   * `- 1` BECAUSE THE FIRST DAY COUNTS — a 30-day card starting on the 1st
   * covers the 1st to the 30th. The server computes the same way; showing a
   * different number here would be worse than showing none.
   */
  const endPreview = (() => {
    if (!plan || !startDate) return null;
    const start = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(
      start.getTime() + (plan.durationDays - 1) * 86_400_000,
    );
    return end.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  })();

  const startsBeforePurchase =
    Boolean(purchasedAt && startDate) && startDate < purchasedAt;

  async function submit() {
    setSubmitting(true);
    setError(null);

    try {
      const membership = await membershipService.issue({
        petId,
        planId,
        purchasedAt,
        startDate,
        note: note.trim() || null,
      });

      swalToast(`Membership ${membership.number} diterbitkan.`, "success");
      onIssued(membership);
      onClose();
    } catch (err) {
      /*
        THE 409 CARRIES THE EXISTING CARD'S END DATE, so it reads as "sudah
        punya, berlaku sampai …" rather than a bare refusal. Shown verbatim for
        that reason — the next thing the user needs is exactly what the server
        already told us.
      */
      setError(
        err instanceof ApiError
          ? err.fullMessage
          : "Gagal menerbitkan membership. Coba lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Beli membership</DialogTitle>
          <DialogDescription>
            {petName ? `Untuk ${petName}.` : "Untuk hewan ini."} Membership
            melekat pada hewan, bukan pemiliknya.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {error && <Alert variant="error">{error}</Alert>}

          <SelectField
            label="Paket"
            required
            value={planId}
            onChange={setPlanId}
            options={plans.map((entry) => ({
              value: entry.id,
              label: `${entry.name} — ${formatRupiah(entry.price)}`,
            }))}
            placeholder="Pilih paket"
            hint={
              plan
                ? `${formatDuration(plan.durationDays)} · ${plan.benefits.length} benefit`
                : "Hanya paket yang masih dijual yang muncul di sini."
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Tanggal beli"
              type="date"
              required
              value={purchasedAt}
              onChange={(event) => setPurchasedAt(event.target.value)}
              hint="Kapan uangnya disepakati."
            />

            <TextField
              label="Mulai berlaku"
              type="date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              error={
                startsBeforePurchase
                  ? "Tidak boleh sebelum tanggal beli."
                  : undefined
              }
              hint="Boleh dimundurkan, mis. mulai tanggal 1."
            />
          </div>

          {endPreview && !startsBeforePurchase && (
            <p className="text-sm text-foreground" aria-live="polite">
              Membership berlaku sampai <strong>{endPreview}</strong>.
            </p>
          )}

          <TextareaField
            label="Keterangan"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Kembali
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !planId || startsBeforePurchase}
          >
            Beli
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
