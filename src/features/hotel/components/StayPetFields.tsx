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
import { formatMoney, toDecimalString, toMinor } from "@/utils/decimal";
import { priceForPet } from "@/utils/serviceVariant";

import { addDays, addonCount, shortDate } from "../stay";
import {
  addonFromService,
  digits,
  previewBill,
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
  const bill = previewBill(draft, dates, { serviceName: service?.name ?? "", catalogPrice: catalog });
  const subtotal = toDecimalString(bill.lines.reduce((sum, line) => sum + (toMinor(line.net) ?? 0n), 0n));
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

      {/* ONE TABLE for the stay and its add-ons (24 November 2026, on request). */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-bold">Harga, diskon &amp; add-on</p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <div className="min-w-[860px]">
            <div className={cn(BILL_COLS, "border-b border-border bg-background px-4 py-2.5 text-sm font-semibold text-muted")}>
              <span>Item</span>
              <span>Jadwal</span>
              <span>Jumlah</span>
              <span>Harga</span>
              <span>Diskon</span>
              <span>
                <span className="sr-only">Hapus</span>
              </span>
            </div>

            <div className={cn(BILL_COLS, "border-b border-border px-4 py-3 last:border-b-0")}>
              <span>
                <span className="block text-sm font-bold">{service?.name ?? "Menginap"}</span>
                <span className="block text-xs text-muted">
                  per malam
                  {catalog && draft.nightPrice && Number(draft.nightPrice) !== Number(catalog)
                    ? ` · harga daftar ${formatMoney(catalog)}`
                    : ""}
                </span>
              </span>
              <span className="text-sm tabular-nums">
                {dateOk ? `${shortDate(dates.checkInDate)} – ${shortDate(dates.checkOutDate)}` : "—"}
              </span>
              <span className="text-sm tabular-nums">{bill.nights} malam</span>
              <MoneyCell
                label="Harga per malam"
                value={draft.nightPrice}
                placeholder={catalog ? Number(catalog).toLocaleString("id-ID") : "Isi harga"}
                disabled={!mayPrice}
                onChange={(nightPrice) => change({ nightPrice })}
              />
              <DiscountCell
                label="Diskon menginap"
                value={draft.discount}
                disabled={!mayPrice}
                onChange={(discount) => change({ discount })}
              />
              <span />
            </div>

            {draft.addons.map((addon, index) => {
              const set = (patch: Partial<typeof addon>) =>
                change({ addons: draft.addons.map((row, at) => (at === index ? { ...row, ...patch } : row)) });
              const count = addonCount(
                { unit: addon.unit, qty: Number(addon.qty) || 1, date: addon.date },
                { ...dates, leftDate: null },
              );
              return (
                <div
                  key={addon.key}
                  className={cn(BILL_COLS, "border-b border-border px-4 py-3 last:border-b-0", addon.billed && "bg-surface-hover")}
                >
                  <span>
                    <span className="block text-sm font-bold">{addon.name}</span>
                    <span className="block text-xs text-muted">
                      {addon.unit === "night" ? "per malam" : "per kali"}
                      {addon.billed && " · sudah ditagih"}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Select value={addon.date} disabled={addon.billed} onValueChange={(date) => date && set({ date })}>
                      <SelectTrigger aria-label={`Tanggal ${addon.name}`} className="h-9 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(addon.unit === "night" ? days.slice(0, -1) : days).map((date) => (
                          <SelectItem key={date} value={date}>
                            {shortDate(date)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(addon.unit === "time" || addon.commissionable) && (
                      <Input
                        type="time"
                        aria-label={`Jam ${addon.name}`}
                        value={addon.time}
                        disabled={addon.billed}
                        onChange={(event) => set({ time: event.target.value })}
                        className="h-9 w-28 tabular-nums"
                      />
                    )}
                  </span>
                  {addon.unit === "time" ? (
                    <span className="flex items-center gap-1.5">
                      <Input
                        inputMode="numeric"
                        aria-label={`Jumlah ${addon.name}`}
                        value={addon.qty}
                        disabled={addon.billed}
                        onChange={(event) => set({ qty: digits(event.target.value) })}
                        className="h-9 w-14 text-right tabular-nums"
                      />
                      <span className="text-sm text-muted">kali</span>
                    </span>
                  ) : (
                    <span className="text-sm tabular-nums">{count} malam</span>
                  )}
                  <MoneyCell
                    label={`Harga ${addon.name}`}
                    value={addon.unitPrice}
                    disabled={addon.billed || !mayPrice}
                    onChange={(unitPrice) => set({ unitPrice })}
                  />
                  <DiscountCell
                    label={`Diskon ${addon.name}`}
                    value={addon.discount}
                    disabled={addon.billed || !mayPrice}
                    onChange={(discount) => set({ discount })}
                  />
                  {addon.billed ? (
                    <span />
                  ) : (
                    <button
                      type="button"
                      aria-label={`Hapus ${addon.name}`}
                      className="flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-tint-danger hover:text-danger focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      onClick={() => change({ addons: draft.addons.filter((_, at) => at !== index) })}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {offeredAddons.length > 0 ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={addonPick} onValueChange={setAddonPick}>
                <SelectTrigger aria-label="Pilih add-on" className="h-11 min-w-72">
                  <SelectValue placeholder="Pilih add-on" />
                </SelectTrigger>
                <SelectContent>
                  {offeredAddons.map((addon) => (
                    <SelectItem key={addon._id} value={addon._id}>
                      {`${addon.name} · ${formatMoney(addon.price)}${addon.billingUnit === "per_night" ? " / malam" : ""}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                disabled={!addonPick}
                onClick={() => {
                  const picked = offeredAddons.find((addon) => addon._id === addonPick);
                  if (picked) change({ addons: [...draft.addons, addonFromService(picked, dates.checkInDate)] });
                  setAddonPick("");
                }}
              >
                <Plus className="size-4" />
                Tambah add-on
              </Button>
            </div>
            <p className="text-xs text-muted">Add-on yang dikerjakan staf otomatis masuk checklist harian di tanggal dan jamnya.</p>
          </>
        ) : (
          service && <p className="text-xs text-muted">Layanan ini belum punya add-on. Atur di Layanan &amp; Harga.</p>
        )}

        <div className="ml-auto flex w-full max-w-md flex-col gap-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Subtotal</span>
            <span className="font-semibold tabular-nums">{formatMoney(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Diskon keseluruhan</span>
            <DiscountCell
              label="Diskon keseluruhan"
              value={draft.bookingDiscount}
              disabled={!mayPrice}
              onChange={(bookingDiscount) => change({ bookingDiscount })}
            />
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <span className="text-base font-bold">Total</span>
            <span className="text-2xl font-extrabold tabular-nums">{formatMoney(bill.total)}</span>
          </div>
        </div>
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

const BILL_COLS = "grid grid-cols-[1.4fr_1.3fr_110px_150px_190px_36px] items-center gap-3";

/** A rupiah box inside the bill table, thousands-grouped as it is typed. */
function MoneyCell({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (digits: string) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">Rp</span>
      <Input
        aria-label={label}
        inputMode="numeric"
        value={value ? Number(value).toLocaleString("id-ID") : ""}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(digits(event.target.value))}
        className="h-9 pl-9 text-right tabular-nums"
      />
    </div>
  );
}

/** Rp / % and the amount, in one row — the bill table's discount cell. */
function DiscountCell({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: DiscountDraft;
  disabled?: boolean;
  onChange: (next: DiscountDraft) => void;
}) {
  return (
    <div className="flex gap-1.5">
      <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label={`${label}: satuan`}>
        {(["amount", "percent"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={disabled}
            aria-pressed={value.mode === mode}
            onClick={() =>
              onChange({ ...value, mode, value: mode === "percent" && Number(value.value) > 100 ? "100" : value.value })
            }
            className={cn(
              "h-9 min-w-9 px-2 text-sm font-semibold focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
              value.mode === mode ? "bg-primary text-primary-foreground" : "bg-surface text-muted",
            )}
          >
            {mode === "amount" ? "Rp" : "%"}
          </button>
        ))}
      </div>
      <Input
        aria-label={label}
        inputMode={value.mode === "percent" ? "decimal" : "numeric"}
        value={value.mode === "amount" && value.value ? Number(digits(value.value)).toLocaleString("id-ID") : value.value}
        placeholder="0"
        disabled={disabled}
        onChange={(event) =>
          onChange({
            ...value,
            value:
              value.mode === "amount"
                ? digits(event.target.value)
                : event.target.value.replace(/[^\d.,]/g, "").replace(",", "."),
          })
        }
        className="h-9 w-24 text-right tabular-nums"
      />
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
