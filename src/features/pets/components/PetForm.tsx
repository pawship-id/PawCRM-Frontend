"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Card,
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
import { petService } from "@/services/pet.service";
import { swalToast } from "@/lib/swal";
import type {
  Pet,
  PetBreed,
  PetFurType,
  PetSex,
  PetSize,
  PetSpecies,
} from "@/types/api";
import type { MediaAsset } from "@/types/inventory";

import { usePetPickers } from "../hooks/usePetPickers";
import { PetOwnerField } from "./PetOwnerField";

/** Backend caps — NAME_MAX_LENGTH and friends in pet.model.js. */
const NAME_MAX_LENGTH = 80;
const COLOR_MAX_LENGTH = 40;
const MICROCHIP_MAX_LENGTH = 40;
const DESCRIPTION_MAX_LENGTH = 500;
const INTERNAL_NOTES_MAX_LENGTH = 500;
const MAX_WEIGHT_KG = 500;

/** Where both verbs return to, and what Batal goes back to. */
const LIST_PATH = "/dashboard/master/pets";

const SEX_OPTIONS: { value: PetSex; label: string }[] = [
  { value: "male", label: "Jantan" },
  { value: "female", label: "Betina" },
  { value: "unknown", label: "Belum diketahui" },
];

/** Today, as the yyyy-mm-dd an <input type="date"> max attribute wants. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Register or edit a pet — a **Form Entitas** (ui-rules §16): one record, no row
 * table underneath, so one card with fields grouped under section headers.
 *
 * FIELD ORDER follows §16's entity order — Nama first and full-width, then the
 * classification that decides what can be booked (Pemilik, Jenis, Kelamin), then
 * the optional attributes nobody has to fill in, then the note last. A pet has no
 * kapan/di mana, so the transaction ordering does not apply.
 *
 * ONE COMPONENT FOR BOTH VERBS, matching CategoryForm: the fields are identical
 * and only the request and the wording differ. `petId` is what tells them apart —
 * absent registers, present edits and makes this component fetch the pet first.
 *
 * THE OWNER IS LOCKED WHEN EDITING. `customerId` is absent from the API's PATCH
 * schema, so a change here would be silently dropped; the control is disabled and
 * says why. See PetOwnerField.
 *
 * THE ACTIVE SWITCH ONLY APPEARS WHEN EDITING. A pet is registered because it is
 * in the shop's care — offering "register this one and retire it immediately"
 * answers a question nobody asked. Retiring is a decision taken later.
 *
 * UKURAN AND JENIS BULU ARE REQUIRED (23 September 2026, on request), and that
 * is a deliberate reversal of how they started. They were optional on the
 * grounds that a flat-priced shop has nothing to say in either, with the two
 * screens that DO need them asking at the moment they need them —
 * `PetQuickAddDialog` under `requireTraits`, or `PetFixLink` sending somebody
 * back afterwards. Asking here instead is the shop's call: a variant-priced
 * grooming is priced BY size and coat, so a pet registered without them is one
 * that cannot be quoted until somebody returns to this form anyway.
 *
 * ⚠️ THE API STILL ACCEPTS NEITHER, and deliberately. `pet.validation.js` keeps
 * both optional and nullable because two callers legitimately send null: the
 * quick-add dialog with `requireTraits` off (the till, the customer screen),
 * and every pet registered before this rule existed. Tightening the server
 * would break the till and lock the edit screen out of its own stored data.
 *
 * ⚠️ AN EDIT OF AN OLDER PET NOW HAS TO ANSWER THEM. A pet registered when the
 * fields were optional loads with both blank, so somebody opening it to fix a
 * weight is asked for a size and a coat before they can save. That is the rule
 * doing what it was asked to do rather than a bug — but it is why `PetFixLink`
 * still exists and still points here.
 *
 * JENIS, RAS, UKURAN AND JENIS BULU ARE THE SHOP'S OWN LISTS. They were four
 * hardcoded arrays here — cat and dog, domestic and poodle — until 14 September
 * 2026, when they became tenant data (`petoptions`) a shop adds to, renames and
 * retires. The pet still stores the CODE; the pickers offer the ACTIVE options,
 * in the shop's order.
 *
 * AN EDIT KEEPS WHAT THE PET ALREADY HOLDS. When the stored value's option has
 * since been retired or deleted it stays in the picker, marked "(nonaktif)":
 * the server still accepts a retired value the pet already has, and a select
 * with no item for its value renders blank and clears it on the next save —
 * losing a fact nobody chose to change. It is the LOADED pet's value that is
 * kept, not the field's current one, so switching away and back still works.
 *
 * WHILE THE LISTS LOAD only the four pickers wait (disabled, "Memuat…"); the
 * rest of the form is usable. See `usePetPickers` for why the stored value is
 * not called retired in that moment.
 *
 * THE PHOTO IS THE ONE FIELD SENT AS A DIFF, and the rest of the form is not.
 * Everything else here is safe to resend — there is no unique name to collide
 * with and nothing an unchanged value destroys — but `photo` is both of the
 * things that made CategoryForm diff:
 *
 *   1. AN UNCHANGED ASSET CANNOT BE RESENT AT ALL. The API strips the upload's
 *      `token` before storing it, so the photo a GET returns has none — and
 *      `MediaService.assertOwned` refuses an asset without one. Resending what
 *      was loaded would fail every save of a pet that has a picture.
 *   2. THE API DELETES THE BYTES AN UPDATE DROPS. Sending the field at all on a
 *      patch that did not touch it is one dropped connection away from losing
 *      the photo.
 *
 * So it goes in the payload only when the storage key moved — compared by key
 * rather than by object identity, because the asset is replaced wholesale on
 * every upload and `!==` on the objects would call a re-render a change.
 */
