"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Card,
  FilterSelect,
  FormActionBar,
  Spinner,
  TextField,
  TextareaField,
} from "@/components";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import { businessLineService } from "@/services/businessLine.service";
import { swalToast } from "@/lib/swal";
import type { Service } from "@/types/api";

/** Backend caps — NAME_MAX_LENGTH and friends in service.model.js. */
const NAME_MAX_LENGTH = 160;
const CODE_MAX_LENGTH = 40;
const DESCRIPTION_MAX_LENGTH = 500;
const MAX_DURATION_MIN = 1440;

/** The API's page cap. Asking for more is a 400, not a bigger page. */
const LINE_FETCH_LIMIT = 100;

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

/**
 * Create or edit a service — a **Form Entitas** (ui-rules §16): one record, no
 * row table underneath, so one card per group of fields.
 *
 * FIELD ORDER follows §16's entity order — Nama first and full-width, then the
 * identifier (Kode), then the classification that decides where its revenue
 * lands (Lini bisnis), then the optional attributes, then the note last.
 *
 * ONE COMPONENT FOR BOTH VERBS, matching CategoryForm and PetForm: the fields are
 * identical and only the request and the wording differ.
 *
 * THE PRICE IS A STRING ALL THE WAY THROUGH. It is typed as text, validated as a
 * decimal, and sent as written — never parsed into a Number anywhere in this
 * file. `JSON.parse("199999.99")` is already not 199999.99, and a price is the
 * input to every total the tenant will ever invoice.
 */
export function ServiceForm({ serviceId }: { serviceId?: string }) {
  const editing = serviceId !== undefined;
  const router = useRouter();

  const [service, setService] = useState<Service | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lines, setLines] = useState<{ value: string; label: string }[]>([]);
  const [linesError, setLinesError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [businessLineId, setBusinessLineId] = useState("");
  const [price, setPrice] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [description, setDescription] = useState("");
  const [taxExempt, setTaxExempt] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    businessLineService
      .list({ limit: LINE_FETCH_LIMIT })
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
        setCode(result.code ?? "");
        setBusinessLineId(result.businessLineId);
        // The API stores four decimals; a counter should not have to read past
        // "150000.0000" to see the price they typed.
        setPrice(result.price.replace(/\.?0+$/, ""));
        setDurationMin(
          result.durationMin === null ? "" : String(result.durationMin),
        );
        setDescription(result.description ?? "");
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
    if (trimmedPrice === "") {
      setPriceError("Harga wajib diisi.");
      invalid = true;
    } else if (!WHOLE_RUPIAH.test(trimmedPrice)) {
      setPriceError("Isi angka saja, tanpa titik atau koma. Contoh: 150000");
      invalid = true;
    }
    if (trimmedCode && /\s/.test(trimmedCode)) {
      setCodeError("Kode tidak boleh mengandung spasi.");
      invalid = true;
    }

    const duration =
      durationMin.trim() === "" ? null : Number(durationMin.trim());
    if (
      duration !== null &&
      (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION_MIN)
    ) {
      setDurationError(
        `Isi menit antara 1 dan ${MAX_DURATION_MIN}. Lebih dari sehari itu penitipan, dihitung per malam.`,
      );
      invalid = true;
    }

    if (invalid) return;

    setSaving(true);
    setFormError(null);

    const payload = {
      name: trimmedName,
      businessLineId,
      // Sent exactly as typed. Never Number(price).
      price: trimmedPrice,
      code: trimmedCode || null,
      durationMin: duration,
      description: description.trim() || null,
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
            hint="Opsional — untuk input cepat di kasir. Tanpa spasi, dan harus unik."
            disabled={saving}
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
        </div>
      </Card>

      <Card
        title="Harga & durasi"
        description="Harga wajib. Durasi belum dipakai di mana-mana — nanti dibaca modul Booking saat menaruh layanan ini di kalender."
      >
        <div className="grid gap-4 sm:grid-cols-2">
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
          />
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
            disabled={saving}
          />
        </div>
      </Card>

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
        description="Opsional. Sebaris dua baris soal apa yang termasuk di dalamnya."
      >
        <TextareaField
          label="Keterangan"
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="mis. Mandi, potong kuku, bersih telinga, blow dry"
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
                dipakai paket bundling.
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
