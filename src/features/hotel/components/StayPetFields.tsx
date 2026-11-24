"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";

import { Alert, SelectField, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useVariantQuote, VariantChoicePicker } from "@/features/services";
import { cn } from "@/lib/utils";
import { hotelStayService } from "@/services/hotel.service";
import type {
  HotelAvailability,
  HotelRoomType,
  Pet,
  Service,
} from "@/types/api";
import { formatMoney } from "@/utils/decimal";
import { priceForPet } from "@/utils/serviceVariant";

import { addDays, shortDate } from "../stay";
import {
  addonFromService,
  digits,
  type DiscountDraft,
  type PetDraft,
  withRoomChoice,
} from "../stayDraft";
import { UnitSelect } from "./HotelStayDialogs";

/** The hotel services this animal can be booked into at this branch. */
export function servicesFor(
  services: Service[],
  roomTypes: HotelRoomType[],
  pet: Pet,
  branchId: string,
): Service[] {
  return services.filter(
    (service) =>
      service.isActive !== false &&
      (service.allBranches !== false || service.branchIds.includes(branchId)) &&
      // Its own jenis hewan (23 November 2026); none stored = every kind.
      ((service.petTypeIds ?? []).length === 0 ||
        (service.petTypeIds ?? []).includes(pet.species)) &&
      roomTypesFor(service, roomTypes, pet, branchId).length > 0,
  );
}

/** The room types a service may put this animal in at this branch. */
export function roomTypesFor(
  service: Service | undefined,
  roomTypes: HotelRoomType[],
  pet: Pet,
  branchId: string,
): HotelRoomType[] {
  if (!service) return [];
  return roomTypes.filter(
    (roomType) =>
      roomType.isActive &&
      roomType.branchId === branchId &&
      (service.roomTypeIds ?? []).includes(roomType._id) &&
      roomType.petTypeIds.includes(pet.species),
  );
}

/**
 * One animal's stay inside the booking form — service, room, price, discounts,
 * add-ons, care and clock times (21 November 2026). The same fields serve
 * Booking hotel baru and Ubah booking; `locked` narrows what an edit may touch.
 */
