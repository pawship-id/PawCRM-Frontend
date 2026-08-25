"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Card,
  FormActionBar,
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
import type { Pet, PetSex, PetSpecies } from "@/types/api";

import { PetOwnerField } from "./PetOwnerField";

/** Backend caps — NAME_MAX_LENGTH and friends in pet.model.js. */
const NAME_MAX_LENGTH = 80;
const BREED_MAX_LENGTH = 80;
const COLOR_MAX_LENGTH = 40;
const MICROCHIP_MAX_LENGTH = 40;
const NOTES_MAX_LENGTH = 500;
const MAX_WEIGHT_KG = 500;

/** Where both verbs return to, and what Batal goes back to. */
const LIST_PATH = "/dashboard/master/pets";

const SPECIES_OPTIONS: { value: PetSpecies; label: string }[] = [
  { value: "dog", label: "Anjing" },
  { value: "cat", label: "Kucing" },
  { value: "bird", label: "Burung" },
  { value: "rabbit", label: "Kelinci" },
  { value: "hamster", label: "Hamster" },
  { value: "reptile", label: "Reptil" },
  { value: "fish", label: "Ikan" },
  { value: "other", label: "Lainnya" },
];

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
 * NO PHOTO FIELD YET, and that is scoped rather than forgotten: the API accepts
 * one and the model stores one, but the upload control lives inside the
 * categories feature (`CategoryImageField`) and lifting it into the shared
 * component layer is a refactor of its own. It goes in when that move happens.
 */
export function PetForm({ petId }: { petId?: string }) {
  const editing = petId !== undefined;
  const router = useRouter();

  const [pet, setPet] = useState<Pet | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<PetSpecies | "">("");
  const [sex, setSex] = useState<PetSex>("unknown");
  const [breed, setBreed] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [color, setColor] = useState("");
  const [microchipNo, setMicrochipNo] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [nameError, setNameError] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [speciesError, setSpeciesError] = useState<string | null>(null);
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
        // The API returns an ISO instant; <input type="date"> wants the date half.
        setBirthDate(result.birthDate ? result.birthDate.slice(0, 10) : "");
        setWeightKg(result.weightKg === null ? "" : String(result.weightKg));
        setColor(result.color ?? "");
        setMicrochipNo(result.microchipNo ?? "");
        setNotes(result.notes ?? "");
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
    // Checked here as well as on the server, because the server's message is in
    // English and this one can point at the box.
    if (birthDate && birthDate > todayISO()) {
      setBirthDateError("Tanggal lahir tidak bisa di masa depan.");
      invalid = true;
    }

    const weight = weightKg.trim() === "" ? null : Number(weightKg);
    if (weight !== null && (Number.isNaN(weight) || weight < 0 || weight > MAX_WEIGHT_KG)) {
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
      breed: breed.trim() || null,
      birthDate: birthDate || null,
      weightKg: weight,
      color: color.trim() || null,
      microchipNo: microchipNo.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      if (editing) {
        // The whole editable surface is sent rather than a diff. Unlike a
        // category, nothing here is destructive to resend: there is no unique
        // name to collide with and no stored asset an update would delete, so
        // the diffing CategoryForm needs would be complexity without a reason.
        // `isActive` rides along, which is what makes retiring one switch flip.
        await petService.update(petId, { ...payload, isActive });
      } else {
        await petService.create({ customerId, ...payload });
      }

      // Navigate first, then toast, so the message rides along on the list.
      goBack();
      swalToast(
        editing ? "Data hewan diperbarui." : `${trimmedName} sudah didaftarkan.`,
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
              options={SPECIES_OPTIONS}
              placeholder="Pilih jenis"
              error={speciesError ?? undefined}
              disabled={saving}
              required
            />
            <SelectField
              label="Kelamin"
              value={sex}
              onChange={(next) => setSex(next as PetSex)}
              options={SEX_OPTIONS}
              hint="Belum diketahui itu jawaban yang sah — banyak hewan rescue datang tanpa keterangan."
              disabled={saving}
            />
          </div>
        </div>
      </Card>

      <Card
        title="Ciri-ciri"
        description="Semuanya opsional. Diisi kalau memang tahu — bukan tebakan."
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Ras"
              name="breed"
              value={breed}
              onChange={(event) => setBreed(event.target.value)}
              placeholder="mis. Golden Retriever"
              maxLength={BREED_MAX_LENGTH}
              disabled={saving}
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

          {/* Keterangan closes the card — §16, whatever its length. */}
          <TextareaField
            label="Catatan"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            hint="Yang perlu diketahui groomer sebelum pegang hewannya — takut air, alergi sampo tertentu, tidak suka kakinya dipegang lama."
            placeholder="mis. Suka menggigit kalau kakinya dipegang terlalu lama"
            maxLength={NOTES_MAX_LENGTH}
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
