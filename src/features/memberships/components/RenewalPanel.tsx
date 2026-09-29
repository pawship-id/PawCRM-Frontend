"use client";

import Link from "next/link";
import { useState } from "react";

import { Alert, Card, FilterSelect, ListFooter, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { membershipService } from "@/services/membership.service";
import { swalToast } from "@/lib/swal";

import { usePetMemberships } from "../hooks/usePetMemberships";
import { cardHref, formatDate } from "../labels";

/**
 * TAWARAN PERPANJANGAN — the cards running out, most urgent first.
 *
 * ─── THIS IS A CALL LIST, NOT A REPORT ─────────────────────────────────────
 *
 * The only thing anybody does with this screen is contact an owner, so the
 * owner's phone number is on every row and there is a one-click way to renew.
 * A list of names with no numbers would be a second lookup per row, which is
 * how a renewal list stops being used in week two.
 *
 * ─── NOTHING HERE SENDS ANYTHING ───────────────────────────────────────────
 *
 * No scheduler runs in this system and no message blaster exists. What is built
 * is the list, at the place the person is already standing. "Salin nomor" is
 * deliberate rather than a WhatsApp deep link: the shop's own phone is where
 * the conversation actually happens.
 *
 * ─── EXPIRED CARDS ARE NOT IN THIS LIST ────────────────────────────────────
 *
 * The API's `expiringSoon` covers ACTIVE cards inside the window only. A card
 * that already lapsed is a different conversation ("ini sudah lewat, mau ambil
 * lagi?") and mixing the two makes the count mean neither. Lapsed cards are
 * renewed from the Kartu tab or the pet profile, which both offer it.
 */

const WINDOW_OPTIONS = [
  { value: "7", label: "7 hari" },
  { value: "14", label: "14 hari" },
  { value: "30", label: "30 hari" },
  { value: "60", label: "60 hari" },
];

export function RenewalPanel() {
  const { memberships, pagination, loading, error, query, patchQuery, reload } =
    usePetMemberships({ page: 1, limit: 20, expiringWithinDays: 30 }, "expiring");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function renew(id: string, number: string) {
    setBusyId(id);
    setActionError(null);

    try {
      const card = await membershipService.renew(id);
      swalToast(
        `${number} diperpanjang — kartu baru ${card.number}, berlaku sampai ${formatDate(card.endDate)}.`,
        "success",
      );
      reload();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.fullMessage
          : "Gagal memperpanjang membership.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function copyPhone(phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
      swalToast("Nomor disalin.", "success");
    } catch {
      swalToast("Gagal menyalin nomor.", "error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Habis dalam"
          value={String(query.expiringWithinDays ?? 30)}
          options={WINDOW_OPTIONS}
          onChange={(value) =>
            patchQuery({ expiringWithinDays: Number(value) })
          }
        />
        <p className="text-sm text-muted">
          Kartu aktif yang akan habis dalam periode ini, paling mendesak dulu.
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {actionError && <Alert variant="error">{actionError}</Alert>}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size={24} />
        </div>
      ) : memberships.length === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-muted">
            Tidak ada membership yang akan habis dalam{" "}
            {query.expiringWithinDays ?? 30} hari ke depan.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {memberships.map((card) => (
            <li key={card.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted tabular-nums">
                      <Link
                        href={cardHref(card.id)}
                        className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {card.number}
                      </Link>
                      {" · "}
                      {card.plan.name}
                    </p>
                    <p className="font-medium text-foreground">
                      {card.petName ?? "Hewan"} — {card.customerName ?? "Pemilik"}
                    </p>
                    <p className="text-sm text-foreground">
                      Habis {formatDate(card.endDate)} ·{" "}
                      <strong>{card.daysLeft} hari lagi</strong>
                    </p>
                    {card.customerPhone && (
                      <p className="text-sm text-muted tabular-nums">
                        {card.customerPhone}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {card.customerPhone && (
                      <Button
                        variant="secondary"
                        onClick={() => copyPhone(card.customerPhone!)}
                      >
                        Salin nomor
                      </Button>
                    )}
                    <Can feature="petMemberships" action="create">
                      <Button
                        onClick={() => renew(card.id, card.number)}
                        disabled={busyId === card.id}
                      >
                        Perpanjang
                      </Button>
                    </Can>
                  </div>
                </div>

                {/*
                  SAYING WHERE THE NEW COVER STARTS, because it is the question
                  every renewal raises and the answer is not obvious: renewing
                  early does NOT throw away the days still left. The new card
                  picks up the day after this one ends.
                */}
                <p className="mt-3 text-sm text-muted">
                  Perpanjangan membuat kartu baru yang mulai berlaku{" "}
                  {formatDate(
                    new Date(
                      new Date(card.endDate).getTime() + 86_400_000,
                    ).toISOString(),
                  )}
                  , jadi sisa hari di kartu ini tidak hangus.
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {pagination && pagination.total > 0 && (
        <ListFooter
          page={pagination.page}
          pageSize={pagination.limit}
          pageSizes={[20, 50, 100]}
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
