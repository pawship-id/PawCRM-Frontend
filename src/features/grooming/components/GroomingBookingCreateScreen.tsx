"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, X } from "lucide-react";

import {
  Alert,
  Card,
  CheckRow,
  CheckRowGroup,
  FIELD_HEIGHT,
  FilterSelect,
  FormActionBar,
  SelectField,
  Spinner,
  TextField,
  TextareaField,
  namedOptions,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerSearchDialog } from "@/features/customers";
import { useBranchScope } from "@/features/inventory/hooks/useBranchScope";
import { usePermissions } from "@/features/permissions";
import { PetFixLink, PetQuickAddDialog, PetSummaryCard } from "@/features/pets";
// `PageHeading` is still purchasing-local, awaiting promotion (ui-rules §15).
import { PageHeading } from "@/features/purchasing";
import { usePetOptions } from "@/hooks/usePetOptions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { formatMoney, toDecimalString } from "@/utils/decimal";
import {
  AXIS_LABEL,
  priceForPet,
  variantLabelForPet,
} from "@/utils/serviceVariant";
import { GROOMER_LEVEL_LABELS } from "@/types/api";
import type {
  BookingLocation,
  Customer,
  GroomerAvailability,
  Pet,
  Service,
  ServiceVariantAxis,
  VipTier,
} from "@/types/api";

import {
  BLANK_PRICE,
  blankPetDraft,
  digitsOnly,
  priceLine,
  splitBookingDiscount,
  toEntry,
  typedDiscount,
  type DiscountMode,
  type PetDraft,
  type PriceDraft,
  type PricedLine,
} from "../bookingCreateDraft";
import { useGroomingLine } from "../hooks/useGroomingLine";
import { GROOMING_PATH } from "../paths";

/** The API's page cap. */
const FETCH_LIMIT = 100;

/** Mirrors NOTES_MAX_LENGTH in booking.model.js. */
const NOTES_MAX_LENGTH = 500;

const VIP_WORDS: Record<VipTier, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
};

