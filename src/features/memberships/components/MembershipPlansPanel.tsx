"use client";

import Link from "next/link";
import { EllipsisVertical, Eye, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";

import { useState } from "react";

import {
  Alert,
  Card,
  ConfirmDialog,
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  ListFooter,
  Spinner,
  withAll,
} from "@/components";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Can } from "@/features/permissions";
import { membershipService } from "@/services/membership.service";
import { swalToast } from "@/lib/swal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  PLAN_PAGE_SIZE,
  useMembershipPlans,
} from "../hooks/useMembershipPlans";
import { membershipFailure } from "../errors";
import {
  ATTACH_TO_LABEL,
  ELIGIBILITY_LABEL,
  MEMBERSHIP_NEW_PLAN_HREF,
  benefitChip,
  formatPlanDuration,
  formatRupiah,
  planEditHref,
  planHref,
} from "../labels";
import type { AttachTo, Eligibility, MembershipPlan } from "@/types/membership";
import { toMinor } from "@/utils/decimal";

import { ToneBadge } from "./MembershipStatusBadge";

/**
 * The membership CATALOGUE — what a shop sells (BO prototype `membershipPaket`).
 *
 * A QUICK BAR, not a filter panel (ui-rules §8): Status, Melekat ke, Syarat
 * pembeli and the ordering, all single-selects that auto-apply, plus the
 * "terhapus" toggle and search. Search LEADS the row (`searchPlacement`), as in
 * the prototype: a shop looking for one package types its code or name first.
 *
 * BENEFITS ARE CHIPS, AND SHORT (BO, 16 October 2026): at most two —
 * "Grooming 1×", "Add-on ∞" — then "+n". The sentence lives on the detail.
 *
 * NO "ANGGOTA AKTIF" COLUMN: the plan list does not carry a member count (the
 * contract has none per plan), and a column of dashes would read as zero.
 */

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru" },
  { value: "nameAsc", label: "Nama A–Z" },
  { value: "priceHighest", label: "Harga tertinggi" },
  { value: "priceLowest", label: "Harga terendah" },
];

const STATUS_OPTIONS = withAll(
  [
    { value: "true", label: "Aktif" },
    { value: "false", label: "Nonaktif" },
  ],
  "Semua",
);

const ATTACH_OPTIONS = withAll(
  (Object.keys(ATTACH_TO_LABEL) as AttachTo[]).map((value) => ({
    value,
    label: ATTACH_TO_LABEL[value],
  })),
  "Semua",
);

const ELIGIBILITY_OPTIONS = withAll(
  (Object.keys(ELIGIBILITY_LABEL) as Eligibility[]).map((value) => ({
    value,
    label: ELIGIBILITY_LABEL[value],
  })),
  "Semua",
);

/** "Rp 450.000" — or "Rp 450.000–750.000" across a per-variant plan's rows. */
export function planPriceText(plan: Pick<MembershipPlan, "price" | "priceMode" | "variantPrices">): string {
  if (plan.priceMode !== "variant" || !plan.variantPrices?.length) return formatRupiah(plan.price);

  const sorted = [...plan.variantPrices]
    .map((row) => row.price)
    .sort((a, b) => Number((toMinor(a) ?? 0n) - (toMinor(b) ?? 0n)));
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  if (toMinor(low) === toMinor(high)) return formatRupiah(low);
  return `${formatRupiah(low)}–${formatRupiah(high).replace(/^\D+/, "")}`;
}

