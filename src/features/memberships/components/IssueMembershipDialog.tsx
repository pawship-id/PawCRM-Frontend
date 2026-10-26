"use client";

import { useEffect, useState } from "react";

import { SelectField, TextField, TextareaField } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { membershipService } from "@/services/membership.service";
import { swalToast } from "@/lib/swal";
import type { MembershipPlan, PetMembership } from "@/types/membership";

import { isoDate } from "@/utils/date";

import { membershipFailure } from "../errors";
import { formatDay, planEnd } from "../kelola";
import { ATTACH_TO_LABEL, formatPlanDuration, formatRupiah } from "../labels";

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
 * till is a POS line and goes through the till's own journal — which is why the
 * profile leads with "Jual paket di kasir" and labels this "Terbitkan manual".
 *
 * A CUSTOMER-HELD PLAN is offered too when the owner is known (`customerId`):
 * it is issued to the owner (`customerId`), not to this animal, and shared by
 * all their pets (contract §3.8).
 */
export function IssueMembershipDialog({
  petId,
  petName,
  customerId = null,
  open,
  onClose,
  onIssued,
}: {
  petId: string;
  petName?: string | null;
  /** The owner. Without it only pet-held plans are offered. */
  customerId?: string | null;
  open: boolean;
  onClose: () => void;
  onIssued: (membership: PetMembership) => void;
}) {
  const today = isoDate(new Date());

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        const offered = result.items.filter(
          (entry) => (entry.attachTo ?? "pet") === "pet" || Boolean(customerId),
        );
        setPlans(offered);
        setPlanId((current) => current || (offered[0]?.id ?? ""));
      })
      .catch(() => {
        if (active) setPlans([]);
      });

    return () => {
      active = false;
    };
  }, [open, customerId]);

  const plan = plans.find((entry) => entry.id === planId) ?? null;

  /**
   * The last day of cover, previewed — N months − 1 day when the plan counts
   * months (they win), else N days − 1. The server computes the same way;
   * showing a different number here would be worse than showing none.
   */
  const endPreview =
    plan && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? formatDay(planEnd(startDate, plan)) : null;

  const startsBeforePurchase =
    Boolean(purchasedAt && startDate) && startDate < purchasedAt;

  async function submit() {
    setSubmitting(true);

    try {
      const forCustomer = plan?.attachTo === "customer";
      const membership = await membershipService.issue({
        petId: forCustomer ? null : petId,
        customerId: forCustomer ? customerId : null,
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
      swalToast(
        membershipFailure(err, "Gagal menerbitkan membership. Coba lagi.").toast,
        "error",
        6000,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Terbitkan manual</DialogTitle>
          <DialogDescription>
            {plan?.attachTo === "customer"
              ? "Untuk pemiliknya — jatahnya dipakai bergantian oleh semua hewannya."
              : `Untuk ${petName ?? "hewan ini"}.`}{" "}
            Tidak mencatat pembayaran; jual di kasir kalau ada uang masuk.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <SelectField
            label="Paket"
            required
            value={planId}
            onChange={setPlanId}
            options={plans.map((entry) => ({
              value: entry.id,
              label: `${entry.name} — ${formatRupiah(entry.price)}${entry.attachTo === "customer" ? ` · ${ATTACH_TO_LABEL.customer}` : ""}`,
            }))}
            placeholder="Pilih paket"
            hint={
              plan
                ? `${formatPlanDuration(plan)} · ${plan.benefits.length} benefit`
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
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !planId || startsBeforePurchase}
          >
            Terbitkan membership
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
