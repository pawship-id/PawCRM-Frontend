"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Card, ConfirmDialog, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { membershipService } from "@/services/membership.service";
import { swalToast } from "@/lib/swal";

import { membershipFailure } from "../errors";
import { useMembershipPlan } from "../hooks/useMembershipPlan";
import {
  MEMBERSHIP_HREF,
  formatDuration,
  formatRupiah,
  planHref,
} from "../labels";
import { BenefitList } from "./BenefitList";

/**
 * One membership package, read-only, with the two actions that change its life:
 * retiring it and deleting it.
 *
 * THE TWO ARE NOT THE SAME ACTION AND THE SCREEN SAYS SO. "Berhenti dijual"
 * stops new sales and leaves every card already issued working — which is what
 * a shop retiring a package actually wants. "Hapus" is for a package typed by
 * mistake, and the API refuses it the moment a card exists. Presenting them as
 * one control would make an owner reach for the destructive one to do the
 * harmless thing.
 */
export function MembershipPlanDetail({ id }: { id: string }) {
  const router = useRouter();
  const { plan, loading, error, reload } = useMembershipPlan(id);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size={24} />
      </div>
    );
  }

  if (error || !plan) {
    return <Alert variant="error">{error ?? "Paket tidak ditemukan."}</Alert>;
  }

  async function toggleActive() {
    if (!plan) return;
    setBusy(true);

    try {
      await membershipService.updatePlan(plan.id, { isActive: !plan.isActive });
      swalToast(
        plan.isActive
          ? "Paket berhenti dijual. Kartu yang sudah terbit tetap berlaku."
          : "Paket dijual lagi.",
        "success",
      );
      reload();
    } catch (err) {
      swalToast(membershipFailure(err, "Gagal mengubah paket.").toast, "error", 6000);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!plan) return;
    setBusy(true);

    try {
      await membershipService.removePlan(plan.id);
      swalToast("Paket membership dihapus.", "success");
      router.push(MEMBERSHIP_HREF);
      router.refresh();
    } catch (err) {
      /*
        THE 409 HERE IS THE USEFUL ONE and is shown verbatim: it names how many
        cards still run on the package and tells the reader to set it inactive
        instead. Replacing it with "gagal menghapus" would throw away the only
        part of the answer worth reading.
      */
      swalToast(membershipFailure(err, "Gagal menghapus paket.").toast, "error", 6000);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted tabular-nums">{plan.code}</p>
          <h2 className="text-xl font-semibold text-foreground">{plan.name}</h2>
          {plan.description && (
            <p className="mt-1 text-sm text-muted">{plan.description}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Can feature="membershipPlans" action="update">
            <Button asChild variant="secondary">
              <Link href={`${planHref(plan.id)}/edit`}>Ubah</Link>
            </Button>
            <Button variant="secondary" onClick={toggleActive} disabled={busy}>
              {plan.isActive ? "Berhenti dijual" : "Jual lagi"}
            </Button>
          </Can>
          <Can feature="membershipPlans" action="delete">
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
            >
              Hapus
            </Button>
          </Can>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Paket">
          <dl className="flex flex-col divide-y divide-border">
            <Row label="Harga" value={formatRupiah(plan.price)} />
            <Row label="Masa berlaku" value={formatDuration(plan.durationDays)} />
            <Row
              label="Tawarkan perpanjangan"
              value={`${plan.renewalOfferDays} hari sebelum habis`}
            />
            <Row
              label="Status"
              value={plan.isActive ? "Masih dijual" : "Tidak dijual"}
            />
          </dl>

          {!plan.isActive && (
            <p className="mt-4 text-sm text-muted">
              Paket ini tidak lagi ditawarkan. Kartu yang sudah terbit tetap
              berlaku sampai masa berlakunya habis.
            </p>
          )}
        </Card>

        <Card
          title="Benefit"
          description="Yang didapat pemilik hewan selama kartu berlaku."
        >
          <BenefitList benefits={plan.benefits} />
        </Card>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Hapus paket membership?"
          confirmLabel="Hapus"
          destructive
          busy={busy}
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        >
          <p>
            &ldquo;{plan.name}&rdquo; akan dihapus. Kalau maksudnya hanya
            berhenti menjual paket ini, pakai <strong>Berhenti dijual</strong> —
            kartu yang sudah terbit tetap berlaku.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm font-medium text-foreground tabular-nums">
        {value}
      </dd>
    </div>
  );
}
