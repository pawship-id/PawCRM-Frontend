"use client";

import Link from "next/link";

import {
  Alert,
  Card,
  FilterBar,
  FilterMultiSelect,
  FilterSearch,
  ListFooter,
  Spinner,
} from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MembershipStatusFilter } from "@/types/membership";

import { CARD_PAGE_SIZE, usePetMemberships } from "../hooks/usePetMemberships";
import { STATUS_LABEL, cardHref, formatDate } from "../labels";
import { MembershipStatusBadge } from "./MembershipStatusBadge";

/**
 * Every membership card in the shop.
 *
 * A MULTI-SELECT PUTS THIS ON A FILTER PANEL BY THE LETTER OF ui-rules §8 —
 * "any multi-select" — but the multi-select carries its own Terapkan inside its
 * popover, which is what that rule is protecting against (a table re-querying
 * while somebody composes). With two controls and a search there is nothing
 * else to compose, so the bar stands. If a third filter lands here, it moves.
 *
 * STATUSES ARE OR'D: "Aktif ATAU akan habis" is one ordinary question, and a
 * card that is both matches once.
 */

const STATUS_OPTIONS: { value: MembershipStatusFilter; label: string }[] = [
  { value: "active", label: STATUS_LABEL.active },
  { value: "scheduled", label: STATUS_LABEL.scheduled },
  { value: "expired", label: STATUS_LABEL.expired },
  { value: "cancelled", label: STATUS_LABEL.cancelled },
  { value: "expiringSoon", label: "Akan habis" },
];

export function MembershipCardsPanel() {
  const { memberships, pagination, loading, error, query, patchQuery } =
    usePetMemberships();

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        search={
          <FilterSearch
            value={query.search ?? ""}
            onChange={(value) => patchQuery({ search: value })}
            ariaLabel="Cari kartu membership"
            placeholder="Cari nomor kartu atau paket"
          />
        }
      >
        <FilterMultiSelect
          label="Status"
          values={query.status ?? []}
          options={STATUS_OPTIONS}
          onApply={(values) =>
            patchQuery({ status: values as MembershipStatusFilter[] })
          }
          onReset={() => patchQuery({ status: undefined })}
        />
      </FilterBar>

      {error && <Alert variant="error">{error}</Alert>}

      <Card>
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size={24} />
          </div>
        ) : memberships.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            Belum ada kartu membership. Terbitkan dari profil hewan.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Hewan</TableHead>
                <TableHead>Pemilik</TableHead>
                <TableHead>Paket</TableHead>
                <TableHead>Dibeli</TableHead>
                <TableHead>Berlaku</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberships.map((card) => (
                <TableRow key={card.id}>
                  <TableCell className="tabular-nums">
                    <Link
                      href={cardHref(card.id)}
                      className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {card.number}
                    </Link>
                  </TableCell>
                  <TableCell>{card.petName ?? "—"}</TableCell>
                  <TableCell>{card.customerName ?? "—"}</TableCell>
                  <TableCell>{card.plan.name ?? "—"}</TableCell>
                  {/*
                    DIBELI AND BERLAKU ARE TWO COLUMNS, not one, because they are
                    two dates and the whole module is built on their being
                    allowed to differ.
                  */}
                  <TableCell className="tabular-nums">
                    {formatDate(card.purchasedAt)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDate(card.startDate)} – {formatDate(card.endDate)}
                    {card.status === "active" && (
                      <span className="block text-sm text-muted">
                        {card.daysLeft} hari lagi
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <MembershipStatusBadge status={card.status} />
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
          pageSizes={[CARD_PAGE_SIZE, 50, 100]}
          total={pagination.total}
          totalPages={pagination.totalPages}
          unit="kartu"
          onPageChange={(page) => patchQuery({ page })}
          onPageSizeChange={(limit) => patchQuery({ limit })}
        />
      )}
    </div>
  );
}
