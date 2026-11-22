"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import {
  Alert,
  Card,
  FormActionBar,
  SelectField,
  Spinner,
  TextField,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CustomerSearchDialog } from "@/features/customers";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { usePermissions } from "@/features/permissions";
import { PageHeading } from "@/features/purchasing";
import { useHotelRoomTypes } from "@/hooks/useHotelRoomTypes";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { hotelStayService } from "@/services/hotel.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import type { Customer, Pet, Service } from "@/types/api";
import { formatMoney, toDecimalString, toMinor } from "@/utils/decimal";
import { priceForPet } from "@/utils/serviceVariant";

import { HOTEL_BOOKINGS_PATH, HOTEL_PATH, hotelBookingPath } from "../paths";
import { addDays, daysBetween, localToday } from "../stay";
import {
  blankPet,
  petInput,
  petProblem,
  previewBill,
  typesPrice,
  type PetDraft,
} from "../stayDraft";
import { StayPetFields } from "./StayPetFields";

/**
 * Layanan › Hotel › Booking hotel baru (21 November 2026, PLAN-Hotel-V1.md
 * §4.5). One owner, the dates, then each animal that stays: one booking per
 * animal, saved together in one group. The room board can open it on a room
 * and a day (`?roomTypeId&unitId&date`).
 */
