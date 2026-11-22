"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import { Alert, Card, ConfirmDialog, Spinner } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can, usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { hotelStayService } from "@/services/hotel.service";
import { tenantService } from "@/services/tenant.service";
import type { HotelSettings, HotelStayBooking } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

import { HOTEL_BOOKINGS_PATH, hotelBookingEditPath } from "../paths";
import { withHotelDefaults } from "../settings";
import {
  addonCount,
  longDate,
  roomText,
  shortDate,
  STAY_STATUS,
  stayFlag,
} from "../stay";
import { HotelStayChecklist } from "./HotelStayChecklist";
import { HotelStayDialog, type StayAction } from "./HotelStayDialogs";
import { StayBillBadge } from "./StayBillBadge";
import { StayKasirCard } from "./StayKasirCard";
import { StayCommissionCard } from "./StayCommissionCard";

/**
 * One hotel stay, whole (21 November 2026, PLAN-Hotel-V1.md §4.5): who and
 * where, the care, the belongings, the daily checklist, the add-ons, the bill
 * and — for Owner and Manager — what it earned staff. Check-in, Perpanjang and
 * Check-out open their dialogs; Ubah opens the edit page.
 */
export function HotelStayDetailScreen({ stayId }: { stayId: string }) {
  const router = useRouter();
  const { can } = usePermissions();
  const [booking, setBooking] = useState<HotelStayBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<StayAction | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<HotelSettings>(
    withHotelDefaults(undefined),
  );

  const load = useCallback(() => {
    hotelStayService
      .get(stayId)
      .then((result) => {
        setBooking(result);
        setError(null);
      })
      .catch((err: unknown) =>
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Booking hotel tidak bisa dimuat.",
        ),
      );
  }, [stayId]);

  useEffect(() => {
    load();
    tenantService
      .me()
      .then((tenant) => setSettings(withHotelDefaults(tenant.settings?.hotel)))
      .catch(() => undefined);
  }, [load]);

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="error">{error}</Alert>
        <div>
          <Button asChild variant="secondary">
            <Link href={HOTEL_BOOKINGS_PATH}>Kembali ke booking hotel</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (!booking) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat booking hotel…
      </div>
    );
  }

  const { stay, stayFacts } = booking;
  const tone = STAY_STATUS[booking.status] ?? STAY_STATUS.confirmed;
  const flag = stayFlag(booking, stayFacts.today);
  const mayUpdate = can("bookings", "update");

  async function cancel() {
    setBusy(true);
    try {
      setBooking(await hotelStayService.cancel(stayId));
      setCancelling(false);
      swalToast(`Booking ${booking?.bookingNumber ?? ""} dibatalkan.`);
    } catch (err) {
      swalToast(
        err instanceof ApiError
          ? (err.reason ?? err.fullMessage)
          : "Belum bisa dibatalkan.",
        "error",
        6000,
      );
    } finally {
      setBusy(false);
    }
  }

  const facts: [string, string][] = [
    ["Pemilik", booking.customerName ?? "—"],
    ["Hewan", booking.petName ?? "—"],
    [
      "Layanan",
      `${booking.service.name} · ${formatMoney(stay.nightPrice)} / malam`,
    ],
    ["Kamar", roomText(stay)],
    [
      "Masuk",
      `${longDate(stay.checkInDate)} · ${stay.checkedInAt ? `${timeOf(stay.checkedInAt)} (datang)` : `${stay.arrivalTime ?? "—"} (rencana)`}`,
    ],
    [
      "Keluar",
      `${longDate(stayFacts.end)} · ${stay.checkedOutAt ? `${timeOf(stay.checkedOutAt)} (dijemput)` : `${stay.pickupTime ?? "—"} (rencana)`}${
        stay.leftDate
          ? ` · lebih awal dari rencana ${shortDate(stay.checkOutDate)}`
          : ""
      }`,
    ],
    ["Lama menginap", `${stayFacts.nights} malam`],
  ];
  if (stay.conditionIn) facts.push(["Kondisi saat datang", stay.conditionIn]);
  if (stay.conditionOut) facts.push(["Kondisi saat pulang", stay.conditionOut]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <Link
          href={HOTEL_BOOKINGS_PATH}
          aria-label="Kembali ke booking hotel"
          className="flex size-11 flex-none items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted">
            Layanan / Hotel / Booking
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold text-foreground">
              {booking.petName}
            </h1>
            <span className="text-base font-semibold tabular-nums text-muted">
              {booking.bookingNumber}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={cn("border-transparent", tone.className)}
            >
              {tone.label}
            </Badge>
            {flag && (
              <Badge
                variant="outline"
                className="border-transparent bg-tint-warning text-warning"
              >
                {flag}
              </Badge>
            )}
            <StayBillBadge booking={booking} />
            {stayFacts.priceEdited && (
              <Badge
                variant="outline"
                className="border-transparent bg-tint-neutral text-muted"
              >
                Harga diubah
              </Badge>
            )}
          </div>
        </div>
        {mayUpdate && booking.status !== "cancelled" && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href={hotelBookingEditPath(booking._id)}>
                <Pencil className="size-4" />
                Ubah
              </Link>
            </Button>
            {booking.status === "confirmed" && (
              <>
                <Button variant="secondary" onClick={() => setCancelling(true)}>
                  Batalkan
                </Button>
                <Button onClick={() => setActing("checkin")}>Check-in</Button>
              </>
            )}
            {booking.status === "in_progress" && (
              <>
                <Button variant="secondary" onClick={() => setActing("extend")}>
                  Perpanjang
                </Button>
                <Button onClick={() => setActing("checkout")}>Check-out</Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Detail menginap">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold text-muted">{label}</dt>
                  <dd className="text-sm font-semibold text-foreground">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="Instruksi perawatan">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {(
                [
                  [
                    "Makanan",
                    stay.care.food === "hotel" ? "Dari hotel" : "Dari pemilik",
                  ],
                  ["Porsi & jadwal", stay.care.portion || "—"],
                  [
                    "Obat",
                    stay.care.medicine
                      ? `${stay.care.medicine} · jam ${stay.care.medicineTime ?? "—"}`
                      : "Tidak ada",
                  ],
                  ["Catatan perilaku", stay.care.behaviour || "—"],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold text-muted">{label}</dt>
                  <dd className="text-sm font-semibold text-foreground">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="Barang bawaan">
            {booking.belongings.length === 0 ? (
              <p className="text-sm text-muted">
                {booking.status === "confirmed"
                  ? "Barang bawaan dicatat saat check-in."
                  : "Tidak ada barang bawaan."}
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                {booking.belongings.map((row) => (
                  <li
                    key={row._id}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-2.5",
                      row.checkedOutAt && "bg-tint-success/40",
                    )}
                  >
                    <span>
                      {row.name}{" "}
                      <span className="text-muted tabular-nums">
                        ×{row.qty ?? 1}
                      </span>
                    </span>
                    {booking.status === "completed" ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          "border-transparent",
                          row.checkedOutAt
                            ? "bg-tint-success text-success"
                            : "bg-tint-warning text-warning",
                        )}
                      >
                        {row.checkedOutAt ? "Dikembalikan" : "Tidak kembali"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted">
                        Dicek saat check-out
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {stay.belongingsNote && (
              <p className="mt-3 rounded-lg bg-tint-neutral px-4 py-3 text-sm">
                {stay.belongingsNote}
              </p>
            )}
          </Card>

          <Card
            title="Checklist harian"
            description="Jam tiap kegiatan berlaku untuk semua malam — ubah lewat Ubah booking."
          >
            <HotelStayChecklist
              booking={booking}
              split={settings.commission.split}
              mayTick={
                can("bookings", "update") || can("bookings", "advanceStatus")
              }
              onChanged={setBooking}
            />
          </Card>

          <Card title="Add-on">
            {booking.service.addons.filter((addon) => addon.hotel).length ===
            0 ? (
              <p className="text-sm text-muted">
                Belum ada add-on. Tambahkan lewat Ubah booking.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                {booking.service.addons
                  .filter((addon) => addon.hotel)
                  .map((addon) => {
                    const count = addonCount(addon.hotel, stay);
                    return (
                      <li
                        key={addon.itemId}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <span>
                          <span className="block font-semibold">
                            {addon.name}
                          </span>
                          <span className="block text-xs text-muted tabular-nums">
                            {addon.hotel!.unit === "night"
                              ? `${count} malam mulai ${shortDate(addon.hotel!.date)}`
                              : `${count} kali · ${shortDate(addon.hotel!.date)}${addon.hotel!.time ? ` ${addon.hotel!.time}` : ""}`}{" "}
                            × {formatMoney(addon.hotel!.unitPrice)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <b className="tabular-nums">
                            {formatMoney(addon.price)}
                          </b>
                          <Badge
                            variant="outline"
                            className={cn(
                              "border-transparent",
                              addon.posTransactionId
                                ? "bg-tint-success text-success"
                                : "bg-tint-neutral text-muted",
                            )}
                          >
                            {addon.posTransactionId
                              ? "Sudah ditagih"
                              : "Belum ditagih"}
                          </Badge>
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Card>

          <Can feature="commissionReports" action="read">
            <StayCommissionCard booking={booking} />
          </Can>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-20">
          <StayKasirCard
            booking={booking}
            onOpenKasir={(path) => router.push(path)}
          />
        </aside>
      </div>

      {acting && (
        <HotelStayDialog
          action={acting}
          booking={booking}
          onClose={() => setActing(null)}
          onDone={(updated) => {
            setActing(null);
            setBooking(updated);
          }}
        />
      )}
      {cancelling && (
        <ConfirmDialog
          title={`Batalkan booking ${booking.bookingNumber ?? ""}?`}
          confirmLabel="Batalkan booking"
          destructive
          busy={busy}
          onConfirm={() => void cancel()}
          onCancel={() => setCancelling(false)}
        >
          Booking {booking.petName} dibatalkan dan kamarnya kosong lagi. Kalau
          sudah ada pembayaran, batalkan atau retur fakturnya dulu di Penjualan.
        </ConfirmDialog>
      )}
    </div>
  );
}

function timeOf(instant: string): string {
  const date = new Date(instant);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
