"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { useState } from "react";

import {
  Alert,
  Card,
  FilterBar,
  FilterSearch,
  FilterSelect,
  FilterToggle,
  ListFooter,
  Spinner,
  withAll,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
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
import { MEMBERSHIP_HREF, formatDuration, formatRupiah, planHref } from "../labels";

/**
 * The membership CATALOGUE — what a shop sells.
 *
 * A QUICK BAR, not a filter panel (ui-rules §8): two single-selects and a
 * search, all auto-applying, no multi-select and no date range. Three fields is
 * well under the panel's floor, and a panel would put one click behind two.
 */

const SORT_OPTIONS = [
  { value: "newest", label: "Terbaru" },
  { value: "nameAsc", label: "Nama A–Z" },
  { value: "priceHighest", label: "Harga tertinggi" },
  { value: "priceLowest", label: "Harga terendah" },
];

const STATUS_OPTIONS = withAll(
  [
    { value: "true", label: "Masih dijual" },
    { value: "false", label: "Tidak dijual" },
  ],
  "Semua",
);

export function MembershipPlansPanel() {
  const { plans, pagination, loading, error, query, patchQuery, reload } =
    useMembershipPlans();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  /*
    RESTORE LIVES ON THE ROW, not on a detail screen, because a deleted plan has
    no detail screen to open — `GET /membership-plans/:id` answers 404 for one.
    The row is the only place the plan exists at all.
  */
  async function restore(id: string, name: string) {
    setBusyId(id);
    setActionError(null);

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
      setActionError(
        err instanceof ApiError ? err.fullMessage : "Gagal memulihkan paket.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        search={
          <FilterSearch
            value={query.search ?? ""}
            onChange={(value) => patchQuery({ search: value })}
            ariaLabel="Cari paket membership"
            placeholder="Cari nama atau kode paket"
          />
        }
        actions={
          <Can feature="membershipPlans" action="create">
            <Button asChild>
              <Link href={`${MEMBERSHIP_HREF}/new`}>
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
      {actionError && <Alert variant="error">{actionError}</Alert>}

      <Card>
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size={24} />
          </div>
        ) : plans.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Belum ada paket membership.{" "}
            <Link
              href={`${MEMBERSHIP_HREF}/new`}
              className="font-medium text-primary underline underline-offset-2"
            >
              Tambah yang pertama →
            </Link>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paket</TableHead>
                <TableHead>Kode</TableHead>
                <TableHead className="text-right">Harga</TableHead>
                <TableHead>Masa berlaku</TableHead>
                <TableHead className="text-right">Benefit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="sr-only">Tindakan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id}>
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
                    {plan.description && (
                      <p className="text-sm text-muted">{plan.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{plan.code}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRupiah(plan.price)}
                  </TableCell>
                  <TableCell>{formatDuration(plan.durationDays)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {plan.benefits.length}
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
                    {plan.deletedAt ? (
                      <span className="inline-flex items-center rounded-full bg-danger/15 px-2.5 py-0.5 text-sm font-medium text-danger-ink">
                        Dihapus
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${
                          plan.isActive
                            ? "bg-success-fill text-foreground"
                            : "bg-surface-hover text-muted"
                        }`}
                      >
                        {plan.isActive ? "Dijual" : "Tidak dijual"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {plan.deletedAt && (
                      <Can feature="membershipPlans" action="restore">
                        <Button
                          variant="secondary"
                          onClick={() => restore(plan.id, plan.name)}
                          disabled={busyId === plan.id}
                        >
                          Pulihkan
                        </Button>
                      </Can>
                    )}
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
    </div>
  );
}
