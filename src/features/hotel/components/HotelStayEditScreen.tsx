"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Card,
  FormActionBar,
  SelectField,
  Spinner,
  TextField,
} from "@/components";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/features/permissions";
import { PageHeading } from "@/features/purchasing";
import { useHotelRoomTypes } from "@/hooks/useHotelRoomTypes";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { hotelStayService } from "@/services/hotel.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import type {
  HotelStayBooking,
  Pet,
  Service,
  UpdateHotelStayInput,
} from "@/types/api";
import { formatMoney } from "@/utils/decimal";

import { HOTEL_PATH, hotelBookingPath } from "../paths";
import { addDays, daysBetween, longDate } from "../stay";
import {
  petDraftOf,
  petPatch,
  petProblem,
  previewBill,
  type PetDraft,
} from "../stayDraft";
import { StayPetFields } from "./StayPetFields";

/**
 * Ubah booking hotel (21 November 2026, PLAN-Hotel-V1.md §4.2). What may change
 * follows the stay: everything while Dipesan; all but the check-in date while
 * Menginap; only the care, the conditions and the clock times once Selesai.
 * Add-ons already billed are shown locked.
 */
export function HotelStayEditScreen({ stayId }: { stayId: string }) {
  const router = useRouter();
  const { can } = usePermissions();
  const mayPrice = can("bookings", "setPrice");
  const roomTypes = useHotelRoomTypes();
  const [booking, setBooking] = useState<HotelStayBooking | null>(null);
  const [pet, setPet] = useState<Pet | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [addons, setAddons] = useState<Service[]>([]);
  const [draft, setDraft] = useState<PetDraft | null>(null);
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [conditionIn, setConditionIn] = useState("");
  const [conditionOut, setConditionOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      hotelStayService.get(stayId),
      serviceService.list({
        serviceKind: "hotel",
        serviceType: "main",
        limit: 100,
      }),
      serviceService.list({ serviceType: "addon", limit: 100 }),
    ])
      .then(async ([stay, mains, extras]) => {
        if (!active) return;
        setBooking(stay);
        setServices(
          mains.items.filter((service) => service.serviceKind === "hotel"),
        );
        setAddons(extras.items);
        setDraft(petDraftOf(stay));
        setCheckInDate(stay.stay.checkInDate);
        setCheckOutDate(stay.stay.checkOutDate);
        setArrivalTime(stay.stay.arrivalTime ?? "");
        setPickupTime(stay.stay.pickupTime ?? "");
        setConditionIn(stay.stay.conditionIn ?? "");
        setConditionOut(stay.stay.conditionOut ?? "");
        if (stay.petId) setPet(await petService.getById(stay.petId));
      })
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof ApiError
              ? err.fullMessage
              : "Booking hotel tidak bisa dimuat.",
          );
      });
    return () => {
      active = false;
    };
  }, [stayId]);

  const dates = useMemo(
    () => ({ checkInDate, checkOutDate }),
    [checkInDate, checkOutDate],
  );

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!booking || !draft || !pet) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat booking hotel…
      </div>
    );
  }

  const status = booking.status;
  const done = status === "completed";
  const nights = Math.max(0, daysBetween(checkInDate, checkOutDate));
  const service = services.find((one) => one._id === draft.serviceId);
  const catalog = booking.stay.nightCatalogPrice;
  const bill = previewBill(draft, dates, {
    serviceName: service?.name ?? booking.service.name,
    catalogPrice: catalog,
  });
  const numbered =
    roomTypes.items.find((roomType) => roomType._id === draft.roomTypeId)
      ?.mode === "numbered";
  const problem = done
    ? null
    : nights < 1
      ? "tanggal keluar harus setelah tanggal masuk"
      : petProblem(draft, { numbered, petName: pet.name });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (problem || saving || !draft || !booking) return;
    setSaving(true);
    const stepTimes = Object.entries(draft.stepTimes).map(
      ([stepName, time]) => ({ stepName, time: time || null }),
    );
    const patch: UpdateHotelStayInput = done
      ? { care: draft.care, conditionIn, conditionOut, stepTimes }
      : {
          ...(status === "confirmed" ? { checkInDate } : {}),
          checkOutDate,
          arrivalTime: arrivalTime || null,
          pickupTime: pickupTime || null,
          ...petPatch(draft),
          ...(status === "in_progress" ? { conditionIn } : {}),
        };
    try {
      const updated = await hotelStayService.update(booking._id, patch);
      swalToast(
        updated.netAmount !== booking.netAmount
          ? `Perubahan tersimpan. Total ${formatMoney(booking.netAmount)} → ${formatMoney(updated.netAmount)}.`
          : "Perubahan tersimpan.",
      );
      router.push(hotelBookingPath(booking._id));
    } catch (err) {
      swalToast(
        err instanceof ApiError
          ? (err.reason ?? err.fullMessage)
          : "Perubahan belum tersimpan. Coba lagi.",
        "error",
        6000,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <PageHeading
        crumbs={[
          { label: "Layanan" },
          { label: "Hotel", href: HOTEL_PATH },
          { label: "Ubah booking" },
        ]}
        title={`Ubah booking ${booking.petName ?? ""}`}
      >
        {status === "confirmed"
          ? "Semua bisa diubah sampai hewan check-in."
          : status === "in_progress"
            ? "Tanggal masuk dikunci setelah check-in. Yang lain masih bisa diubah."
            : "Booking sudah selesai. Hanya instruksi, kondisi, dan jam kegiatan yang bisa diubah."}
      </PageHeading>

      <FormActionBar
        title={booking.bookingNumber ?? undefined}
        submitLabel="Simpan perubahan booking"
        submitting={saving}
        disabled={Boolean(problem)}
        blockedReason={problem}
        cancelHref={hotelBookingPath(booking._id)}
      />

      <Card title="Tanggal & jam">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {status === "confirmed" ? (
            <TextField
              label="Tanggal masuk"
              name="checkInDate"
              type="date"
              value={checkInDate}
              onChange={(event) => setCheckInDate(event.target.value)}
            />
          ) : (
            <TextField
              label="Tanggal masuk"
              name="checkInDate"
              value={longDate(checkInDate)}
              readOnly
              disabled
            />
          )}
          <TextField
            label="Jam datang"
            name="arrivalTime"
            type="time"
            value={arrivalTime}
            onChange={(event) => setArrivalTime(event.target.value)}
            disabled={done}
          />
          <TextField
            label="Tanggal keluar"
            name="checkOutDate"
            type="date"
            min={addDays(checkInDate, 1)}
            value={checkOutDate}
            onChange={(event) => setCheckOutDate(event.target.value)}
            disabled={done}
          />
          <TextField
            label="Jam jemput"
            name="pickupTime"
            type="time"
            value={pickupTime}
            onChange={(event) => setPickupTime(event.target.value)}
            disabled={done}
          />
        </div>
      </Card>

      {done ? (
        <Card title="Instruksi & kondisi">
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Makanan"
              value={draft.care.food}
              onChange={(food) =>
                food &&
                setDraft({
                  ...draft,
                  care: { ...draft.care, food: food as "owner" | "hotel" },
                })
              }
              options={[
                { value: "owner", label: "Dari pemilik" },
                { value: "hotel", label: "Dari hotel" },
              ]}
            />
            <TextField
              label="Porsi & jadwal makan"
              name="portion"
              value={draft.care.portion ?? ""}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  care: { ...draft.care, portion: event.target.value },
                })
              }
            />
            <TextField
              label="Kondisi saat datang"
              name="conditionIn"
              value={conditionIn}
              onChange={(event) => setConditionIn(event.target.value)}
            />
            <TextField
              label="Kondisi saat pulang"
              name="conditionOut"
              value={conditionOut}
              onChange={(event) => setConditionOut(event.target.value)}
            />
          </div>
          {Object.keys(draft.stepTimes).length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(draft.stepTimes).map(([name, time]) => (
                <label
                  key={name}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium"
                >
                  {name}
                  <Input
                    type="time"
                    aria-label={`Jam ${name}`}
                    value={time}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        stepTimes: {
                          ...draft.stepTimes,
                          [name]: event.target.value,
                        },
                      })
                    }
                    className="h-9 w-28"
                  />
                </label>
              ))}
            </div>
          )}
          <p className="mt-4 text-sm text-muted">
            Harga dan add-on dikunci setelah check-out. Koreksi tagihan lewat
            retur di Penjualan.
          </p>
        </Card>
      ) : (
        <>
          <Card title="Layanan, kamar & harga">
            <StayPetFields
              pet={pet}
              draft={draft}
              onChange={setDraft}
              dates={dates}
              branchId={booking.branchId}
              services={services}
              addonServices={addons}
              roomTypes={roomTypes.items}
              mayPrice={mayPrice}
              excludeIds={[booking._id]}
            />
            {status === "in_progress" && (
              <div className="mt-4">
                <TextField
                  label="Kondisi saat datang"
                  name="conditionIn"
                  value={conditionIn}
                  onChange={(event) => setConditionIn(event.target.value)}
                />
              </div>
            )}
          </Card>
          <Card title="Tagihan setelah diubah">
            <div className="flex flex-col gap-2 text-sm">
              {bill.lines.map((line) => (
                <div key={line.label} className="flex justify-between gap-3">
                  <span>
                    {line.label}
                    {line.billed && (
                      <span className="ml-1 text-xs text-muted">
                        · sudah ditagih
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatMoney(line.net)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-3 border-t-2 border-foreground pt-2 text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(bill.total)}</span>
              </div>
              {Number(booking.stay.billedAmount ?? 0) > 0 && (
                <p className="text-xs text-muted">
                  Sudah ditagih {formatMoney(booking.stay.billedAmount)}.
                  Selisihnya ditagih atau dikembalikan di kasir / Penjualan.
                </p>
              )}
            </div>
          </Card>
        </>
      )}
    </form>
  );
}