export function StayPetFields({
  pet,
  draft,
  onChange,
  dates,
  branchId,
  services,
  addonServices,
  roomTypes,
  mayPrice,
  excludeIds = [],
  peerUnits = [],
}: {
  pet: Pet;
  draft: PetDraft;
  onChange: (next: PetDraft) => void;
  dates: { checkInDate: string; checkOutDate: string };
  branchId: string;
  services: Service[];
  addonServices: Service[];
  roomTypes: HotelRoomType[];
  /** `bookings:setPrice` — without it prices and discounts are read-only. */
  mayPrice: boolean;
  /** The stay being edited, left out of the room check. */
  excludeIds?: string[];
  /** Units other animals in this same form already took. */
  peerUnits?: string[];
}) {
  const [open, setOpen] = useState(false);
  const quote = useVariantQuote({ branchPin: null, customerPin: null });
  const offered = servicesFor(services, roomTypes, pet, branchId);
  const service = services.find((one) => one._id === draft.serviceId);
  const types = roomTypesFor(service, roomTypes, pet, branchId);
  const roomType = types.find((one) => one._id === draft.roomTypeId);
  /* The "Tipe kamar" card is answered by the room picked above, never by hand (24 November 2026). */
  const allCards = service ? quote.cardsFor([service]) : [];
  const roomCard = allCards.find((card) => card.systemKey === "roomType") ?? null;
  const cards = allCards.filter((card) => card.systemKey !== "roomType");
  const choices = withRoomChoice(draft.choices, roomCard?._id ?? null, draft.roomTypeId);
  const catalog = service
    ? priceForPet(service, pet, { choices }).price
    : null;
  const change = (patch: Partial<PetDraft>) => onChange({ ...draft, ...patch });
  const dateOk = dates.checkOutDate > dates.checkInDate;

  /* The first service, room type and free unit, once there is something to pick. */
  useEffect(() => {
    if (!draft.serviceId && offered.length > 0) {
      const first = offered[0];
      const timeMap = Object.fromEntries(
        (first.sessions ?? []).map((name, index) => [
          name,
          first.sessionTimes?.[index] ?? "",
        ]),
      );
      onChange({ ...draft, serviceId: first._id, stepTimes: timeMap });
    } else if (service && !roomType && types.length > 0) {
      onChange({ ...draft, roomTypeId: types[0]._id, unitId: "" });
    }
  }, [draft, offered, service, roomType, types, onChange]);

  /* Free units over the dates, the stay itself left out. */
  const [availability, setAvailability] = useState<HotelAvailability | null>(
    null,
  );
  /* Menginap: nights already slept are not re-judged — the server checks from today. */
  const from = dates.checkInDate;
  useEffect(() => {
    if (!roomType || !dateOk) return;
    let active = true;
    hotelStayService
      .availability({
        roomTypeId: roomType._id,
        from,
        to: dates.checkOutDate,
        excludeIds,
      })
      .then((result) => active && setAvailability(result))
      .catch(() => active && setAvailability(null));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- excludeIds is a fresh array per render
  }, [roomType, from, dates.checkOutDate, dateOk]);

  const units = useMemo(
    () =>
      availability?.mode === "numbered"
        ? availability.units.map((unit) => ({
            ...unit,
            free: unit.free && !peerUnits.includes(unit._id),
          }))
        : [],
    [availability, peerUnits],
  );

  useEffect(() => {
    if (roomType?.mode !== "numbered" || units.length === 0) return;
    const current = units.find((unit) => unit._id === draft.unitId);
    if (!current || (!current.free && !excludeIds.length)) {
      const free = units.find((unit) => unit.free);
      if (free && free._id !== draft.unitId)
        onChange({ ...draft, unitId: free._id });
    }
  }, [roomType, units, draft, onChange, excludeIds.length]);

  const offeredAddons = (service?.addonServiceIds ?? [])
    .map((id) => addonServices.find((addon) => addon._id === id))
    .filter((addon): addon is Service =>
      Boolean(addon && addon.isActive !== false),
    );
  const [addonPick, setAddonPick] = useState("");
  const days: string[] = [];
  if (dateOk)
    for (
      let date = dates.checkInDate;
      date <= dates.checkOutDate;
      date = addDays(date, 1)
    )
      days.push(date);

  if (offered.length === 0) {
    return (
      <Alert variant="info">
        Belum ada layanan hotel aktif untuk{" "}
        {pet.speciesLabel?.toLowerCase() ?? "hewan ini"} di cabang ini. Cek
        jenis hewan dan tipe kamar layanannya di Layanan &amp; Harga, dan
        Pengaturan › Tipe kamar.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <SelectField
          label="Layanan"
          value={draft.serviceId}
          onChange={(serviceId) => {
            if (!serviceId) return;
            const next = services.find((one) => one._id === serviceId);
            onChange({
              ...draft,
              serviceId,
              roomTypeId: "",
              unitId: "",
              choices: [],
              nightPrice: "",
              addons: draft.addons.filter((addon) => addon.billed),
              stepTimes: Object.fromEntries(
                (next?.sessions ?? []).map((name, index) => [
                  name,
                  next?.sessionTimes?.[index] ?? "",
                ]),
              ),
            });
          }}
          options={offered.map((one) => ({ value: one._id, label: one.name }))}
          required
        />
        <SelectField
          label="Tipe kamar"
          value={draft.roomTypeId}
          onChange={(roomTypeId) =>
            roomTypeId && change({ roomTypeId, unitId: "" })
          }
          options={types.map((one) => ({ value: one._id, label: one.name }))}
          placeholder="Pilih tipe kamar"
          required
        />
        {roomType?.mode === "numbered" ? (
          <UnitSelect
            units={units}
            value={draft.unitId}
            onChange={(unitId) => change({ unitId })}
            current={excludeIds.length ? draft.unitId : null}
          />
        ) : roomType && availability?.mode === "zone" ? (
          <div className="flex flex-col gap-1.5">
            <Label>Tempat di zona</Label>
            <p
              className={cn(
                "flex h-11 items-center rounded-md px-3 text-sm font-semibold",
                availability.free > 0
                  ? "bg-tint-neutral"
                  : "bg-tint-danger text-danger",
              )}
            >
              {availability.closed
                ? "Zona sedang perbaikan"
                : availability.free > 0
                  ? `Sisa ${availability.free} dari ${availability.capacity} tempat`
                  : "Zona penuh di tanggal ini"}
            </p>
          </div>
        ) : null}
      </div>

      {cards.length > 0 && (
        <VariantChoicePicker
          cards={cards}
          value={draft.choices}
          onChange={(choices) => change({ choices, nightPrice: "" })}
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <TextField
          label="Harga per malam"
          name="nightPrice"
          inputMode="numeric"
          value={
            draft.nightPrice
              ? Number(draft.nightPrice).toLocaleString("id-ID")
              : ""
          }
          placeholder={
            catalog ? Number(catalog).toLocaleString("id-ID") : "Isi harga"
          }
          onChange={(event) =>
            change({ nightPrice: digits(event.target.value) })
          }
          disabled={!mayPrice}
          hint={
            catalog
              ? draft.nightPrice && Number(draft.nightPrice) !== Number(catalog)
                ? `Harga daftar ${formatMoney(catalog)} — diubah`
                : `Harga daftar ${formatMoney(catalog)}`
              : "Varian ini belum punya harga di Layanan & Harga — isi manual."
          }
        />
        <DiscountField
          label="Diskon menginap"
          value={draft.discount}
          onChange={(discount) => change({ discount })}
          disabled={!mayPrice}
        />
        <DiscountField
          label="Diskon keseluruhan"
          value={draft.bookingDiscount}
          onChange={(bookingDiscount) => change({ bookingDiscount })}
          disabled={!mayPrice}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Add-on</Label>
        {draft.addons.length === 0 && (
          <p className="text-sm text-muted">Belum ada add-on.</p>
        )}
        {draft.addons.map((addon, index) => (
          <div
            key={addon.key}
            className={cn(
              "flex flex-wrap items-end gap-2 rounded-xl border border-border p-3",
              addon.billed && "bg-surface-hover",
            )}
          >
            <div className="min-w-40 flex-1">
              <p className="text-sm font-semibold">{addon.name}</p>
              <p className="text-xs text-muted">
                {addon.unit === "night"
                  ? "per malam, sampai check-out"
                  : "per kali"}
                {addon.billed && " · sudah ditagih, dikunci"}
              </p>
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {addon.unit === "night" ? "Mulai" : "Tanggal"}
              <Select
                value={addon.date}
                disabled={addon.billed}
                onValueChange={(date) =>
                  date &&
                  change({
                    addons: draft.addons.map((row, at) =>
                      at === index ? { ...row, date } : row,
                    ),
                  })
                }
              >
                <SelectTrigger
                  aria-label={`Tanggal ${addon.name}`}
                  className="h-9 w-28"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(addon.unit === "night" ? days.slice(0, -1) : days).map(
                    (date) => (
                      <SelectItem key={date} value={date}>
                        {shortDate(date)}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </label>
            {(addon.unit === "time" || addon.commissionable) && (
              <label className="flex flex-col gap-1 text-xs font-medium">
                Jam
                <Input
                  type="time"
                  aria-label={`Jam ${addon.name}`}
                  value={addon.time}
                  disabled={addon.billed}
                  onChange={(event) =>
                    change({
                      addons: draft.addons.map((row, at) =>
                        at === index
                          ? { ...row, time: event.target.value }
                          : row,
                      ),
                    })
                  }
                  className="h-9 w-28 tabular-nums"
                />
              </label>
            )}
            {addon.unit === "time" && (
              <label className="flex flex-col gap-1 text-xs font-medium">
                Jumlah
                <Input
                  inputMode="numeric"
                  aria-label={`Jumlah ${addon.name}`}
                  value={addon.qty}
                  disabled={addon.billed}
                  onChange={(event) =>
                    change({
                      addons: draft.addons.map((row, at) =>
                        at === index
                          ? { ...row, qty: digits(event.target.value) }
                          : row,
                      ),
                    })
                  }
                  className="h-9 w-16 text-right tabular-nums"
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-medium">
              Harga
              <Input
                inputMode="numeric"
                aria-label={`Harga ${addon.name}`}
                value={
                  addon.unitPrice
                    ? Number(addon.unitPrice).toLocaleString("id-ID")
                    : ""
                }
                disabled={addon.billed || !mayPrice}
                onChange={(event) =>
                  change({
                    addons: draft.addons.map((row, at) =>
                      at === index
                        ? { ...row, unitPrice: digits(event.target.value) }
                        : row,
                    ),
                  })
                }
                className="h-9 w-28 text-right tabular-nums"
              />
            </label>
            {!addon.billed && (
              <Button
                type="button"
                variant="ghost"
                className="size-9 p-0 hover:bg-tint-danger hover:text-danger"
                aria-label={`Hapus ${addon.name}`}
                onClick={() =>
                  change({
                    addons: draft.addons.filter((_, at) => at !== index),
                  })
                }
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        ))}
        {offeredAddons.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2">
            <SelectField
              label="Tambah add-on"
              value={addonPick}
              onChange={setAddonPick}
              options={offeredAddons.map((addon) => ({
                value: addon._id,
                label: `${addon.name} · ${formatMoney(addon.price)} / ${addon.billingUnit === "per_night" ? "malam" : "kali"}`,
              }))}
              placeholder="Pilih add-on"
              className="min-w-64"
            />
            <Button
              type="button"
              variant="secondary"
              size="lg"
              disabled={!addonPick}
              onClick={() => {
                const picked = offeredAddons.find(
                  (addon) => addon._id === addonPick,
                );
                if (picked)
                  change({
                    addons: [
                      ...draft.addons,
                      addonFromService(picked, dates.checkInDate),
                    ],
                  });
                setAddonPick("");
              }}
            >
              <Plus className="size-4" />
              Tambah
            </Button>
          </div>
        ) : (
          service && (
            <p className="text-xs text-muted">
              Layanan ini belum punya add-on. Atur di Layanan &amp; Harga.
            </p>
          )
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 self-start rounded text-sm font-semibold text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {open ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
        Instruksi perawatan &amp; jam kegiatan
        <span className="font-normal text-muted">
          (opsional, bisa diisi saat check-in)
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-4 rounded-xl bg-surface-hover p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Makanan"
              value={draft.care.food}
              onChange={(food) =>
                food &&
                change({
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
              placeholder="Misal: 2× sehari, 40 g"
              onChange={(event) =>
                change({ care: { ...draft.care, portion: event.target.value } })
              }
            />
            <TextField
              label="Obat"
              name="medicine"
              value={draft.care.medicine ?? ""}
              placeholder="Kosongkan kalau tidak ada"
              onChange={(event) =>
                change({
                  care: { ...draft.care, medicine: event.target.value },
                })
              }
            />
            {draft.care.medicine && (
              <TextField
                label="Jam beri obat"
                name="medicineTime"
                type="time"
                value={draft.care.medicineTime ?? ""}
                onChange={(event) =>
                  change({
                    care: {
                      ...draft.care,
                      medicineTime: event.target.value || null,
                    },
                  })
                }
              />
            )}
            <TextField
              label="Catatan perilaku"
              name="behaviour"
              value={draft.care.behaviour ?? ""}
              onChange={(event) =>
                change({
                  care: { ...draft.care, behaviour: event.target.value },
                })
              }
            />
          </div>
          {Object.keys(draft.stepTimes).length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Jam kegiatan harian</p>
              <p className="text-xs text-muted">
                Default dari layanan. Ubah kalau pemilik minta jam lain —
                berlaku untuk semua malam. Kosongkan untuk tahapan tanpa jam.
              </p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(draft.stepTimes).map(([name, time]) => (
                  <label
                    key={name}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium"
                  >
                    {name}
                    <Input
                      type="time"
                      aria-label={`Jam ${name}`}
                      value={time}
                      onChange={(event) =>
                        change({
                          stepTimes: {
                            ...draft.stepTimes,
                            [name]: event.target.value,
                          },
                        })
                      }
                      className="h-9 w-28 tabular-nums"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
          <TextField
            label="Catatan internal"
            name="internalNotes"
            value={draft.internalNotes}
            onChange={(event) => change({ internalNotes: event.target.value })}
          />
        </div>
      )}
    </div>
  );
}

/** A discount box with its Rp / % switch beside it. */
export function DiscountField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: DiscountDraft;
  onChange: (next: DiscountDraft) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <div
          className="flex overflow-hidden rounded-md border border-border"
          role="group"
          aria-label={`${label}: satuan`}
        >
          {(["amount", "percent"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              aria-pressed={value.mode === mode}
              onClick={() =>
                onChange({
                  ...value,
                  mode,
                  value:
                    mode === "percent" && Number(value.value) > 100
                      ? "100"
                      : value.value,
                })
              }
              className={cn(
                "h-11 min-w-11 px-3 text-sm font-semibold focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
                value.mode === mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-muted",
              )}
            >
              {mode === "amount" ? "Rp" : "%"}
            </button>
          ))}
        </div>
        <Input
          aria-label={label}
          inputMode={value.mode === "percent" ? "decimal" : "numeric"}
          value={
            value.mode === "amount" && value.value
              ? Number(digits(value.value)).toLocaleString("id-ID")
              : value.value
          }
          onChange={(event) =>
            onChange({
              ...value,
              value:
                value.mode === "amount"
                  ? digits(event.target.value)
                  : event.target.value,
            })
          }
          placeholder="0"
          disabled={disabled}
          className="h-11 text-right tabular-nums"
        />
      </div>
    </div>
  );
}
