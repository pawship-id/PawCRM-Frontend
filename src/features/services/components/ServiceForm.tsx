"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Card,
  CheckRow,
  CheckRowGroup,
  FilterSelect,
  FormActionBar,
  ImageField,
  SelectField,
  Spinner,
  TextField,
  TextareaField,
} from "@/components";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import { businessLineService } from "@/services/businessLine.service";
import { branchService } from "@/services/branch.service";
import { swalToast } from "@/lib/swal";
import type {
  Branch,
  Service,
  ServiceLocation,
  ServiceType,
  ServiceVariantAxis,
  ServiceVariantInput,
} from "@/types/api";
import type { MediaAsset } from "@/types/inventory";

import {
  buildVariantCombos,
  comboKey,
  LOCATION_LABELS,
  ServiceAddonPicker,
  ServiceBranchScope,
  ServiceVariantEditor,
  StringListField,
} from "./ServiceFormFields";

/** Backend caps — NAME_MAX_LENGTH and friends in service.model.js. */
const NAME_MAX_LENGTH = 160;
const CODE_MAX_LENGTH = 40;
const DESCRIPTION_MAX_LENGTH = 500;
const MAX_DURATION_MIN = 1440;
const MAX_SESSIONS = 50;
const SESSION_MAX_LENGTH = 120;
const MAX_INCLUDED_ITEMS = 30;
const INCLUDED_ITEM_MAX_LENGTH = 200;

/** The API's page cap. Asking for more is a 400, not a bigger page. */
const OPTION_FETCH_LIMIT = 100;

const SERVICE_LOCATION_ORDER: ServiceLocation[] = ["in_store", "in_home"];

/**
 * DIGITS ONLY — no separator, no decimal point.
 *
 * The API accepts four decimal places and this box refuses all of them, which is
 * deliberate rather than lazy. In Indonesian, `.` is the THOUSANDS separator:
 * somebody typing "150.000" means a hundred and fifty thousand, and a validator
 * that accepted it as a well-formed decimal would store **150 rupiah** — silently,
 * with the form showing exactly what they typed.
 *
 * Allowing sen would not fix it either, because it cannot be told apart from the
 * mistake: "150.000" is a valid three-decimal amount and a valid mistyped
 * hundred-fifty-thousand, and no rule can read the writer's mind. Refusing the
 * character removes the ambiguity instead of guessing at it.
 *
 * Nothing is lost. `formatMoney` rounds to whole units on the way out — "nobody
 * prices in sen" — so a fractional price entered here would be invisible
 * everywhere it was later displayed. Accepting input the UI then hides is worse
 * than refusing it.
 */
const WHOLE_RUPIAH = /^\d+$/;

const LIST_PATH = "/dashboard/master/layanan";

/** "150000.0000" → "150000" — a counter should not read past the decimals. */
function trimStoredPrice(price: string): string {
  return price.replace(/\.?0+$/, "");
}

/**
 * Create or edit a service — a **Form Entitas** (ui-rules §16): one record, no
 * row table underneath, so one card per group of fields.
 *
 * FIELD ORDER follows §16's entity order — Nama first and full-width, then the
 * identifier (Kode), then the classification that decides where its revenue
 * lands (Lini bisnis) and what it can be attached to (Jenis layanan), then the
 * optional attributes, then the note last.
 *
 * ONE COMPONENT FOR BOTH VERBS, matching CategoryForm and PetForm: the fields are
 * identical and only the request and the wording differ.
 *
 * THE PRICE IS A STRING ALL THE WAY THROUGH. It is typed as text, validated as a
 * decimal, and sent as written — never parsed into a Number anywhere in this
 * file. `JSON.parse("199999.99")` is already not 199999.99, and a price is the
 * input to every total the tenant will ever invoice. That holds for a variant's
 * price exactly as it does for a flat one.
 *
 * FLAT OR PER-VARIANT, NEVER BOTH, which is the server's own rule (see
 * `ServiceService.#prepareVariantConfig`). The switch decides which half of the
 * card is shown, and the payload carries only that half: `price` alone, or
 * `variantAxes` + `variants` alone.
 */