export function PetForm({ petId }: { petId?: string }) {
  const editing = petId !== undefined;
  const router = useRouter();
  const {
    pickerOptions,
    breedOptions,
    loading: optionsLoading,
    error: optionsError,
  } = usePetPickers();

  const [pet, setPet] = useState<Pet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<PetSpecies | "">("");
  const [sex, setSex] = useState<PetSex>("unknown");
  const [breed, setBreed] = useState<PetBreed | "">("");
  const [furType, setFurType] = useState<PetFurType | "">("");
  const [size, setSize] = useState<PetSize | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [color, setColor] = useState("");
  const [microchipNo, setMicrochipNo] = useState("");
  const [description, setDescription] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [photo, setPhoto] = useState<MediaAsset | null>(null);
  const [isActive, setIsActive] = useState(true);

  const [nameError, setNameError] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [speciesError, setSpeciesError] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [furTypeError, setFurTypeError] = useState<string | null>(null);
  const [birthDateError, setBirthDateError] = useState<string | null>(null);
  const [weightError, setWeightError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!petId) return;

    let active = true;

    petService
      .getById(petId)
      .then((result) => {
        if (!active) return;
        setPet(result);
        setCustomerId(result.customerId);
        setName(result.name);
        setSpecies(result.species);
        setSex(result.sex);
        setBreed(result.breed ?? "");
        setFurType(result.furType ?? "");
        setSize(result.size ?? "");
        // The API returns an ISO instant; <input type="date"> wants the date half.
        setBirthDate(result.birthDate ? result.birthDate.slice(0, 10) : "");
        setWeightKg(result.weightKg === null ? "" : String(result.weightKg));
        setColor(result.color ?? "");
        setMicrochipNo(result.microchipNo ?? "");
        setDescription(result.description ?? "");
        setInternalNotes(result.internalNotes ?? "");
        setPhoto(result.photo ?? null);
        setIsActive(result.isActive);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : "Data hewan ini tidak bisa dimuat.",
        );
      });

    return () => {
      active = false;
    };
  }, [petId]);

  function goBack() {
    router.push(LIST_PATH);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const trimmedName = name.trim();
    let invalid = false;

    if (!customerId) {
      setOwnerError("Pilih pemiliknya dulu.");
      invalid = true;
    }
    if (trimmedName === "") {
      setNameError("Nama hewan wajib diisi.");
      invalid = true;
    } else if (trimmedName.length > NAME_MAX_LENGTH) {
      setNameError(`Maksimal ${NAME_MAX_LENGTH} karakter.`);
      invalid = true;
    }
    if (species === "") {
      setSpeciesError("Pilih jenis hewannya.");
      invalid = true;
    }
    /*
      UKURAN AND JENIS BULU ARE ANSWERS HERE, not offers — see the header. The
      same two fields `PetQuickAddDialog` demands under `requireTraits`, asked
      unconditionally because this is the form that registers the animal
      properly.
    */
    if (size === "") {
      setSizeError("Pilih ukurannya.");
      invalid = true;
    }
    if (furType === "") {
      setFurTypeError("Pilih jenis bulunya.");
      invalid = true;
    }
    // Checked here as well as on the server, because the server's message is in
    // English and this one can point at the box.
    if (birthDate && birthDate > todayISO()) {
      setBirthDateError("Tanggal lahir tidak bisa di masa depan.");
      invalid = true;
    }

    const weight = weightKg.trim() === "" ? null : Number(weightKg);
    if (
      weight !== null &&
      (Number.isNaN(weight) || weight < 0 || weight > MAX_WEIGHT_KG)
    ) {
      setWeightError(`Isi angka antara 0 dan ${MAX_WEIGHT_KG}.`);
      invalid = true;
    }

    if (invalid) return;

    setSaving(true);
    setFormError(null);

    // "" and null both mean "kosong" on the server, so an emptied box and a
    // field that never had a value must not read as a change.
    const payload = {
      name: trimmedName,
      species: species as PetSpecies,
      sex,
      breed: breed || null,
      furType: furType || null,
      size: size || null,
      birthDate: birthDate || null,
      weightKg: weight,
      color: color.trim() || null,
      microchipNo: microchipNo.trim() || null,
      description: description.trim() || null,
      internalNotes: internalNotes.trim() || null,
    };

    /*
      THE ONE FIELD COMPARED BEFORE IT IS SENT — see the header for both reasons.
      By storage key, not by object identity: an upload replaces the asset
      wholesale, so `!==` on the objects would call a re-render a change.
    */
    const repictured =
      editing &&
      (photo?.storageKey ?? null) !== (pet?.photo?.storageKey ?? null);

    try {
      if (editing) {
        // Everything except the photo is sent whole rather than as a diff.
        // Unlike a category, none of it is destructive to resend: there is no
        // unique name to collide with and nothing a repeated value deletes.
        // `isActive` rides along, which is what makes retiring one switch flip.
        await petService.update(petId, {
          ...payload,
          // `null` is how a photo is taken off, so an omission and a null mean
          // different things here — which is exactly why this is spread rather
          // than always present.
          ...(repictured ? { photo } : {}),
          isActive,
        });
      } else {
        await petService.create({
          customerId,
          ...payload,
          // Sent only when there is one: a create carrying `photo: null` reads
          // as though somebody cleared a field that never existed.
          ...(photo ? { photo } : {}),
        });
      }

      // Navigate first, then toast, so the message rides along on the list.
      goBack();
      swalToast(
        editing
          ? "Data hewan diperbarui."
          : `${trimmedName} sudah didaftarkan.`,
      );
    } catch (error) {
      // The owner failures come back attributed to customerId, so they belong on
      // that field rather than in a banner.
      if (error instanceof ApiError && error.status === 400) {
        const ownerDetail = error.details?.find(
          (detail) => detail.field === "customerId",
        );
        if (ownerDetail) {
          setOwnerError("Pelanggan ini tidak ditemukan lagi. Pilih yang lain.");
          setSaving(false);
          return;
        }
      }
      setFormError(
        error instanceof ApiError
          ? (error.reason ?? error.message)
          : "Terjadi kesalahan. Coba lagi.",
      );
      setSaving(false);
    }
  }

  if (loadError) {
    return <Alert variant="error">{loadError}</Alert>;
  }

  if (editing && !pet) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat data hewan…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* The document's head — §16. Not pinned; it scrolls with the page. */}
      <FormActionBar
        title={editing ? "Ubah data hewan" : "Hewan baru"}
        meta={editing ? (pet?.name ?? undefined) : undefined}
        submitLabel={editing ? "Simpan hewan" : "Daftarkan hewan"}
        submitting={saving}
        onCancel={goBack}
      />

      {formError && <Alert variant="error">{formError}</Alert>}

      <Card
        title="Identitas"
        description="Siapa pemiliknya dan hewan apa — dua hal yang menentukan layanan mana yang bisa dibooking."
      >
        <div className="flex flex-col gap-4">
          <TextField
            label="Nama hewan"
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
            error={nameError ?? undefined}
            placeholder="mis. Bella"
            maxLength={NAME_MAX_LENGTH}
            autoFocus
            disabled={saving}
            required
          />

          <PetOwnerField
            value={customerId}
            onChange={(next) => {
              setCustomerId(next);
              setOwnerError(null);
            }}
            disabled={saving}
            locked={editing}
            error={ownerError ?? undefined}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Jenis"
              value={species}
              onChange={(next) => {
                setSpecies(next as PetSpecies);
                setSpeciesError(null);
              }}
              options={pickerOptions("species", pet?.species)}
              placeholder={optionsLoading ? "Memuat…" : "Pilih jenis"}
              error={speciesError ?? undefined}
              /* One sentence for all four lists — they load together. */
              hint={optionsError ?? undefined}
              disabled={saving || optionsLoading}
              required
            />
            <SelectField
              label="Kelamin"
              value={sex}
              onChange={(next) => setSex(next as PetSex)}
              options={SEX_OPTIONS}
              disabled={saving}
            />
          </div>
        </div>
      </Card>

      <Card
        title="Ciri-ciri"
        description="Ukuran dan jenis bulu wajib diisi — harga grooming dihitung dari keduanya. Sisanya diisi kalau memang tahu, bukan tebakan."
      >
        <div className="flex flex-col gap-4">
          {/*
            FIRST IN THIS CARD, because a photo is the most direct ciri-ciri
            there is: it settles "which one is Bella" faster than a breed and a
            colour read together, and it is what the list, the profile header and
            the printed card all draw.

            IT UPLOADS ON CROP, BEFORE THE PET IS SAVED — the media endpoint is
            owner-agnostic, so there is no pet to attach it to yet. Somebody who
            then presses Batal leaves bytes nothing points at, which
            `seeds/sweepOrphanMedia.js` collects after a day. See ImageField.
          */}
          <ImageField
            value={photo}
            onChange={setPhoto}
            purpose="pet"
            label="Foto"
            alt={name.trim() ? `Foto ${name.trim()}` : "Foto hewan"}
            hint="PNG, JPG atau WebP. Dipotong jadi kotak — itu bentuknya di daftar hewan dan kartu profil."
            disabled={saving}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Ras"
              value={breed}
              onChange={(next) => setBreed(next as PetBreed)}
              /* Only this animal's breeds — see `breedOptions`. */
              options={breedOptions(species, pet?.breed)}
              placeholder={optionsLoading ? "Memuat…" : "Pilih ras"}
              hint={
                species
                  ? undefined
                  : "Pilih jenis hewan dulu untuk menyaring rasnya."
              }
              disabled={saving || optionsLoading}
            />
            <TextField
              label="Warna"
              name="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              placeholder="mis. Coklat keemasan"
              maxLength={COLOR_MAX_LENGTH}
              disabled={saving}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Ukuran"
              value={size}
              onChange={(next) => {
                setSize(next as PetSize);
                setSizeError(null);
              }}
              options={pickerOptions("size", pet?.size)}
              placeholder={optionsLoading ? "Memuat…" : "Pilih ukuran"}
              error={sizeError ?? undefined}
              disabled={saving || optionsLoading}
              required
            />
            <SelectField
              label="Jenis bulu"
              value={furType}
              onChange={(next) => {
                setFurType(next as PetFurType);
                setFurTypeError(null);
              }}
              options={pickerOptions("furType", pet?.furType)}
              placeholder={optionsLoading ? "Memuat…" : "Pilih jenis bulu"}
              error={furTypeError ?? undefined}
              disabled={saving || optionsLoading}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Tanggal lahir"
              name="birthDate"
              type="date"
              value={birthDate}
              max={todayISO()}
              onChange={(event) => {
                setBirthDate(event.target.value);
                setBirthDateError(null);
              }}
              error={birthDateError ?? undefined}
              hint="Umurnya dihitung otomatis dari sini."
              disabled={saving}
            />
            <TextField
              label="Berat (kg)"
              name="weightKg"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={0}
              max={MAX_WEIGHT_KG}
              value={weightKg}
              onChange={(event) => {
                setWeightKg(event.target.value);
                setWeightError(null);
              }}
              error={weightError ?? undefined}
              placeholder="mis. 12.4"
              hint="Berat terakhir yang ditimbang."
              disabled={saving}
            />
          </div>

          <TextField
            label="Nomor microchip"
            name="microchipNo"
            value={microchipNo}
            onChange={(event) => setMicrochipNo(event.target.value)}
            placeholder="Sesuai sertifikat pemilik"
            maxLength={MICROCHIP_MAX_LENGTH}
            disabled={saving}
          />

          <TextareaField
            label="Deskripsi"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            hint="Gambaran umum hewannya — penampilan, kepribadian."
            placeholder="mis. Kucing domestik berbulu tebal, aktif dan ramah"
            maxLength={DESCRIPTION_MAX_LENGTH}
            disabled={saving}
          />

          {/* Keterangan closes the card — §16, whatever its length. */}
          <TextareaField
            label="Catatan internal"
            name="internalNotes"
            value={internalNotes}
            onChange={(event) => setInternalNotes(event.target.value)}
            hint="Yang perlu diketahui groomer sebelum pegang hewannya — takut air, alergi sampo tertentu, tidak suka kakinya dipegang lama."
            placeholder="mis. Suka menggigit kalau kakinya dipegang terlalu lama"
            maxLength={INTERNAL_NOTES_MAX_LENGTH}
            disabled={saving}
          />
        </div>
      </Card>

      {editing && (
        <Card
          title="Status perawatan"
          description="Hewan yang tidak aktif tidak hilang — cuma berhenti ditawarkan saat bikin booking."
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor="pet-active">Masih dirawat</Label>
              <p className="mt-1 max-w-prose text-xs text-muted">
                Matikan kalau hewannya sudah pindah rumah atau sudah tidak ada.
                Riwayat grooming dan transaksinya tetap tersimpan atas nama
                pemilik ini — itu bedanya dengan menghapus, yang ada di menu
                barisnya.
              </p>
            </div>
            <Switch
              id="pet-active"
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