/** Today on the shop's clock, as `<input type="date">` holds it. */
function todayValue(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** The next half hour — most counter bookings are for later the same day. */
function nextHalfHourValue(): string {
  const at = new Date();
  at.setSeconds(0, 0);
  at.setMinutes(at.getMinutes() <= 30 ? 30 : 60);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** Wall-clock time in the browser's zone — the shop's. */
function toScheduledAt(date: string, time: string): string | null {
  const at = new Date(`${date}T${time}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

const money = (minor: bigint) => formatMoney(toDecimalString(minor));

/** "150.000" for an input — whole rupiah, grouped the Indonesian way. */
const grouped = (digits: string) =>
  digits === "" ? "" : Number(digits).toLocaleString("id-ID");

/** A quote's whole rupiah as digits — "150000.0000" → "150000". */
const quoteDigits = (quote: bigint | null) =>
  quote === null ? "" : toDecimalString(quote).split(".")[0];

/** "10%" or "Rp 15.000" — how a discount was typed. */
function discountWords(mode: DiscountMode, value: string): string {
  return mode === "percent" ? `${value}%` : formatMoney(value);
}

/** The one place a service may be done, or null when it goes either way. */
function onlyAt(service: Service | null): BookingLocation | null {
  const at = service?.serviceLocations ?? [];
  return at.length === 1 ? at[0] : null;
}

const badge = "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

/** How the summary names a variant: coat, then size, then species. */
const VARIANT_ORDER = ["furType", "sizeCategory", "petType"] as const satisfies readonly ServiceVariantAxis[];

/**
 * Layanan › Grooming › Booking baru — "Booking baru" from `buloo-booking-v2.html`,
 * without the mockup's other two tabs.
 *
 * ─── ONE ANIMAL, ONE BOOKING ───────────────────────────────────────────────
 *
 * The animals are picked as chips; each gets a card with its service, groomer,
 * prices and add-ons, and saving makes one numbered booking per animal in one
 * group (`POST /bookings`). `/dashboard/booking/new` stays for every other line.
 *
 * ─── PRICE AND DISCOUNT ARE A GRANT ────────────────────────────────────────
 *
 * "Harga dasar − Diskon = Efektif" per line and "Diskon seluruh booking" are
 * editable only for somebody holding `bookings:setPrice` — the server refuses
 * them otherwise, because the till and the invoice bill this price. Without it
 * the catalogue's price is shown, read-only. The figures are previewed with the
 * server's own rules (`bookingCreateDraft.ts`).
 *
 * ─── WHAT THE MOCKUP ASKS FOR THAT IS NOT BUILT ────────────────────────────
 *
 * Zona and biaya perjalanan are "Segera": no zone or trip fee exists on the
 * backend yet. The schedule is a date and a time, as the API stores it, not the
 * mockup's Pagi/Siang blocks. Saving ASKS for the appointment (`requested`), as
 * the booking form does — confirming it is the shop's separate act.
 */
export function GroomingBookingCreateScreen() {
  const router = useRouter();
  const { can } = usePermissions();
  const mayPrice = can("bookings", "setPrice");
  const { label: optionLabel } = usePetOptions();
  const line = useGroomingLine();

  const scope = useBranchScope();
  const [pickedBranch, setPickedBranch] = useState("");
  const branchId = pickedBranch || scope.soleBranch;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [petsNonce, setPetsNonce] = useState(0);
  const [loadingPets, setLoadingPets] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, PetDraft>>({});

  const [services, setServices] = useState<Service[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [groomers, setGroomers] = useState<GroomerAvailability[]>([]);

  const [date, setDate] = useState(todayValue);
  const [time, setTime] = useState(nextHalfHourValue);
  const [bookingDiscount, setBookingDiscount] = useState<{
    mode: DiscountMode;
    value: string;
  }>({ mode: "amount", value: "" });

  const [picking, setPicking] = useState(false);
  const [addingPet, setAddingPet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  /* The clash the server refused, kept so saving again overrides it. */
  const [clash, setClash] = useState<string | null>(null);

  /* What is still offered — a retired service is not something to promise. */
  useEffect(() => {
    let active = true;

    serviceService
      .list({ isActive: true, limit: FETCH_LIMIT })
      .then((result) => {
        if (active) setServices(result.items);
      })
      .catch(() => {
        if (active) setLoadError("Daftar layanan tidak bisa dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoadingServices(false);
      });

    return () => {
      active = false;
    };
  }, []);

  /* Who may be booked on the day. Best effort: assignment is optional. */
  useEffect(() => {
    if (date === "") return;

    let active = true;

    bookingService
      .availability(date)
      .then((rows) => {
        if (active) setGroomers(rows);
      })
      .catch(() => {
        if (active) setGroomers([]);
      });

    return () => {
      active = false;
    };
  }, [date]);

  /* The customer's animals, re-asked after a quick-add. */
  useEffect(() => {
    if (!customer) return;

    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingPets(true);

    petService
      .list({ customerId: customer._id, isActive: true, limit: FETCH_LIMIT })
      .then((result) => {
        if (active) setPets(result.items);
      })
      .catch(() => {
        if (!active) return;
        setPets([]);
        setLoadError("Daftar hewan tidak bisa dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoadingPets(false);
      });

    return () => {
      active = false;
    };
  }, [customer, petsNonce]);

  /**
   * The variant the price was read from — "Long Hair · Small · Anjing" —
   * always in that order: coat, size, species. Only the axes the service is
   * priced by; a flat-priced service has no variant and gets no line.
   */
  const variantWords = (service: Service | null, pet: Pet): string | undefined => {
    if (!service?.hasVariants) return undefined;

    const facts: Record<(typeof VARIANT_ORDER)[number], string | null> = {
      furType: optionLabel("furType", pet.furType),
      sizeCategory: optionLabel("size", pet.size),
      petType: optionLabel("species", pet.species),
    };

    const words = VARIANT_ORDER.filter((axis) => service.variantAxes.includes(axis))
      .map((axis) => facts[axis])
      .filter(Boolean)
      .join(" · ");

    return words || undefined;
  };

  const serviceOf = useCallback(
    (id: string) => services.find((service) => service._id === id) ?? null,
    [services],
  );

  /* The Grooming line's main services. Without a line, every main service. */
  const mainServices = useMemo(
    () =>
      services.filter(
        (service) =>
          service.serviceType === "main" &&
          (!line.line || service.businessLineId === line.line._id),
      ),
    [services, line.line],
  );

  function chooseCustomer(next: Customer) {
    setCustomer(next);
    setPets([]);
    setDrafts({});
    setBookingDiscount({ mode: "amount", value: "" });
    setClash(null);
  }

  function togglePet(petId: string) {
    setDrafts((prev) => {
      if (prev[petId]) {
        const next = { ...prev };
        delete next[petId];
        return next;
      }
      return { ...prev, [petId]: blankPetDraft(petId) };
    });
    setClash(null);
  }

  function patchDraft(petId: string, patch: Partial<PetDraft>) {
    setDrafts((prev) =>
      prev[petId] ? { ...prev, [petId]: { ...prev[petId], ...patch } } : prev,
    );
    setClash(null);
  }

  /* ─── WHAT THE FORM COMES TO ───────────────────────────────────────────── */

  const picked = pets
    .filter((pet) => drafts[pet._id])
    .map((pet) => ({ pet, draft: drafts[pet._id] }));

  const priced = picked.map(({ pet, draft }) => {
    const service = serviceOf(draft.serviceId);
    const quote = priceForPet(service, pet);
    const main = priceLine(quote.price, draft.main);
    const addons = draft.addonServiceIds.map((addonId) => {
      const addon = serviceOf(addonId);
      const addonQuote = priceForPet(addon, pet);
      return {
        addonId,
        addon,
        quote: addonQuote,
        line: priceLine(addonQuote.price, draft.addons[addonId] ?? BLANK_PRICE),
      };
    });

    const lines: PricedLine[] = [main, ...addons.map((row) => row.line)];

    return {
      pet,
      draft,
      service,
      quote,
      main,
      addons,
      gross: lines.reduce((sum, row) => sum + (row.price ?? 0n), 0n),
      own: lines.reduce((sum, row) => sum + row.discount, 0n),
      net: lines.reduce((sum, row) => sum + row.net, 0n),
      minutes:
        (quote.durationMin ?? 0) +
        addons.reduce((sum, row) => sum + (row.quote.durationMin ?? 0), 0),
    };
  });

  const split = splitBookingDiscount(
    priced.map((row) => row.net),
    bookingDiscount.mode,
    mayPrice ? bookingDiscount.value : "",
  );
  const subtotal = priced.reduce((sum, row) => sum + row.net, 0n);
  const total = subtotal - split.total;

  /* WHERE THE WORK HAPPENS — every booking of one save shares it. */
  const chosenServices = priced.map((row) => row.service).filter(Boolean) as Service[];
  const homeOnly = chosenServices.some((service) => onlyAt(service) === "in_home");
  const storeOnly = chosenServices.some((service) => onlyAt(service) === "in_store");
  const location: BookingLocation = homeOnly ? "in_home" : "in_store";

  const withoutService = priced.find((row) => !row.service);
  const sizeless = priced.find((row) => !row.pet.size);
  const unpriceable = priced.find(
    (row) =>
      row.quote.missingAxis !== null ||
      row.addons.some((addon) => addon.quote.missingAxis !== null),
  );
  const inactive = priced.find(
    (row) => row.quote.inactive || row.addons.some((addon) => addon.quote.inactive),
  );

  const blockedReason = !branchId
    ? "Cabang belum dipilih."
    : !customer
      ? "Pelanggan belum dipilih."
      : priced.length === 0
        ? "Hewan belum dipilih."
        : withoutService
          ? `Layanan ${withoutService.pet.name} belum dipilih.`
          : sizeless
            ? `Ukuran ${sizeless.pet.name} belum diisi.`
            : unpriceable
              ? `Data ${unpriceable.pet.name} belum lengkap, harganya belum bisa dihitung.`
              : inactive
                ? `Varian layanan untuk ${inactive.pet.name} sedang nonaktif.`
                : homeOnly && storeOnly
                  ? "Layanan di alamat dan layanan di toko tidak bisa disimpan bersama — simpan terpisah."
                  : date === "" || time === ""
                    ? "Tanggal dan jamnya belum lengkap."
                    : null;

  async function save() {
    if (saving || !customer || blockedReason) return;

    const scheduledAt = toScheduledAt(date, time);
    if (!scheduledAt) {
      setFormError("Tanggal dan jamnya belum lengkap.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const result = await bookingService.create({
        customerId: customer._id,
        branchId,
        scheduledAt,
        status: "requested",
        location,
        forceClash: clash !== null,
        bookingDiscount: mayPrice
          ? typedDiscount(bookingDiscount.mode, bookingDiscount.value)
          : null,
        bookings: picked.map(({ draft }) => toEntry(draft)),
      });

      const made = result.bookings;
      const numbers = made
        .map((booking) => booking.bookingNumber)
        .filter(Boolean)
        .join(", ");

      router.push(
        made.length === 1 ? `/dashboard/booking/${made[0]._id}` : GROOMING_PATH,
      );
      router.refresh();

      /* Last, and outside the save's try — see BookingForm for why. */
      try {
        swalToast(
          numbers
            ? `${made.length} booking dibuat: ${numbers}`
            : `${made.length} booking dibuat.`,
        );
      } catch {
        /* The page it landed on already shows it. */
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setClash(error.fullMessage);
      } else if (error instanceof ApiError) {
        setFormError(error.fullMessage);
      } else {
        setFormError("Terjadi kesalahan. Coba lagi.");
      }
      setSaving(false);
    }
  }

  const count = priced.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Bare text: `PageHeading` wraps its children in a <p> already. */}
      <PageHeading
        crumbs={[
          { label: "Layanan" },
          { label: "Grooming", href: GROOMING_PATH },
          { label: "Booking baru" },
        ]}
        title="Booking baru"
      >
        Satu hewan satu nomor booking. Semua yang disimpan bersama tercatat
        sebagai satu kunjungan.
      </PageHeading>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="flex flex-col gap-4"
      >
        {/* No title — the page heading already names the document (§16). */}
        <FormActionBar
          submitLabel={count > 1 ? `Simpan ${count} booking` : "Simpan booking"}
          submitting={saving}
          disabled={blockedReason !== null}
          blockedReason={blockedReason}
          onCancel={() => {
            if (!saving) router.push(GROOMING_PATH);
          }}
        />

        {loadError && <Alert variant="error">{loadError}</Alert>}
        {formError && <Alert variant="error">{formError}</Alert>}
        {line.missing && (
          <Alert variant="warning">
            Belum ada lini bisnis bernama Grooming, jadi semua layanan utama
            ditawarkan di sini.
          </Alert>
        )}
        {clash && (
          <Alert variant="warning">
            {clash} — tekan Simpan lagi kalau memang mau dijadwalkan bersamaan.
          </Alert>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-4">
            {/* ─── PELANGGAN ─── */}
            <Card title="Pelanggan">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label>
                    Pelanggan<span className="text-danger"> *</span>
                  </Label>
                  {/*
                    THE TILL'S PICKER, dressed as the mockup's search box. It
                    searches on the server and registers a new customer without
                    leaving the form — a second searchable picker is what §2 rules out.
                  */}
                  <Button
                    type="button"
                    variant="secondary"
                    className={`${FIELD_HEIGHT} justify-start font-normal`}
                    disabled={saving}
                    onClick={() => setPicking(true)}
                  >
                    <Search className="size-4 text-muted" aria-hidden />
                    {customer ? (
                      <span className="truncate text-foreground">
                        {customer.name}
                        {customer.phone && (
                          <span className="tabular-nums text-muted"> · {customer.phone}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted">Cari nama atau nomor WhatsApp</span>
                    )}
                  </Button>
                </div>

                {customer && (
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Fact label="WhatsApp">
                      <span className="tabular-nums">{customer.phone ?? "—"}</span>
                    </Fact>
                    <Fact label="Alamat">{customer.address ?? "—"}</Fact>
                    <Fact label="Zona">
                      <span className={`${badge} bg-tint-neutral text-muted`}>Segera</span>
                    </Fact>
                    <Fact label="Member">
                      {customer.vipTier ? (
                        <span className={`${badge} bg-tint-success text-success`}>
                          {VIP_WORDS[customer.vipTier]}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Fact>
                  </dl>
                )}
              </div>
            </Card>

            {/* ─── HEWAN ─── */}
            <Card
              title="Hewan"
              action={
                <span className={`${badge} bg-tint-neutral text-muted tabular-nums`}>
                  {count} dipilih
                </span>
              }
            >
              {!customer ? (
                <p className="text-sm text-muted">
                  Pilih pelanggannya dulu — daftar hewan mengikuti pemiliknya.
                </p>
              ) : loadingPets ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Spinner /> Memuat hewan…
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {pets.length === 0 ? (
                    <p className="text-sm text-muted">
                      {customer.name} belum punya hewan terdaftar.
                    </p>
                  ) : (
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {pets.map((pet) => {
                        const on = Boolean(drafts[pet._id]);
                        return (
                          <li key={pet._id}>
                            <button
                              type="button"
                              aria-pressed={on}
                              disabled={saving}
                              onClick={() => togglePet(pet._id)}
                              className={`flex min-h-11 w-full items-center gap-3 rounded-lg border-[1.5px] px-3 py-2.5 text-left transition focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${
                                on
                                  ? "border-primary bg-navy-100"
                                  : "border-border bg-surface hover:bg-surface-hover"
                              }`}
                            >
                              <Initial name={pet.name} />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-bold text-foreground">
                                  {pet.name}
                                </span>
                                <span className="block truncate text-xs text-muted">
                                  {[
                                    optionLabel("breed", pet.breed),
                                    pet.weightKg !== null ? `${pet.weightKg} kg` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={saving}
                      onClick={() => setAddingPet(true)}
                    >
                      <Plus className="size-4" aria-hidden />
                      Daftarkan hewan baru
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {/* ─── JADWAL ─── */}
            <Card title="Jadwal">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Tanggal"
                  name="grooming-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  disabled={saving}
                  required
                />
                <TextField
                  label="Jam mulai"
                  name="grooming-time"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  disabled={saving}
                  required
                />
                {scope.branches.length > 1 && (
                  <FilterSelect
                    layout="form"
                    label="Cabang"
                    ariaLabel="Cabang"
                    value={branchId}
                    options={namedOptions(scope.branches)}
                    active={false}
                    required
                    placeholder="Pilih cabang"
                    disabled={saving}
                    onChange={setPickedBranch}
                  />
                )}
                {/*
                  ZONA AND THE TRAVEL FEE — "Segera". Drawn where the mockup
                  draws them, for a service done at the customer's address, so
                  the shop can see what is coming; nothing is saved from them.
                */}
                {homeOnly && (
                  <>
                    <SelectField
                      label="Zona perjalanan"
                      value=""
                      onChange={() => {}}
                      options={[]}
                      placeholder="Segera"
                      disabled
                      hint="Zona belum tersedia — booking tetap bisa disimpan."
                    />
                    <div className="flex flex-col gap-1.5">
                      <Label>Biaya perjalanan</Label>
                      <div
                        className={`flex ${FIELD_HEIGHT} items-center justify-between rounded-md border border-border bg-background px-3 text-sm text-muted`}
                      >
                        Dihitung sekali per kunjungan
                        <span className={`${badge} bg-tint-neutral text-muted`}>Segera</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>

            {/* ─── LAYANAN PER HEWAN ─── */}
            <section aria-labelledby="per-pet" className="flex flex-col gap-3">
              <h2 id="per-pet" className="text-lg font-bold">
                Layanan per hewan
              </h2>

              {count === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
                  Pilih hewan dulu di atas.
                </p>
              ) : loadingServices ? (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Spinner /> Memuat layanan…
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {priced.map((row) => {
                    const { pet, draft, service, quote } = row;
                    const offered = (service?.addonServiceIds ?? [])
                      .map((id) => serviceOf(id))
                      .filter((addon): addon is Service => addon !== null);
                    const share = split.shares[priced.indexOf(row)] ?? 0n;

                    return (
                      <li
                        key={pet._id}
                        className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-3 bg-navy-100 px-4 py-3">
                          <Initial name={pet.name} />
                          <span className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-bold text-foreground">
                              {pet.name}
                            </h3>
                            <span className="block truncate text-xs text-muted">
                              {[
                                optionLabel("breed", pet.breed),
                                optionLabel("size", pet.size),
                                optionLabel("furType", pet.furType),
                              ]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </span>
                          </span>
                          {onlyAt(service) === "in_home" && (
                            <span className={`${badge} bg-tint-warning text-warning`}>
                              Di alamat
                            </span>
                          )}
                          {row.minutes > 0 && (
                            <span className={`${badge} bg-surface text-foreground tabular-nums`}>
                              {row.minutes} mnt
                            </span>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={saving}
                            onClick={() => togglePet(pet._id)}
                          >
                            Hapus
                          </Button>
                        </div>

                        <div className="flex flex-col gap-4 p-4">
                          {!pet.size && (
                            <Alert variant="warning">
                              {pet.name} belum punya ukuran — ukuran wajib diisi
                              untuk booking. <PetFixLink pet={pet} axis="sizeCategory" />
                            </Alert>
                          )}

                          {/* Handling tags and allergies, read BEFORE the service. */}
                          <PetSummaryCard pet={pet} />

                          <div className="grid gap-4 sm:grid-cols-2">
                            {/*
                              A POPOVER, NOT `SelectField`. Radix Select locks the
                              page while its list is open, so on this long form the
                              page and the sidebar froze; this one lets them
                              scroll, and closes as soon as they do.
                            */}
                            <FilterSelect
                              layout="form"
                              label="Layanan"
                              value={draft.serviceId}
                              onChange={(value) =>
                                /* Different add-ons, and a different quote. */
                                patchDraft(pet._id, {
                                  serviceId: value,
                                  addonServiceIds: [],
                                  main: BLANK_PRICE,
                                  addons: {},
                                })
                              }
                              options={mainServices.map((item) => ({
                                value: item._id,
                                label: item.name,
                              }))}
                              active={false}
                              placeholder="Pilih layanan…"
                              closeOnScroll
                              disabled={saving}
                              required
                            />
                            <TextField
                              label="Varian"
                              name={`variant-${pet._id}`}
                              value={variantLabelForPet(service, pet, optionLabel) ?? "—"}
                              onChange={() => {}}
                              disabled
                            />
                            {groomers.length > 0 && (
                              /* Full width — its own row under Layanan · Varian. A
                                 popover for the same reason as Layanan above. */
                              <FilterSelect
                                layout="form"
                                label="Groomer"
                                value={draft.groomerUserId}
                                onChange={(value) =>
                                  patchDraft(pet._id, { groomerUserId: value })
                                }
                                options={[
                                  { value: "", label: "Belum ditugaskan" },
                                  ...groomers.map((groomer) => {
                                    /* "Sinta · Senior", as the mockup and the booking page write it. */
                                    const name = groomer.groomerLevel
                                      ? `${groomer.fullName} · ${GROOMER_LEVEL_LABELS[groomer.groomerLevel]}`
                                      : groomer.fullName;

                                    return {
                                      value: groomer._id,
                                      label: groomer.offReason
                                        ? `${name} — ${groomer.offReason}`
                                        : name,
                                      disabled: Boolean(groomer.offReason),
                                    };
                                  }),
                                ]}
                                active={false}
                                placeholder="Belum ditugaskan"
                                hint="Diisikan ke semua tahapan layanan ini. Bisa diganti per tahapan di halaman booking."
                                closeOnScroll
                                disabled={saving}
                                className="sm:col-span-2"
                              />
                            )}
                          </div>

                          {service && (
                            <div className="flex flex-col gap-2">
                              <p className="text-sm font-medium">Harga &amp; diskon per item</p>

                              <PriceRow
                                name={service.name}
                                line={row.main}
                                draft={draft.main}
                                missing={
                                  quote.missingAxis ? (
                                    <>
                                      {pet.name} belum punya {AXIS_LABEL[quote.missingAxis]} — harga
                                      layanan ini mengikutinya.{" "}
                                      <PetFixLink pet={pet} axis={quote.missingAxis} />
                                    </>
                                  ) : null
                                }
                                inactive={quote.inactive}
                                mayPrice={mayPrice}
                                disabled={saving}
                                onChange={(next) => patchDraft(pet._id, { main: next })}
                              />

                              {row.addons.map((addonRow) => (
                                <PriceRow
                                  key={addonRow.addonId}
                                  name={addonRow.addon?.name ?? "Add-on"}
                                  line={addonRow.line}
                                  draft={draft.addons[addonRow.addonId] ?? BLANK_PRICE}
                                  missing={
                                    addonRow.quote.missingAxis
                                      ? `${pet.name} belum punya ${AXIS_LABEL[addonRow.quote.missingAxis]}.`
                                      : null
                                  }
                                  inactive={addonRow.quote.inactive}
                                  mayPrice={mayPrice}
                                  disabled={saving}
                                  onRemove={() => {
                                    const addons = { ...draft.addons };
                                    delete addons[addonRow.addonId];
                                    patchDraft(pet._id, {
                                      addonServiceIds: draft.addonServiceIds.filter(
                                        (id) => id !== addonRow.addonId,
                                      ),
                                      addons,
                                    });
                                  }}
                                  onChange={(next) =>
                                    patchDraft(pet._id, {
                                      addons: { ...draft.addons, [addonRow.addonId]: next },
                                    })
                                  }
                                />
                              ))}
                            </div>
                          )}

                          {offered.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                              <p className="text-sm font-medium">Add-on</p>
                              <CheckRowGroup>
                                {offered.map((addon) => {
                                  const addonQuote = priceForPet(addon, pet);
                                  const checked = draft.addonServiceIds.includes(addon._id);

                                  return (
                                    <CheckRow
                                      key={addon._id}
                                      label={addon.name}
                                      description={
                                        addonQuote.inactive
                                          ? "Varian nonaktif — tidak bisa dipilih."
                                          : addonQuote.price
                                            ? `${formatMoney(addonQuote.price)}${addonQuote.durationMin ? ` · +${addonQuote.durationMin} mnt` : ""}`
                                            : "—"
                                      }
                                      checked={checked}
                                      disabled={saving || (addonQuote.inactive && !checked)}
                                      onCheckedChange={(next) => {
                                        const addons = { ...draft.addons };
                                        if (!next) delete addons[addon._id];
                                        patchDraft(pet._id, {
                                          addonServiceIds: next
                                            ? [...draft.addonServiceIds, addon._id]
                                            : draft.addonServiceIds.filter((id) => id !== addon._id),
                                          addons,
                                        });
                                      }}
                                    />
                                  );
                                })}
                              </CheckRowGroup>
                            </div>
                          )}

                          <TextareaField
                            label="Catatan internal"
                            name={`notes-${pet._id}`}
                            value={draft.internalNotes}
                            onChange={(event) =>
                              patchDraft(pet._id, { internalNotes: event.target.value })
                            }
                            maxLength={NOTES_MAX_LENGTH}
                            placeholder="Dibaca groomer dan staf — kondisi atau permintaan khusus"
                            disabled={saving}
                          />

                          <div className="flex flex-wrap items-baseline justify-between gap-3 rounded-md bg-background px-3 py-2.5 text-sm">
                            <span className="text-muted tabular-nums">
                              Subtotal {money(row.gross)}
                              {row.own > 0n && ` · diskon item ${money(row.own)}`}
                              {share > 0n && ` · bagian diskon booking ${money(share)}`}
                            </span>
                            <span className="font-extrabold tabular-nums">
                              {money(row.net - share)}
                            </span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* ─── RINGKASAN ─── */}
          <aside className="lg:sticky lg:top-20">
            <Card title="Ringkasan">
              <div className="flex flex-col gap-1 text-sm">
                <div className="border-b border-border pb-3">
                  <p className="font-bold text-foreground">{customer?.name ?? "Belum ada pelanggan"}</p>
                  <p className="text-xs text-muted tabular-nums">
                    {date || "—"} · {time || "—"}
                  </p>
                </div>

                {count === 0 ? (
                  <p className="py-2 text-muted">Belum ada hewan dipilih.</p>
                ) : (
                  <ul className="flex flex-col gap-1 pt-2">
                    {priced.map((row) => (
                      <li key={row.pet._id} className="flex flex-col">
                        <SummaryLine
                          label={`${row.pet.name} · ${row.service?.name ?? "belum ada layanan"}`}
                          detail={variantWords(row.service, row.pet)}
                          hint={
                            row.main.typed && row.main.price !== row.main.quote
                              ? "harga ditimpa"
                              : undefined
                          }
                          value={row.main.price === null ? "—" : money(row.main.price)}
                        />
                        {row.main.discount > 0n && (
                          <SummaryLine
                            tone="discount"
                            label={`Diskon ${row.service?.name ?? ""} · ${discountWords(row.draft.main.discountMode, row.draft.main.discountValue)}`}
                            value={`− ${money(row.main.discount)}`}
                          />
                        )}
                        {row.addons.map((addonRow) => {
                          const typed = row.draft.addons[addonRow.addonId] ?? BLANK_PRICE;
                          return (
                            <div key={addonRow.addonId} className="flex flex-col">
                              <SummaryLine
                                tone="sub"
                                label={`+ ${addonRow.addon?.name ?? "Add-on"}`}
                                value={addonRow.line.price === null ? "—" : money(addonRow.line.price)}
                              />
                              {addonRow.line.discount > 0n && (
                                <SummaryLine
                                  tone="discount"
                                  label={`Diskon ${addonRow.addon?.name ?? ""} · ${discountWords(typed.discountMode, typed.discountValue)}`}
                                  value={`− ${money(addonRow.line.discount)}`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </li>
                    ))}
                  </ul>
                )}

                {homeOnly && (
                  <div className="flex items-center justify-between gap-3 py-1">
                    <span>Biaya perjalanan</span>
                    <span className={`${badge} bg-tint-neutral text-muted`}>Segera</span>
                  </div>
                )}

                <div className="mt-2 flex justify-between gap-3 border-t border-border pt-2">
                  <span className="text-muted">Subtotal</span>
                  <span className="font-semibold tabular-nums">{money(subtotal)}</span>
                </div>

                {mayPrice && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <Label htmlFor="booking-discount">Diskon seluruh booking</Label>
                    <DiscountInput
                      id="booking-discount"
                      mode={bookingDiscount.mode}
                      value={bookingDiscount.value}
                      disabled={saving || count === 0}
                      onChange={(next) => setBookingDiscount(next)}
                    />
                  </div>
                )}

                {split.total > 0n && (
                  <SummaryLine
                    tone="discount"
                    label={`Diskon booking · ${discountWords(bookingDiscount.mode, bookingDiscount.value)}`}
                    value={`− ${money(split.total)}`}
                  />
                )}

                <div className="mt-2 flex items-baseline justify-between gap-3 border-t-2 border-foreground pt-2">
                  <span className="font-extrabold">Total</span>
                  <span className="text-xl font-extrabold tabular-nums">{money(total)}</span>
                </div>

                {split.total > 0n && (
                  <p className="mt-2 text-xs text-muted">
                    Diskon booking dibagi rata ke tiap booking.
                  </p>
                )}
                {!mayPrice && (
                  <p className="mt-2 text-xs text-muted">
                    Harga mengikuti katalog. Mengubah harga atau memberi diskon
                    butuh izin dari Owner atau Admin.
                  </p>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </form>

      <CustomerSearchDialog
        open={picking}
        onOpenChange={setPicking}
        onSelect={chooseCustomer}
      />

      {customer && (
        <PetQuickAddDialog
          customerId={customer._id}
          customerName={customer.name}
          open={addingPet}
          onOpenChange={setAddingPet}
          onCreated={(pet) => {
            setAddingPet(false);
            setPetsNonce((n) => n + 1);
            setDrafts((prev) => ({ ...prev, [pet._id]: blankPetDraft(pet._id) }));
          }}
        />
      )}
    </div>
  );
}

/** One fact about the customer. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold wrap-break-word text-foreground">{children}</dd>
    </div>
  );
}

/** The animal's initial — a round shape, not a face. */
function Initial({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface text-sm font-bold text-primary"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function SummaryLine({
  label,
  detail,
  hint,
  value,
  tone = "main",
}: {
  label: string;
  /** A quieter second line under the label — the variant. */
  detail?: string;
  hint?: string;
  value: string;
  tone?: "main" | "sub" | "discount";
}) {
  return (
    <div className={`flex justify-between gap-3 ${tone === "discount" ? "py-0.5" : "py-1"}`}>
      <span
        className={
          /* A discount is small print under its line — 13px, the floor (§1.6). */
          tone === "discount"
            ? "pl-3 text-xs text-success"
            : tone === "sub"
              ? "pl-3 text-muted"
              : "text-foreground"
        }
      >
        {label}
        {detail && <span className="block text-xs text-muted">{detail}</span>}
        {hint && <span className="block text-xs text-warning">{hint}</span>}
      </span>
      <span
        className={`whitespace-nowrap tabular-nums ${
          tone === "discount"
            ? "text-xs font-semibold text-success"
            : tone === "sub"
              ? "text-muted"
              : "font-semibold"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** A discount box with its Rp / % switch. Switching empties it, as the mockup does. */
function DiscountInput({
  id,
  mode,
  value,
  disabled,
  onChange,
}: {
  id: string;
  mode: DiscountMode;
  value: string;
  disabled: boolean;
  onChange: (next: { mode: DiscountMode; value: string }) => void;
}) {
  return (
    <div className="flex">
      <Input
        id={id}
        inputMode="numeric"
        className={`${FIELD_HEIGHT} rounded-r-none text-right tabular-nums`}
        value={mode === "percent" ? value : grouped(value)}
        placeholder="0"
        disabled={disabled}
        onChange={(event) => {
          let next = digitsOnly(event.target.value);
          if (mode === "percent" && next !== "" && Number(next) > 100) next = "100";
          onChange({ mode, value: next });
        }}
      />
      <Button
        type="button"
        variant="secondary"
        className={`${FIELD_HEIGHT} min-w-12 rounded-l-none`}
        disabled={disabled}
        aria-label={mode === "percent" ? "Diskon dalam persen — ganti ke rupiah" : "Diskon dalam rupiah — ganti ke persen"}
        onClick={() => onChange({ mode: mode === "percent" ? "amount" : "percent", value: "" })}
      >
        {mode === "percent" ? "%" : "Rp"}
      </Button>
    </div>
  );
}

/**
 * "Harga dasar − Diskon = Efektif" for one line — the main service or an add-on.
 *
 * A TYPED PRICE EQUAL TO THE CATALOGUE'S IS STORED AS NONE, so the line keeps
 * following the catalogue and "Katalog Rp … · kembalikan" only shows when the two
 * really differ. Without `bookings:setPrice` it is the catalogue's price, read-only.
 */
function PriceRow({
  name,
  line,
  draft,
  missing,
  inactive,
  mayPrice,
  disabled,
  onChange,
  onRemove,
}: {
  name: string;
  line: PricedLine;
  draft: PriceDraft;
  missing: React.ReactNode;
  inactive: boolean;
  mayPrice: boolean;
  disabled: boolean;
  onChange: (next: PriceDraft) => void;
  onRemove?: () => void;
}) {
  const priceId = `price-${name}`.replace(/\s+/g, "-");
  const discountId = `discount-${name}`.replace(/\s+/g, "-");
  const overridden = line.price !== null && line.quote !== null && line.price !== line.quote;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-foreground">{name}</span>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Hapus ${name}`}
            disabled={disabled}
            onClick={onRemove}
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      {inactive ? (
        <p className="text-sm">
          <span className={`${badge} bg-tint-danger text-danger`}>Varian nonaktif</span>{" "}
          <span className="text-xs text-muted">Pilih layanan lain atau aktifkan variannya di katalog.</span>
        </p>
      ) : missing && line.price === null ? (
        <p className="text-sm font-semibold text-danger">{missing}</p>
      ) : !mayPrice ? (
        <p className="flex justify-between gap-3 text-sm">
          <span className="text-muted">Harga katalog</span>
          <span className="font-semibold tabular-nums">
            {line.price === null ? "—" : money(line.price)}
          </span>
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={priceId}>Harga dasar</Label>
              <Input
                id={priceId}
                inputMode="numeric"
                className={`${FIELD_HEIGHT} text-right tabular-nums`}
                value={grouped(draft.price === "" ? quoteDigits(line.quote) : draft.price)}
                disabled={disabled}
                onChange={(event) => {
                  const next = digitsOnly(event.target.value);
                  onChange({ ...draft, price: next === quoteDigits(line.quote) ? "" : next });
                }}
              />
            </div>
            <span aria-hidden className="hidden pb-3 text-center font-bold text-muted sm:block">
              −
            </span>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={discountId}>Diskon</Label>
              <DiscountInput
                id={discountId}
                mode={draft.discountMode}
                value={draft.discountValue}
                disabled={disabled}
                onChange={(next) =>
                  onChange({ ...draft, discountMode: next.mode, discountValue: next.value })
                }
              />
            </div>
            <div className="text-right sm:min-w-28">
              <span className="text-xs text-muted">Efektif</span>
              <p
                className={`text-base font-extrabold tabular-nums ${line.discount > 0n ? "text-success" : "text-foreground"}`}
              >
                {line.price === null ? "—" : money(line.net)}
              </p>
            </div>
          </div>
          {overridden && (
            <p className="mt-2 text-xs font-semibold text-warning">
              Katalog {money(line.quote!)} ·{" "}
              <button
                type="button"
                className="rounded underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                disabled={disabled}
                onClick={() => onChange({ ...draft, price: "" })}
              >
                kembalikan
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