export function HotelStayCreateScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = usePermissions();
  const mayPrice = can("bookings", "setPrice");
  const scope = useBranchScope();
  const roomTypes = useHotelRoomTypes();

  const preRoom = params.get("roomTypeId");
  const preUnit = params.get("unitId");
  const preDate = params.get("date");
  const start = preDate && preDate >= localToday() ? preDate : localToday();

  const [branchId, setBranchId] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [picking, setPicking] = useState(false);
  const [pets, setPets] = useState<Pet[]>([]);
  const [petsLoading, setPetsLoading] = useState(false);
  const [checkInDate, setCheckInDate] = useState(start);
  const [arrivalTime, setArrivalTime] = useState("14:00");
  const [checkOutDate, setCheckOutDate] = useState(addDays(start, 1));
  const [pickupTime, setPickupTime] = useState("12:00");
  const [picked, setPicked] = useState<Record<string, PetDraft>>({});
  const [services, setServices] = useState<Service[]>([]);
  const [addons, setAddons] = useState<Service[]>([]);
  const [saving, setSaving] = useState(false);

  /* The branch: the room the board opened on, or the only one. */
  useEffect(() => {
    if (branchId) return;
    const fromRoom = roomTypes.items.find(
      (roomType) => roomType._id === preRoom,
    )?.branchId;
    const only = scope.branches.length === 1 ? scope.branches[0]._id : "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- defaulting once the lists arrive
    if (fromRoom || only) setBranchId(fromRoom || only);
  }, [branchId, roomTypes.items, preRoom, scope.branches]);

  useEffect(() => {
    let active = true;
    Promise.all([
      serviceService.list({
        serviceKind: "hotel",
        serviceType: "main",
        limit: 100,
      }),
      serviceService.list({ serviceType: "addon", limit: 100 }),
    ])
      .then(([mains, extras]) => {
        if (!active) return;
        setServices(
          mains.items.filter((service) => service.serviceKind === "hotel"),
        );
        setAddons(extras.items);
      })
      .catch(() => {
        if (active)
          swalToast("Daftar layanan hotel tidak bisa dimuat.", "error", 6000);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!customer) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading follows the customer chosen
    setPetsLoading(true);
    petService
      .list({ customerId: customer._id, isActive: true, limit: 100 })
      .then((result) => active && setPets(result.items))
      .catch(() => active && setPets([]))
      .finally(() => active && setPetsLoading(false));
    return () => {
      active = false;
    };
  }, [customer]);

  const nights = Math.max(0, daysBetween(checkInDate, checkOutDate));
  const dates = useMemo(
    () => ({ checkInDate, checkOutDate }),
    [checkInDate, checkOutDate],
  );
  const chosen = pets.filter((pet) => picked[pet._id]);

  const setPet = useCallback(
    (petId: string, next: PetDraft | null) => {
      setPicked((current) => {
        const copy = { ...current };
        if (next) copy[petId] = next;
        else delete copy[petId];
        return copy;
      });
    },
    [setPicked],
  );

  const toggle = (pet: Pet, on: boolean) => {
    if (!on) return setPet(pet._id, null);
    const draft = blankPet();
    if (preRoom) {
      draft.roomTypeId = preRoom;
      if (preUnit) draft.unitId = preUnit;
    }
    setPet(pet._id, draft);
  };

  const preview = chosen.map((pet) => {
    const draft = picked[pet._id];
    const service = services.find((one) => one._id === draft.serviceId);
    const catalog = service
      ? priceForPet(service, pet, { choices: draft.choices }).price
      : null;
    return {
      pet,
      draft,
      catalog,
      bill: previewBill(draft, dates, {
        serviceName: service?.name ?? "",
        catalogPrice: catalog,
      }),
      numbered:
        roomTypes.items.find((roomType) => roomType._id === draft.roomTypeId)
          ?.mode === "numbered",
    };
  });
  const total = toDecimalString(
    preview.reduce((sum, one) => sum + (toMinor(one.bill.total) ?? 0n), 0n),
  );

  const problem = !branchId
    ? "cabang belum dipilih"
    : !customer
      ? "pemilik belum dipilih"
      : nights < 1
        ? "tanggal keluar harus setelah tanggal masuk"
        : chosen.length === 0
          ? "belum ada hewan yang dipilih"
          : (preview
              .map((one) =>
                petProblem(one.draft, {
                  numbered: one.numbered,
                  petName: one.pet.name,
                }),
              )
              .find(Boolean) ??
            (preview.some((one) => !one.draft.nightPrice && !one.catalog)
              ? "ada hewan yang belum punya harga per malam"
              : null) ??
            (!mayPrice &&
            preview.some((one) => typesPrice(one.draft, one.catalog))
              ? "mengubah harga atau diskon perlu izin"
              : null));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (problem || saving || !customer) return;
    setSaving(true);
    try {
      const result = await hotelStayService.create({
        branchId,
        customerId: customer._id,
        checkInDate,
        arrivalTime,
        checkOutDate,
        pickupTime,
        pets: preview.map((one) => petInput(one.pet._id, one.draft)),
      });
      swalToast(
        result.bookings.length > 1
          ? `${result.bookings.length} booking hotel dibuat.`
          : `Booking ${result.bookings[0]?.bookingNumber ?? ""} dibuat.`,
      );
      router.push(
        result.bookings.length === 1
          ? hotelBookingPath(result.bookings[0]._id)
          : HOTEL_BOOKINGS_PATH,
      );
    } catch (error) {
      swalToast(
        error instanceof ApiError
          ? (error.reason ?? error.fullMessage)
          : "Booking belum tersimpan. Coba lagi.",
        "error",
        6000,
      );
    } finally {
      setSaving(false);
    }
  }

  const takenUnits = (petId: string) =>
    chosen
      .filter((pet) => pet._id !== petId)
      .map((pet) => picked[pet._id].unitId)
      .filter(Boolean);

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <PageHeading
        crumbs={[
          { label: "Layanan" },
          { label: "Hotel", href: HOTEL_PATH },
          { label: "Booking hotel baru" },
        ]}
        title="Booking hotel baru"
      >
        Satu hewan satu nomor booking. Kalau satu pemilik menitipkan beberapa
        hewan, semuanya dibuat sekaligus di sini.
      </PageHeading>

      <FormActionBar
        submitLabel="Simpan booking"
        submitting={saving}
        disabled={Boolean(problem)}
        blockedReason={problem}
        cancelHref={HOTEL_BOOKINGS_PATH}
      />

      <Card title="Pemilik & tanggal">
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Pemilik hewan</span>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="justify-start"
                onClick={() => setPicking(true)}
              >
                <Search className="size-4" />
                {customer
                  ? `${customer.name}${customer.phone ? ` · ${customer.phone}` : ""}`
                  : "Pilih pelanggan…"}
              </Button>
            </div>
            {scope.branches.length > 1 && (
              <SelectField
                label="Cabang"
                value={branchId}
                onChange={(next) => {
                  if (!next) return;
                  setBranchId(next);
                  setPicked({});
                }}
                options={scope.branches.map((branch) => ({
                  value: branch._id,
                  label: branch.name,
                }))}
                placeholder="Pilih cabang"
                required
              />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <TextField
              label="Tanggal masuk"
              name="checkInDate"
              type="date"
              value={checkInDate}
              onChange={(event) => {
                setCheckInDate(event.target.value);
                if (event.target.value >= checkOutDate)
                  setCheckOutDate(addDays(event.target.value, 1));
              }}
              required
            />
            <TextField
              label="Jam datang"
              name="arrivalTime"
              type="time"
              value={arrivalTime}
              onChange={(event) => setArrivalTime(event.target.value)}
            />
            <TextField
              label="Tanggal keluar"
              name="checkOutDate"
              type="date"
              value={checkOutDate}
              min={addDays(checkInDate, 1)}
              onChange={(event) => setCheckOutDate(event.target.value)}
              required
            />
            <TextField
              label="Jam jemput"
              name="pickupTime"
              type="time"
              value={pickupTime}
              onChange={(event) => setPickupTime(event.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Lama menginap</span>
              <span
                className={cn(
                  "flex h-11 items-center rounded-md px-3 text-sm font-semibold",
                  nights > 0 ? "bg-tint-neutral" : "bg-tint-danger text-danger",
                )}
              >
                {nights > 0
                  ? `${nights} malam`
                  : "Tanggal keluar harus setelah masuk"}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Hewan yang menginap"
        description="Centang hewan yang dititipkan. Harga per malam diambil dari Layanan & Harga sesuai profil hewannya."
      >
        {!customer ? (
          <p className="text-sm text-muted">
            Pilih pemilik dulu, daftar hewannya akan muncul di sini.
          </p>
        ) : petsLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner size={16} /> Memuat hewan…
          </p>
        ) : pets.length === 0 ? (
          <p className="text-sm text-muted">
            {customer.name} belum punya hewan aktif. Tambahkan di Pelanggan ›
            Hewan.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {pets.map((pet) => {
              const draft = picked[pet._id];
              return (
                <div
                  key={pet._id}
                  className={cn(
                    "rounded-xl border",
                    draft ? "border-primary" : "border-border",
                  )}
                >
                  <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
                    <Checkbox
                      checked={Boolean(draft)}
                      onCheckedChange={(next) => toggle(pet, next === true)}
                      aria-label={`Inapkan ${pet.name}`}
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        {pet.name}
                      </span>
                      <span className="block text-xs text-muted">
                        {[pet.speciesLabel, pet.sizeLabel]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </span>
                  </label>
                  {draft && (
                    <div className="border-t border-border p-4">
                      {!branchId ? (
                        <Alert variant="info">Pilih cabang dulu.</Alert>
                      ) : nights < 1 ? (
                        <Alert variant="info">
                          Perbaiki tanggal menginap dulu.
                        </Alert>
                      ) : (
                        <StayPetFields
                          pet={pet}
                          draft={draft}
                          onChange={(next) => setPet(pet._id, next)}
                          dates={dates}
                          branchId={branchId}
                          services={services}
                          addonServices={addons}
                          roomTypes={roomTypes.items}
                          mayPrice={mayPrice}
                          peerUnits={takenUnits(pet._id)}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {preview.length > 0 && nights > 0 && (
        <Card title="Ringkasan">
          <div className="flex flex-col gap-2 text-sm">
            {preview.map((one) => (
              <div key={one.pet._id} className="flex justify-between gap-3">
                <span>
                  <b>{one.pet.name}</b> · {one.bill.nights} malam
                  {one.draft.addons.length
                    ? ` · ${one.draft.addons.length} add-on`
                    : ""}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatMoney(one.bill.total)}
                </span>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t-2 border-foreground pt-2 text-base font-bold">
              <span>Total semua hewan</span>
              <span className="tabular-nums">{formatMoney(total)}</span>
            </div>
            <p className="text-xs text-muted">
              Pembayaran dilakukan di kasir — saat check-in, sebagian (DP), atau
              saat check-out.
            </p>
          </div>
        </Card>
      )}

      <CustomerSearchDialog
        open={picking}
        onOpenChange={setPicking}
        onSelect={(next) => {
          setCustomer(next);
          setPicked({});
          setPicking(false);
        }}
      />
    </form>
  );
}
