"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, Breadcrumb, Card, ConfirmDialog, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { useBranchOptions } from "@/features/inventory/hooks/useBranchOptions";
import { Can } from "@/features/permissions";
import { usePetOptions } from "@/hooks/usePetOptions";
import { swalToast } from "@/lib/swal";
import { membershipService } from "@/services/membership.service";
import type { MembershipBenefit } from "@/types/membership";

import { membershipFailure } from "../errors";
import { useMembershipCatalog } from "../hooks/useMembershipCatalog";
import { useMembershipPlan } from "../hooks/useMembershipPlan";
import {
  ATTACH_TO_LABEL,
  ELIGIBILITY_LABEL,
  MEMBERSHIP_HREF,
  PLAN_PRICE_MODE_LABEL,
  PROMOSI_SUMMARY_HREF,
  VISIT_FEE_LABEL,
  formatPlanDuration,
  formatRupiah,
  planEditHref,
  quotaText,
} from "../labels";
import { variantKeyLabel } from "../variantKey";
import { scopeSummary } from "./BenefitScopeField";
import { planPriceText } from "./MembershipPlansPanel";
import { ToneBadge } from "./MembershipStatusBadge";

/**
 * One membership package, read-only, with the two actions that change its life:
 * switching sales off and deleting it.
 *
 * THE TWO ARE NOT THE SAME ACTION AND THE SCREEN SAYS SO. "Nonaktifkan" stops
 * new sales and leaves every card already issued working — which is what a
 * shop retiring a package actually wants. "Hapus" is for a package typed by
 * mistake, and the API refuses it while any card is active, scheduled, paused
 * or unpaid. Presenting them as one control would make an owner reach for the
 * destructive one to do the harmless thing.
 *
 * COMPACT: two cards — the package's rules, and its benefits with their
 * "ATAU" options — instead of a field per row.
 */
