"use client";

import { useCallback, useEffect, useState } from "react";

import { Card, InfoTooltip } from "@/components";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/features/memberships/labels";
import { membershipFailure } from "@/features/memberships/errors";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { membershipService } from "@/services/membership.service";
import type { RecognitionSummary } from "@/types/membership";

/**
 * "SALDO MEMBERSHIP BELUM DIAKUI" (PLAN-Membership-Pengakuan-Pendapatan.md) —
 * the money of deferred cards still sitting in Pendapatan Diterima di Muka.
 *
 * HIDDEN FOR A TENANT THAT HAS NEVER DEFERRED: no open card and the default
 * still "langsung saat terjual" means there is nothing here to read.
 *
 * "JALANKAN PENGAKUAN SEKARANG" runs the month-end job by hand. The scheduler
 * already does it daily; the button is for checking and for catching up, and
 * it is safe to press twice — a month already posted is skipped.
 */
export function UnrecognizedBalanceCard({ branchId }: { branchId: string }) {
  const { can } = usePermissions();
  const [summary, setSummary] = useState<RecognitionSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    membershipService
      .recognitionSummary(branchId ? { branchId } : {})
      .then((result) => {
        if (active) setSummary(result);
      })
      .catch(() => {
        if (active) setSummary(null);
      });
    return () => {
      active = false;
    };
  }, [branchId, version]);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      const result = await membershipService.runRecognition({ branchId: branchId || null });
      if (result.failures.length) {
        swalToast(
          `${result.posted} pengakuan tercatat, ${result.failures.length} kartu gagal: ${result.failures[0].number} — ${result.failures[0].message}`,
          "error",
          8000,
        );
      } else {
        swalToast(
          result.posted
            ? `${result.posted} pengakuan tercatat dari ${result.cards} kartu.`
            : "Tidak ada pengakuan yang jatuh tempo. Semua bulan yang sudah lewat sudah tercatat.",
        );
      }
      setVersion((value) => value + 1);
    } catch (err) {
      swalToast(membershipFailure(err, "Pengakuan gagal dijalankan.").toast, "error", 6000);
    } finally {
      setRunning(false);
    }
  }, [branchId]);

  if (!summary || (summary.cards === 0 && summary.recognition === "immediate")) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-sm text-muted">
            Saldo membership belum diakui
            <InfoTooltip hint="Uang paket diterima di muka yang belum jadi pendapatan. Diakui per hari tiap akhir bulan, atau setiap jatah dipakai, sampai kartunya habis. Saldonya sama dengan akun Pendapatan Diterima di Muka untuk membership." />
          </p>
          <p className="text-3xl font-semibold tabular-nums">{formatRupiah(summary.unrecognized)}</p>
          <p className="text-sm text-muted">dari {summary.cards} kartu yang masih berjalan</p>
        </div>
        {can("petMemberships", "manage") ? (
          <Button type="button" variant="secondary" onClick={run} disabled={running}>
            {running ? "Menjalankan…" : "Jalankan pengakuan sekarang"}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
