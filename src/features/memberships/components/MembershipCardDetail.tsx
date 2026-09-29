"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Alert, Card, ConfirmDialog, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { membershipService } from "@/services/membership.service";
import { swalToast } from "@/lib/swal";
import type { PetMembership } from "@/types/membership";

import {
  MEMBERSHIP_CARDS_HREF,
  formatDate,
  formatRupiah,
  planHref,
} from "../labels";
import { BenefitList } from "./BenefitList";
import { MembershipStatusBadge } from "./MembershipStatusBadge";

/**
 * One card: its cover, its benefits, and the LEDGER behind the counters.
 *
 * THE HISTORY IS THE POINT OF THIS SCREEN. "Kenapa jatah saya tinggal 1" is
 * answered by rows with dates on them, not by a number — which is why the
 * redemption ledger exists as its own collection rather than as a counter on
 * the card. A reversed row stays visible, struck through, because a void that
 * removed its own trace would leave a customer's quota changing for no reason
 * anybody could point at.
 */
export function MembershipCardDetail({ id }: { id: string }) {
  const [card, setCard] = useState<PetMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    membershipService
      .getMembership(id)
      .then((result) => {
        if (active) setCard(result);
      })
      .catch((err) => {
        if (!active) return;
        setCard(null);
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Gagal memuat kartu membership.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, nonce]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size={24} />
      </div>
    );
  }

  if (error || !card) {
    return <Alert variant="error">{error ?? "Kartu tidak ditemukan."}</Alert>;
  }

  async function renew() {
    if (!card) return;
    setBusy(true);
    setActionError(null);

    try {
      const next = await membershipService.renew(card.id);
      swalToast(
        `Kartu baru ${next.number}, berlaku sampai ${formatDate(next.endDate)}.`,
        "success",
      );
      reload();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.fullMessage : "Gagal memperpanjang.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!card) return;
    setBusy(true);
    setActionError(null);

    try {
      await membershipService.cancel(card.id);
      swalToast("Membership dibatalkan.", "success");
      setConfirmCancel(false);
      reload();
    } catch (err) {
      /*
        REFUSED ONCE A BENEFIT HAS BEEN USED, and the server's sentence names
        how many. Shown as it came: the reader's next move is either to reverse
        those transactions or to leave the card to expire, and only the count
        tells them which.
      */
      setActionError(
        err instanceof ApiError ? err.fullMessage : "Gagal membatalkan.",
      );
      setConfirmCancel(false);
    } finally {
      setBusy(false);
    }
  }

  const benefitLabel = (key: string) =>
    card.plan.benefits.find((benefit) => benefit.id === key)?.label ?? key;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted tabular-nums">{card.number}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-foreground">
              {card.plan.name}
            </h2>
            <MembershipStatusBadge status={card.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {card.petName ?? "Hewan"} — {card.customerName ?? "Pemilik"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Can feature="petMemberships" action="create">
            <Button onClick={renew} disabled={busy}>
              Perpanjang
            </Button>
          </Can>
          {card.status !== "cancelled" && (
            <Can feature="petMemberships" action="cancel">
              <Button
                variant="ghost"
                onClick={() => setConfirmCancel(true)}
                disabled={busy}
              >
                Batalkan
              </Button>
            </Can>
          )}
        </div>
      </div>

      {actionError && <Alert variant="error">{actionError}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Kartu">
          <dl className="flex flex-col divide-y divide-border">
            <Row label="Tanggal beli" value={formatDate(card.purchasedAt)} />
            <Row label="Mulai berlaku" value={formatDate(card.startDate)} />
            <Row label="Berakhir" value={formatDate(card.endDate)} />
            <Row
              label="Sisa"
              value={
                card.status === "active" ? `${card.daysLeft} hari` : "—"
              }
            />
            <Row label="Harga paket" value={formatRupiah(card.plan.price)} />
            <Row
              label="Paket"
              value={card.plan.code ?? "—"}
            />
          </dl>

          <p className="mt-4 text-sm text-muted">
            Kartu ini memegang salinan paketnya sendiri —{" "}
            <Link
              href={planHref(card.planId)}
              className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              perubahan pada paket
            </Link>{" "}
            tidak mengubah apa yang sudah dijanjikan di sini.
          </p>

          {card.cancelledAt && (
            <p className="mt-2 text-sm text-danger">
              Dibatalkan {formatDate(card.cancelledAt)}
              {card.cancelReason ? ` — ${card.cancelReason}` : ""}.
            </p>
          )}
        </Card>

        <Card title="Benefit" description="Sisa jatah saat ini.">
          <BenefitList benefits={card.benefits ?? card.plan.benefits} />
        </Card>
      </div>

      <Card
        title="Riwayat pemakaian"
        description="Setiap benefit yang pernah dipakai, dan pembatalannya."
      >
        {!card.history?.length ? (
          <p className="text-sm text-muted">Belum ada benefit yang dipakai.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {card.history.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline justify-between gap-2 py-2 first:pt-0 last:pb-0"
              >
                <div>
                  <p
                    className={`text-sm ${row.reversedAt || row.amount < 0 ? "text-muted line-through" : "text-foreground"}`}
                  >
                    {benefitLabel(row.benefitId)}
                  </p>
                  <p className="text-sm text-muted tabular-nums">
                    {formatDate(row.usedAt)}
                    {row.periodKey ? ` · ${row.periodKey}` : ""} · {row.context}
                  </p>
                </div>
                <p className="text-sm text-muted tabular-nums">
                  {row.amount < 0 ? "dikembalikan" : formatRupiah(row.value)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-sm text-muted">
        <Link
          href={MEMBERSHIP_CARDS_HREF}
          className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          ← Semua kartu
        </Link>
      </p>

      {confirmCancel && (
        <ConfirmDialog
          title="Batalkan membership?"
          confirmLabel="Batalkan"
          destructive
          busy={busy}
          onConfirm={cancel}
          onCancel={() => setConfirmCancel(false)}
        >
          <p>
            Kartu {card.number} akan ditandai dibatalkan dan benefitnya berhenti
            berlaku. Kalau ada benefit yang sudah dipakai, pembatalan ditolak —
            batalkan dulu transaksinya.
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