export function ServiceForm({ serviceId }: { serviceId?: string }) {
  const editing = serviceId !== undefined;
  const router = useRouter();

  const [service, setService] = useState<Service | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lines, setLines] = useState<{ value: string; label: string }[]>([]);
  const [linesError, setLinesError] = useState<string | null>(null);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  const [addons, setAddons] = useState<Service[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(true);
  const [addonsError, setAddonsError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [businessLineId, setBusinessLineId] = useState("");
  const [image, setImage] = useState<MediaAsset | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>("main");
  const [durationMin, setDurationMin] = useState("");
  const [description, setDescription] = useState("");

  const [hasVariants, setHasVariants] = useState(false);
  const [price, setPrice] = useState("");
  const [variantAxes, setVariantAxes] = useState<ServiceVariantAxis[]>([]);
  const [variantPrices, setVariantPrices] = useState<Record<string, string>>(
    {},
  );

  const [sessions, setSessions] = useState<string[]>([]);
  const [included, setIncluded] = useState<string[]>([]);
  const [serviceLocations, setServiceLocations] = useState<ServiceLocation[]>([
    "in_store",
  ]);
  const [pickupDeliveryAvailable, setPickupDeliveryAvailable] = useState(false);
  const [allBranches, setAllBranches] = useState(true);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [addonServiceIds, setAddonServiceIds] = useState<string[]>([]);
  const [taxExempt, setTaxExempt] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const combos = useMemo(
    () => buildVariantCombos(variantAxes),
    [variantAxes],
  );

  useEffect(() => {
    let active = true;

    businessLineService
      .list({ limit: OPTION_FETCH_LIMIT })
      .then((result) => {
        if (!active) return;
        setLines(
          result.items.map((line) => ({ value: line._id, label: line.name })),
        );
      })
      .catch(() => {
        if (!active) return;
        // Our own sentence, never the server's — the API answers in English.
        setLinesError("Daftar lini bisnis tidak bisa dimuat. Coba muat ulang.");
      });

    /*
      BOTH LISTS FAIL SOFTLY. `branches:read` and a second `services:read` page
      are separate reads from the one that opened this form, and a role can hold
      the form's grant without them. Neither failure blocks a save: the schema's
      defaults — every branch, no add-ons — are the safe answers when the list
      cannot be seen, and both are reported beside their own field.
    */
    branchService
      .list({ limit: OPTION_FETCH_LIMIT })
      .then((result) => {
        if (!active) return;
        setBranches(result.items);
      })
      .catch(() => {
        if (!active) return;
        setBranchesError("Daftar cabang tidak bisa dimuat.");
      })
      .finally(() => {
        if (active) setBranchesLoading(false);
      });

    serviceService
      .list({ serviceType: "addon", isActive: true, limit: OPTION_FETCH_LIMIT })
      .then((result) => {
        if (!active) return;
        setAddons(result.items);
      })
      .catch(() => {
        if (!active) return;
        setAddonsError("Daftar add-on tidak bisa dimuat.");
      })
      .finally(() => {
        if (active) setAddonsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!serviceId) return;

    let active = true;

    serviceService
      .getById(serviceId)
      .then((result) => {
        if (!active) return;
        setService(result);
        setName(result.name);
        /*
          EVERY FIELD BELOW IS READ DEFENSIVELY, and the reason is a real blank
          page rather than caution. A service priced before these fields existed
          is stored without them — repository reads are `.lean()`, so Mongoose's
          defaults never apply — and the first thing this form did with one was
          `axes.includes(...)` on undefined.

          ServiceService now fills the shape in on the way out, which is the
          fix; this is the second belt. A form that blanks the page cannot be
          used to REPAIR the record that blanked it, which is exactly what an
          old service needs — and `code`, optional until this release, is null
          on plenty of them, which would also flip its input to uncontrolled.
        */
        setCode(result.code ?? "");
        setBusinessLineId(result.businessLineId);
        setImage(result.image ?? null);
        setServiceType(result.serviceType ?? "main");
        // The API stores four decimals; a counter should not have to read past
        // "150000.0000" to see the price they typed.
        setPrice(result.price === null ? "" : trimStoredPrice(result.price));
        setDurationMin(
          result.durationMin === null ? "" : String(result.durationMin),
        );
        setDescription(result.description ?? "");
        const axes = result.variantAxes ?? [];
        setHasVariants(result.hasVariants ?? false);
        setVariantAxes(axes);
        setVariantPrices(
          Object.fromEntries(
            (result.variants ?? []).map((variant) => [
              comboKey(axes, variant),
              trimStoredPrice(variant.price),
            ]),
          ),
        );
        setSessions(result.sessions ?? []);
        setIncluded(result.included ?? []);
        // Not `[]`: an old service has no locations stored, and leaving the
        // field empty would make Simpan fail on a rule the user never set.
        // "Di toko" is what every service predating the field actually was.
        setServiceLocations(
          result.serviceLocations?.length ? result.serviceLocations : ["in_store"],
        );
        setPickupDeliveryAvailable(result.pickupDeliveryAvailable ?? false);
        setAllBranches(result.allBranches ?? true);
        setBranchIds(result.branchIds ?? []);
        setAddonServiceIds(result.addonServiceIds ?? []);
        setTaxExempt(result.taxExempt);
        setIsActive(result.isActive);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Data layanan ini tidak bisa dimuat.",
        );
      });

    return () => {
      active = false;
    };
  }, [serviceId]);

  function goBack() {
    router.push(LIST_PATH);
  }

  function toggleAxis(axis: ServiceVariantAxis, checked: boolean) {
    setVariantError(null);
    setVariantAxes((current) =>
      checked
        ? [...current, axis]
        : current.filter((entry) => entry !== axis),
    );
  }

  function toggleLocation(location: ServiceLocation, checked: boolean) {
    setLocationError(null);
    setServiceLocations((current) =>
      checked
        ? [...current, location]
        : current.filter((entry) => entry !== location),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const trimmedName = name.trim();
    const trimmedPrice = price.trim();
    const trimmedCode = code.trim().toUpperCase();
    let invalid = false;

    if (trimmedName === "") {
      setNameError("Nama layanan wajib diisi.");
      invalid = true;
    } else if (trimmedName.length > NAME_MAX_LENGTH) {
      setNameError(`Maksimal ${NAME_MAX_LENGTH} karakter.`);
      invalid = true;
    }
    if (!businessLineId) {
      setLineError("Pilih lini bisnisnya dulu.");
      invalid = true;
    }

    /*
      ─── THE CODE IS REQUIRED ──────────────────────────────────────────────────

      It is what staff quote to each other and how a service is found in a hurry,
      so it is expected from the day the service is priced rather than added
      later — the same rule a product's SKU already keeps.
    */
    if (trimmedCode === "") {
      setCodeError("Kode wajib diisi.");
      invalid = true;
    } else if (/\s/.test(trimmedCode)) {
      setCodeError("Kode tidak boleh mengandung spasi.");
      invalid = true;
    }

    /*
      FLAT OR PER-VARIANT, NEVER BOTH — the server's rule, checked here so the
      answer arrives before a round trip. Every generated row must carry a price:
      a blank one is a combination the till could not quote.
    */
    let variants: ServiceVariantInput[] = [];
    if (hasVariants) {
      if (variantAxes.length === 0) {
        setVariantError("Pilih minimal satu dasar pembeda harga.");
        invalid = true;
      } else if (
        combos.some((combo) => (variantPrices[combo.key] ?? "").trim() === "")
      ) {
        setVariantError("Semua baris varian harus punya harga.");
        invalid = true;
      } else if (
        combos.some(
          (combo) => !WHOLE_RUPIAH.test((variantPrices[combo.key] ?? "").trim()),
        )
      ) {
        setVariantError(
          "Isi angka saja, tanpa titik atau koma. Contoh: 150000",
        );
        invalid = true;
      } else {
        variants = combos.map((combo) => ({
          petType: combo.petType,
          sizeCategory: combo.sizeCategory,
          furType: combo.furType,
          price: (variantPrices[combo.key] ?? "").trim(),
        }));
      }
    } else if (trimmedPrice === "") {
      setPriceError("Harga wajib diisi.");
      invalid = true;
    } else if (!WHOLE_RUPIAH.test(trimmedPrice)) {
      setPriceError("Isi angka saja, tanpa titik atau koma. Contoh: 150000");
      invalid = true;
    }

    /*
      ─── REQUIRED SINCE 3 SEPTEMBER 2026 ───────────────────────────────────────

      The calendar has to draw a block, the clash check has to know when somebody
      is free again, and "selesai sekitar" has to add up. A service with no
      duration makes all three GUESS at half an hour — and a guess on a calendar
      is read as fact by everybody downstream.

      IT WAS NULLABLE FOR A GOOD REASON, and that reason expired. The field
      shipped two phases before the booking module so a duration added later would
      not mean backfilling every service a tenant had already priced. The module
      is here; the field has readers.
    */
    const duration =
      durationMin.trim() === "" ? null : Number(durationMin.trim());
    if (duration === null) {
      setDurationError(
        "Wajib diisi — kalender dan pengecekan bentrok membacanya.",
      );
      invalid = true;
    } else if (
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > MAX_DURATION_MIN
    ) {
      setDurationError(
        `Isi menit antara 1 dan ${MAX_DURATION_MIN}. Lebih dari sehari itu penitipan, dihitung per malam.`,
      );
      invalid = true;
    }

    if (serviceLocations.length === 0) {
      setLocationError("Pilih minimal satu lokasi layanan.");
      invalid = true;
    }

    // The same call the server makes: a service available at no branch at all
    // vanishes from every till while looking perfectly healthy on its own page.
    if (!allBranches && branchIds.length === 0) {
      setBranchError(
        "Pilih minimal satu cabang, atau centang “Semua cabang”.",
      );
      invalid = true;
    }

    if (invalid) return;

    setSaving(true);
    setFormError(null);

    const payload = {
      name: trimmedName,
      code: trimmedCode,
      businessLineId,
      image,
      durationMin: duration as number,
      description: description.trim() || null,
      hasVariants,
      // Exactly one half of the pricing is sent. Sending both is a 400, and
      // sending the unused half as an empty value would be a lie about it.
      ...(hasVariants
        ? { variantAxes, variants }
        : // Sent exactly as typed. Never Number(price).
          { price: trimmedPrice, variantAxes: [], variants: [] }),
      sessions,
      included,
      serviceLocations,
      pickupDeliveryAvailable,
      allBranches,
      branchIds: allBranches ? [] : branchIds,
      serviceType,
      // An add-on may not carry add-ons of its own — the server empties the
      // list anyway, and sending it would ask for something it refuses to mean.
      addonServiceIds: serviceType === "main" ? addonServiceIds : [],
      taxExempt,
    };

    try {
      if (editing) {
        await serviceService.update(serviceId, { ...payload, isActive });
      } else {
        await serviceService.create(payload);
      }

      goBack();
      swalToast(
        editing ? "Layanan diperbarui." : `Layanan ${trimmedName} dibuat.`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // The only 409 a create or update raises is a duplicate code, and it
        // belongs on that field rather than in a banner.
        setCodeError(`Kode "${trimmedCode}" sudah dipakai layanan lain.`);
      } else if (error instanceof ApiError && error.status === 400) {
        const detail = error.details?.[0];
        if (detail?.field === "businessLineId") {
          setLineError("Lini bisnis ini tidak ditemukan lagi. Pilih yang lain.");
        } else if (detail?.field === "branchIds") {
          setBranchError(detail.message);
        } else if (
          detail?.field === "variants" ||
          detail?.field === "variantAxes"
        ) {
          setVariantError(error.reason ?? error.message);
        } else {
          setFormError(error.reason ?? error.message);
        }
      } else {
        setFormError(
          error instanceof ApiError
            ? (error.reason ?? error.message)
            : "Terjadi kesalahan. Coba lagi.",
        );
      }
      setSaving(false);
    }
  }

  if (loadError) {
    return <Alert variant="error">{loadError}</Alert>;
  }

  if (editing && !service) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat data layanan…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <FormActionBar
        title={editing ? "Ubah layanan" : "Layanan baru"}
        meta={editing ? (service?.name ?? undefined) : undefined}
        submitLabel={editing ? "Simpan layanan" : "Buat layanan"}
        submitting={saving}
        onCancel={goBack}
      />

      {formError && <Alert variant="error">{formError}</Alert>}

      <Card
        title="Identitas"
        description="Nama yang muncul di kasir dan di form booking, dan lini bisnis yang menentukan ke akun pendapatan mana penjualannya masuk."
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Nama layanan"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
            error={nameError ?? undefined}
            placeholder="mis. Grooming Full Service"
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            disabled={saving}
            required
          />

          <TextField
            label="Kode"
            name="code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setCodeError(null);
            }}
            error={codeError ?? undefined}
            placeholder="mis. GRM-FULL"
            maxLength={CODE_MAX_LENGTH}
            hint="Untuk input cepat di kasir. Tanpa spasi, dan harus unik."
            disabled={saving}
            required
          />

          <div className="flex flex-col gap-1.5">
            <FilterSelect
              layout="form"
              label="Lini bisnis"
              ariaLabel="Pilih lini bisnis"
              value={businessLineId}
              options={lines}
              onChange={(next) => {
                setBusinessLineId(next);
                setLineError(null);
              }}
              active={false}
              placeholder="Pilih lini bisnis"
              searchable
              required
              disabled={saving}
              error={lineError ?? linesError ?? undefined}
            />
            <p className="text-xs text-muted">
              Menentukan laba-rugi lini mana yang mencatat penjualan ini.
            </p>
          </div>

          <SelectField
            label="Jenis layanan"
            value={serviceType}
            onChange={(next) => setServiceType(next as ServiceType)}
            options={[
              { value: "main", label: "Layanan utama" },
              { value: "addon", label: "Add-on" },
            ]}
            hint="Layanan utama dipesan langsung. Add-on cuma bisa ditempelkan ke layanan utama."
            disabled={saving}
            required
          />

          <ImageField
            value={image}
            onChange={setImage}
            purpose="service"
            alt="Gambar layanan"
            hint="Opsional. PNG, JPG atau WebP, dipotong jadi kotak — itu bentuk tampilannya di kasir dan etalase."
            disabled={saving}
          />
        </div>
      </Card>

      <Card
        title="Harga & durasi"
        description="Harga bisa satu untuk semua, atau beda-beda per varian. Durasi dibaca kalender dan pengecekan bentrok."
      >
        <div className="flex flex-col gap-5">
          <TextField
            label="Durasi (menit)"
            name="durationMin"
            type="number"
            min={1}
            max={MAX_DURATION_MIN}
            value={durationMin}
            onChange={(event) => {
              setDurationMin(event.target.value);
              setDurationError(null);
            }}
            error={durationError ?? undefined}
            placeholder="90"
            hint="Dipakai kalender dan pengecekan bentrok."
            disabled={saving}
            required
            className="sm:max-w-xs"
          />

          <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
            <div className="min-w-0">
              <Label htmlFor="service-has-variants">
                Harga beda per varian
              </Label>
              <p className="mt-1 max-w-prose text-xs text-muted">
                Nyalakan kalau harganya tergantung hewannya — tipe, ukuran, atau
                jenis bulu. Kalau mati, satu harga berlaku untuk semua.
              </p>
            </div>
            <Switch
              id="service-has-variants"
              checked={hasVariants}
              onCheckedChange={(next) => {
                setHasVariants(next);
                setPriceError(null);
                setVariantError(null);
              }}
              disabled={saving}
            />
          </div>

          {hasVariants ? (
            <ServiceVariantEditor
              axes={variantAxes}
              prices={variantPrices}
              combos={combos}
              error={variantError ?? undefined}
              disabled={saving}
              onToggleAxis={toggleAxis}
              onPriceChange={(key, value) => {
                setVariantError(null);
                setVariantPrices((current) => ({ ...current, [key]: value }));
              }}
            />
          ) : (
            <TextField
              label="Harga"
              name="price"
              // `inputMode` rather than type=number: a number input in some
              // browsers silently reformats and loses what was typed, and this
              // value must reach the API exactly as written.
              inputMode="numeric"
              value={price}
              onChange={(event) => {
                setPrice(event.target.value);
                setPriceError(null);
              }}
              error={priceError ?? undefined}
              placeholder="150000"
              hint="Boleh 0 — layanan gratis itu hal yang nyata."
              disabled={saving}
              required
              className="sm:max-w-xs"
            />
          )}
        </div>
      </Card>

      <Card
        title="Isi layanan"
        description="Sesi dipakai kalender untuk memecah pengerjaannya. Termasuk dipakai etalase untuk menyebut apa saja yang didapat pelanggan."
      >
        <div className="flex flex-col gap-6">
          <StringListField
            label="Sesi"
            hint="Tahapan pengerjaannya, mis. Mandi → Gunting → Selesai."
            placeholder="mis. Mandi"
            values={sessions}
            maxItems={MAX_SESSIONS}
            maxLength={SESSION_MAX_LENGTH}
            disabled={saving}
            onChange={setSessions}
          />

          <div className="border-t border-border pt-6">
            <StringListField
              label="Termasuk"
              hint="Apa saja yang sudah masuk harga. Beda dari keterangan — ini daftar, bukan paragraf."
              placeholder="mis. Potong kuku"
              values={included}
              maxItems={MAX_INCLUDED_ITEMS}
              maxLength={INCLUDED_ITEM_MAX_LENGTH}
              disabled={saving}
              onChange={setIncluded}
            />
          </div>
        </div>
      </Card>

      <Card
        title="Lokasi & jangkauan"
        description="Di mana layanan ini dikerjakan, dan di cabang mana bisa dipesan."
      >
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-sm font-medium">Lokasi layanan</p>
            <p className="mt-1 text-xs text-muted">
              Boleh dua-duanya — grooming panggilan yang juga melayani di toko.
            </p>
            <CheckRowGroup className="mt-2">
              {SERVICE_LOCATION_ORDER.map((location) => (
                <CheckRow
                  key={location}
                  label={LOCATION_LABELS[location]}
                  checked={serviceLocations.includes(location)}
                  onCheckedChange={(checked) =>
                    toggleLocation(location, checked)
                  }
                  disabled={saving}
                />
              ))}
            </CheckRowGroup>
            {locationError && (
              <p role="alert" className="mt-1 text-xs text-danger">
                {locationError}
              </p>
            )}
          </div>

          <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
            <div className="min-w-0">
              <Label htmlFor="service-pickup-delivery">
                Bisa antar-jemput
              </Label>
              <p className="mt-1 max-w-prose text-xs text-muted">
                Nyalakan kalau hewannya boleh dijemput dan diantar pulang.
              </p>
            </div>
            <Switch
              id="service-pickup-delivery"
              checked={pickupDeliveryAvailable}
              onCheckedChange={setPickupDeliveryAvailable}
              disabled={saving}
            />
          </div>

          <div className="border-t border-border pt-4">
            <ServiceBranchScope
              branches={branches}
              loading={branchesLoading}
              loadError={branchesError}
              allBranches={allBranches}
              branchIds={branchIds}
              error={branchError ?? undefined}
              disabled={saving}
              onChange={(patch) => {
                setBranchError(null);
                if (patch.allBranches !== undefined)
                  setAllBranches(patch.allBranches);
                if (patch.branchIds !== undefined) setBranchIds(patch.branchIds);
              }}
            />
          </div>
        </div>
      </Card>

      {/*
        ONLY ON A MAIN SERVICE. An add-on may not carry add-ons of its own — the
        server empties the list rather than refusing the save — so the card is
        absent rather than shown disabled, which would offer a choice that has
        no effect.
      */}
      {serviceType === "main" && (
        <Card
          title="Add-on"
          description="Layanan tambahan yang bisa dicentang bareng layanan ini di kasir."
        >
          <ServiceAddonPicker
            addons={addons.filter((addon) => addon._id !== serviceId)}
            loading={addonsLoading}
            loadError={addonsError}
            selected={addonServiceIds}
            disabled={saving}
            onChange={setAddonServiceIds}
          />
        </Card>
      )}

      <Card
        title="Pajak"
        description="Tarif PPN-nya diatur sekali di Pengaturan, bukan per layanan. Yang diatur di sini cuma apakah layanan ini kena atau tidak."
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="service-tax-exempt">Bebas PPN</Label>
            <p className="mt-1 max-w-prose text-xs text-muted">
              Nyalakan kalau layanan ini tidak dikenai PPN. Kebanyakan layanan
              kena, jadi biarkan mati kalau ragu.
            </p>
          </div>
          <Switch
            id="service-tax-exempt"
            checked={taxExempt}
            onCheckedChange={setTaxExempt}
            disabled={saving}
          />
        </div>
      </Card>

      <Card
        title="Keterangan"
        description="Opsional. Sebaris dua baris soal layanan ini — daftar isinya sendiri diisi di Termasuk."
      >
        <TextareaField
          label="Keterangan"
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="mis. Mandi lengkap dengan pengeringan dan penataan bulu"
          maxLength={DESCRIPTION_MAX_LENGTH}
          disabled={saving}
        />
      </Card>

      {editing && (
        <Card
          title="Ketersediaan"
          description="Layanan nonaktif tidak hilang — cuma berhenti ditawarkan di kasir."
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="service-active">Masih ditawarkan</Label>
              <p className="mt-1 max-w-prose text-xs text-muted">
                Matikan kalau layanan ini sudah tidak dijual lagi. Struk dan
                laporan lama tetap menyebut namanya — itu bedanya dengan
                menghapus, yang ada di menu barisnya dan ditolak selama masih
                dipakai paket bundling atau jadi add-on layanan lain.
              </p>
            </div>
            <Switch
              id="service-active"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={saving}
            />
          </div>
        </Card>
      )}
    </form>
  );
}