export function MembershipPlanDetail({ id }: { id: string }) {
  const router = useRouter();
  const { plan, loading, error, reload } = useMembershipPlan(id);
  const { label } = usePetOptions();
  const { branches } = useBranchOptions();
  const catalog = useMembershipCatalog();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /* Nonaktifkan asks first (ui-rules §9); Aktifkan only gives sales back. */
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

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
      setConfirmDeactivate(false);
      swalToast(
        plan.isActive
          ? "Paket dinonaktifkan. Kartu yang sudah terbit tetap berlaku."
          : "Paket aktif lagi dan bisa dijual.",
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
        THE 409 HERE IS THE USEFUL ONE and is shown verbatim: it says cards
        still run on the package and tells the reader to switch sales off
        instead.
      */
      swalToast(membershipFailure(err, "Gagal menghapus paket.").toast, "error", 6000);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  }

  const keyName = (key: string) => variantKeyLabel(key, (type, value) => label(type, value));
  const species =
    plan.attachTo === "customer"
      ? "Semua hewan pelanggan"
      : plan.petSpecies.length
        ? plan.petSpecies.map((value) => label("species", value) ?? "—").join(", ")
        : "Semua jenis";
  const branchText = plan.branchIds.length
    ? plan.branchIds
        .map((value) => branches.find((branch) => branch._id === value)?.name ?? "—")
        .join(", ")
    : "Semua cabang";
  const publicText = plan.publicDisplay.visible
    ? [
        "Tampil",
        plan.publicDisplay.featured ? "featured" : null,
        `urutan ${plan.publicDisplay.order}`,
        plan.publicDisplay.badge ? `badge "${plan.publicDisplay.badge}"` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Tidak tampil";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Breadcrumb
            items={[
              { label: "Promosi", href: PROMOSI_SUMMARY_HREF },
              { label: "Membership", href: MEMBERSHIP_HREF },
              { label: plan.code },
            ]}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold">{plan.name}</h1>
            <ToneBadge
              tone={plan.isActive ? "success" : "neutral"}
              label={plan.isActive ? "Aktif" : "Nonaktif"}
            />
            {plan.publicDisplay.visible && <ToneBadge tone="info" label="Website" />}
          </div>
          <p className="mt-1 text-sm text-muted tabular-nums">{plan.code}</p>
          {plan.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted">{plan.description}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Can feature="membershipPlans" action="update">
            <Button asChild variant="secondary">
              <Link href={planEditHref(plan.id)}>Ubah</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => (plan.isActive ? setConfirmDeactivate(true) : void toggleActive())}
              disabled={busy}
            >
              {plan.isActive ? "Nonaktifkan" : "Aktifkan"}
            </Button>
          </Can>
          <Can feature="membershipPlans" action="delete">
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} disabled={busy}>
              Hapus
            </Button>
          </Can>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card title="Paket">
          <dl className="flex flex-col divide-y divide-border">
            <Row label="Harga" value={planPriceText(plan)} />
            <Row label="Mode harga" value={PLAN_PRICE_MODE_LABEL[plan.priceMode]} />
            <Row label="Durasi" value={formatPlanDuration(plan)} />
            <Row label="Melekat ke" value={ATTACH_TO_LABEL[plan.attachTo]} />
            <Row label="Jenis hewan" value={species} />
            <Row label="Syarat pembeli" value={ELIGIBILITY_LABEL[plan.eligibility]} />
            <Row label="Cabang" value={branchText} />
            <Row
              label="Tawarkan perpanjangan"
              value={`${plan.renewalOfferDays} hari sebelum berakhir`}
            />
            <Row label="Website" value={publicText} />
          </dl>

          {plan.priceMode === "variant" && plan.variantPrices.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">Harga per varian</p>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {plan.variantPrices.map((row) => (
                  <li
                    key={row.variantKey}
                    className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span>{keyName(row.variantKey)}</span>
                    <span className="font-medium tabular-nums">{formatRupiah(row.price)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!plan.isActive && (
            <p className="mt-4 text-sm text-muted">
              Paket ini tidak lagi dijual. Kartu yang sudah terbit tetap berlaku sampai masa
              berlakunya habis.
            </p>
          )}
        </Card>

        <Card title="Benefit" description="Yang didapat selama membership berlaku.">
          {plan.benefits.length === 0 ? (
            <p className="text-sm text-muted">Paket ini tidak memberi benefit apa pun.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {plan.benefits.map((benefit) => (
                <BenefitRow
                  key={benefit.id}
                  benefit={benefit}
                  nameOf={(value) =>
                    catalog.serviceById.get(value)?.name ??
                    catalog.products.find((product) => product.id === value)?.name
                  }
                  homeService={(value) =>
                    Boolean(catalog.serviceById.get(value)?.serviceLocations?.includes("in_home"))
                  }
                />
              ))}
            </ul>
          )}
        </Card>
      </div>

      {confirmDeactivate && (
        <ConfirmDialog
          title="Nonaktifkan paket membership"
          confirmLabel="Nonaktifkan paket"
          busy={busy}
          onConfirm={() => void toggleActive()}
          onCancel={() => setConfirmDeactivate(false)}
        >
          Nonaktifkan <strong>{plan.name}</strong>? Paket ini berhenti dijual — tidak
          bisa dipilih lagi di kasir atau faktur penjualan, dan kartu yang ada tidak bisa
          diperpanjang dengan paket ini. Kartu yang sudah terbit tetap berlaku sampai
          masa berlakunya habis, dan paket bisa diaktifkan lagi kapan saja.
        </ConfirmDialog>
      )}

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
            &ldquo;{plan.name}&rdquo; akan dihapus. Kalau maksudnya hanya berhenti menjual
            paket ini, pakai <strong>Nonaktifkan</strong> — kartu yang sudah terbit tetap
            berlaku.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function BenefitRow({
  benefit,
  nameOf,
  homeService,
}: {
  benefit: MembershipBenefit;
  nameOf: (id: string) => string | undefined;
  homeService: (id: string) => boolean;
}) {
  const perk = benefit.kind === "perk";

  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{benefit.label}</p>
        <p className="text-sm text-muted">{perk ? "Fasilitas" : quotaText(benefit.quota)}</p>
      </div>
      {!perk &&
        benefit.options.map((option, index) => (
          <p key={option.id} className="text-sm text-muted">
            {index > 0 && <span className="font-semibold">atau </span>}
            {scopeSummary(option.scope, nameOf)} — {option.summary}
            {option.scope.serviceIds.some(homeService)
              ? `, biaya kunjungan ${VISIT_FEE_LABEL[option.visitFee].toLowerCase()}`
              : ""}
          </p>
        ))}
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground tabular-nums">{value}</dd>
    </div>
  );
}