export function MembershipPlansPanel() {
  const { plans, pagination, loading, error, query, patchQuery, reload } =
    useMembershipPlans();

  const [busyId, setBusyId] = useState<string | null>(null);
  /** Paket yang sedang ditanyakan "yakin dihapus?" — null berarti tidak ada. */
  const [pendingDelete, setPendingDelete] = useState<MembershipPlan | null>(
    null,
  );

  /*
    RESTORE LIVES ON THE ROW, not on a detail screen, because a deleted plan has
    no detail screen to open — `GET /membership-plans/:id` answers 404 for one.
    The row is the only place the plan exists at all.
  */
  async function restore(id: string, name: string) {
    setBusyId(id);

    try {
      await membershipService.restorePlan(id);
      swalToast(`"${name}" dipulihkan.`, "success");
      reload();
    } catch (err) {
      /*
        409 HERE IS THE INTERESTING ONE: the code index is partial on
        `deletedAt`, so a replacement may have taken the code while this plan
        was away. The server says so in a sentence; replacing it with "gagal"
        would throw away the only part worth reading.
      */
      swalToast(membershipFailure(err, "Gagal memulihkan paket.").toast, "error", 6000);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(plan: MembershipPlan) {
    setBusyId(plan.id);

    try {
      await membershipService.removePlan(plan.id);
      swalToast("Paket membership dihapus.", "success");
      setPendingDelete(null);
      reload();
    } catch (err) {
      /*
        409 DI SINI YANG PALING BERGUNA dan ditampilkan apa adanya: ia menyebut
        berapa kartu yang masih berjalan di paket itu dan menyuruh pembacanya
        mematikan penjualan saja. Menggantinya dengan "gagal menghapus" membuang
        satu-satunya bagian yang layak dibaca.
      */
      swalToast(membershipFailure(err, "Gagal menghapus paket.").toast, "error", 6000);
      setPendingDelete(null);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        searchPlacement="leading"
        search={
          <FilterSearch
            value={query.search ?? ""}
            onChange={(value) => patchQuery({ search: value })}
            ariaLabel="Cari paket membership"
            placeholder="Cari kode atau nama paket"
          />
        }
        actions={
          <Can feature="membershipPlans" action="create">
            <Button asChild>
              <Link href={MEMBERSHIP_NEW_PLAN_HREF}>
                <Plus className="size-4" aria-hidden />
                Paket baru
              </Link>
            </Button>
          </Can>
        }
      >
        <FilterSelect
          label="Status"
          value={
            query.isActive === undefined ? "" : String(query.isActive)
          }
          options={STATUS_OPTIONS}
          onChange={(value) =>
            patchQuery({ isActive: value === "" ? undefined : value === "true" })
          }
        />
        <FilterSelect
          label="Melekat ke"
          value={query.attachTo ?? ""}
          options={ATTACH_OPTIONS}
          onChange={(value) => patchQuery({ attachTo: (value || undefined) as AttachTo | undefined })}
        />
        <FilterSelect
          label="Syarat pembeli"
          value={query.eligibility ?? ""}
          options={ELIGIBILITY_OPTIONS}
          onChange={(value) =>
            patchQuery({ eligibility: (value || undefined) as Eligibility | undefined })
          }
        />
        <FilterSelect
          label="Urutkan"
          value={query.sort ?? "newest"}
          options={SORT_OPTIONS}
          onChange={(value) => patchQuery({ sort: value })}
        />
        <FilterToggle
          label="Tampilkan terhapus"
          checked={query.includeDeleted ?? false}
          onChange={(checked) =>
            patchQuery({ includeDeleted: checked || undefined })
          }
        />
      </FilterBar>

      {error && <Alert variant="error">{error}</Alert>}

      {/*
        RAPAT DI TEPINYA. Kartu ini membungkus tabel, bukan teks — 24px di
        keempat sisinya (`py-6` + `px-6` milik CardContent) menyisakan lajur
        kosong di kiri-kanan tabel yang sudah punya padding selnya sendiri.
        Ditipiskan dari LUAR lewat `data-slot`, karena `components/ui/card.tsx`
        dipakai setiap kartu di aplikasi ini (ui-rules §14).
      */}
      <Card className="py-3 [&>[data-slot=card-content]]:px-3">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size={24} />
          </div>
        ) : plans.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Belum ada paket membership.{" "}
            <Link
              href={MEMBERSHIP_NEW_PLAN_HREF}
              className="font-medium text-primary underline underline-offset-2"
            >
              Tambah yang pertama →
            </Link>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Paket</TableHead>
                <TableHead>Melekat ke</TableHead>
                <TableHead>Syarat pembeli</TableHead>
                <TableHead className="text-right">Durasi</TableHead>
                <TableHead className="text-right">Harga</TableHead>
                <TableHead className="text-right">Anggota aktif</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">{plan.code}</TableCell>
                  <TableCell>
                    {/*
                      A DELETED ROW IS NOT A LINK. Its detail screen answers 404,
                      and a link that leads nowhere is worse than plain text.
                    */}
                    {plan.deletedAt ? (
                      <span className="font-medium text-muted">{plan.name}</span>
                    ) : (
                      <Link
                        href={planHref(plan.id)}
                        className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {plan.name}
                      </Link>
                    )}
                    <BenefitChips plan={plan} />
                  </TableCell>
                  <TableCell>
                    <ToneBadge tone="brand" label={ATTACH_TO_LABEL[plan.attachTo ?? "pet"]} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {ELIGIBILITY_LABEL[plan.eligibility ?? "all"]}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatPlanDuration(plan)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {planPriceText(plan)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {plan.activeMembers ?? "—"}
                  </TableCell>
                  <TableCell>
                    {/*
                      A WORD, NOT A DOT. "Masih dijual" is a state somebody acts
                      on — it decides whether the package appears at the till —
                      so it is spelled out rather than tinted.

                      DELETED BEATS "tidak dijual", because they are not degrees
                      of the same thing: one is a package the shop has stopped
                      offering, the other is a row that is gone. A deleted plan
                      that read "Tidak dijual" would look like something that
                      could be switched back on from the detail screen, which
                      404s.
                    */}
                    <div className="flex flex-wrap gap-1">
                      {plan.deletedAt ? (
                        <ToneBadge tone="danger" label="Dihapus" />
                      ) : (
                        <ToneBadge
                          tone={plan.isActive ? "success" : "neutral"}
                          label={plan.isActive ? "Aktif" : "Nonaktif"}
                        />
                      )}
                      {!plan.deletedAt && plan.publicDisplay?.visible && (
                        <ToneBadge tone="info" label="Website" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            className="size-9"
                            disabled={busyId === plan.id}
                            /* Menyebut barisnya: dua puluh tombol "Aksi" yang
                               identik tidak mengatakan apa pun ke pembaca layar. */
                            aria-label={`Aksi untuk ${plan.name}`}
                          >
                            <EllipsisVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end">
                          {plan.deletedAt ? (
                            /*
                              PAKET TERHAPUS TIDAK PUNYA DETAIL untuk dibuka dan
                              tidak ada yang bisa diubah — `GET /membership-plans/:id`
                              menjawab 404 untuknya. Memulihkan satu-satunya
                              langkah yang tersisa, jadi itu saja isinya.
                            */
                            <Can feature="membershipPlans" action="restore">
                              <DropdownMenuItem
                                onSelect={() => restore(plan.id, plan.name)}
                              >
                                <RotateCcw />
                                Pulihkan
                              </DropdownMenuItem>
                            </Can>
                          ) : (
                            <>
                              <DropdownMenuItem asChild>
                                <Link href={planHref(plan.id)}>
                                  <Eye />
                                  Detail
                                </Link>
                              </DropdownMenuItem>
                              <Can feature="membershipPlans" action="update">
                                <DropdownMenuItem asChild>
                                  <Link href={planEditHref(plan.id)}>
                                    <Pencil />
                                    Ubah
                                  </Link>
                                </DropdownMenuItem>
                              </Can>
                              <Can feature="membershipPlans" action="delete">
                                <DropdownMenuItem
                                  variant="destructive"
                                  onSelect={() => setPendingDelete(plan)}
                                >
                                  <Trash2 />
                                  Hapus
                                </DropdownMenuItem>
                              </Can>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {pagination && pagination.total > 0 && (
        <ListFooter
          page={pagination.page}
          pageSize={pagination.limit}
          pageSizes={[PLAN_PAGE_SIZE, 50, 100]}
          total={pagination.total}
          totalPages={pagination.totalPages}
          unit="paket"
          onPageChange={(page) => patchQuery({ page })}
          onPageSizeChange={(limit) => patchQuery({ limit })}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Hapus paket membership?"
          confirmLabel="Hapus"
          destructive
          busy={busyId === pendingDelete.id}
          onConfirm={() => remove(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        >
          <p>
            &ldquo;{pendingDelete.name}&rdquo; akan dihapus. Kalau maksudnya
            hanya berhenti menjual paket ini, pakai{" "}
            <strong>Nonaktifkan</strong> di halaman paketnya — kartu yang
            sudah terbit tetap berlaku.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** At most two short chips, then "+n" — the BO's rule for list tags. */
function BenefitChips({ plan }: { plan: MembershipPlan }) {
  if (!plan.benefits.length) return null;
  const shown = plan.benefits.slice(0, 2);
  const more = plan.benefits.length - shown.length;

  return (
    <ul className="mt-1 flex flex-wrap gap-1" aria-label={`Benefit ${plan.name}`}>
      {shown.map((benefit) => (
        <li
          key={benefit.id}
          className="rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-foreground"
        >
          {benefitChip(benefit)}
        </li>
      ))}
      {more > 0 && (
        <li className="rounded-full bg-tint-neutral px-2 py-0.5 text-xs font-medium text-muted">
          +{more}
        </li>
      )}
    </ul>
  );
}
