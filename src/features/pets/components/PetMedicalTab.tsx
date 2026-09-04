"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Alert, FormActionBar, SelectField, TextField } from "@/components";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { swalToast } from "@/lib/swal";
import { petService } from "@/services/pet.service";
import type {
  Pet,
  PetAllergy,
  PetCondition,
  PetMedication,
  PetVaccination,
} from "@/types/api";

/** Mirrors MAX_MEDICAL_ENTRIES in pet.model.js. */
const MAX_ENTRIES = 20;

const SEVERITIES = [
  { value: "severe", label: "Berat" },
  { value: "mild", label: "Ringan" },
];

/** An ISO instant as `<input type="date">` holds it, and back. */
const dateValue = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/**
 * The medical file — FR-5's Medis tab.
 *
 * WHY ANY OF THIS IS STRUCTURED. `notes` on the pet has always been free text
 * and stays that way: temperament is a sentence, and inventing a taxonomy of
 * animal moods is a form nobody maintains. What is HERE is the handful of facts
 * that have to be ACTED ON rather than read — a severe allergy raises a red
 * warning on the booking form, a vaccination has a due date something can
 * compare against, a vet's number has to be dialable. None of those work as a
 * sentence in a paragraph.
 *
 * IT SAVES THE WHOLE FILE, EVERY TIME. A partial patch cannot express "remove
 * the last allergy": an absent key would mean "leave it alone", and no form can
 * reliably tell that from "empty it".
 *
 * ITS OWN PERMISSION (`pets:medical`). A groomer may write a preference without
 * being able to drop a medication somebody's vet dictated — so a 403 here is
 * the rule working, not a bug.
 */
export function PetMedicalTab({
  pet,
  onSaved,
}: {
  pet: Pet;
  onSaved: (pet: Pet) => void;
}) {
  const [allergies, setAllergies] = useState<PetAllergy[]>(
    pet.medical?.allergies ?? [],
  );
  const [conditions, setConditions] = useState<PetCondition[]>(
    pet.medical?.conditions ?? [],
  );
  const [medications, setMedications] = useState<PetMedication[]>(
    pet.medical?.medications ?? [],
  );
  const [vaccinations, setVaccinations] = useState<PetVaccination[]>(
    pet.medical?.vaccinations ?? [],
  );
  const [clinicName, setClinicName] = useState(
    pet.medical?.vet?.clinicName ?? "",
  );
  const [vetPhone, setVetPhone] = useState(pet.medical?.vet?.phone ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    "NOW", CAPTURED ONCE ON MOUNT rather than read during render.
    `Date.now()` in a render body is impure — two renders of the same props can
    disagree — and the overdue badge does not need to be accurate to the
    millisecond. A form open across midnight showing yesterday's answer is a
    trade worth making for a render that is the same every time.
  */
  const [openedAt] = useState(() => Date.now());

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);

    try {
      const saved = await petService.updateMedical(pet._id, {
        allergies: allergies.filter((row) => row.name.trim() !== ""),
        conditions: conditions.filter((row) => row.name.trim() !== ""),
        medications: medications.filter((row) => row.name.trim() !== ""),
        vaccinations: vaccinations.filter(
          (row) => row.type.trim() !== "" && row.givenAt,
        ),
        vet: {
          clinicName: clinicName.trim() === "" ? null : clinicName.trim(),
          phone: vetPhone.trim() === "" ? null : vetPhone.trim(),
        },
      });

      onSaved(saved);

      /* Chrome must never be able to fail a save — see BookingForm. */
      try {
        swalToast("Catatan medis disimpan.");
      } catch {
        /* The form already shows what was saved. */
      }
    } catch {
      setError(
        "Catatan medis tidak bisa disimpan. Kalau ini terus terjadi, akun Anda mungkin tidak punya izin medis.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <FormActionBar
        title={`Catatan medis ${pet.name}`}
        submitLabel="Simpan catatan medis"
        submitting={saving}
      />

      {error && <Alert variant="error">{error}</Alert>}

      {/*
        ALERGI FIRST, because `severity: severe` is the one thing on this whole
        page that changes what happens in the bathing room — it is what raises
        the red warning on the booking form.
      */}
      <Section
        label="Alergi"
        hint="Yang berat muncul sebagai peringatan merah saat hewan ini dipilih di booking."
        rows={allergies}
        disabled={saving}
        onAdd={() =>
          setAllergies((prev) => [
            ...prev,
            { name: "", severity: "mild", note: null },
          ])
        }
        onRemove={(index) =>
          setAllergies((prev) => prev.filter((_, i) => i !== index))
        }
        render={(row, index) => (
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label="Nama"
              name={`allergy-name-${index}`}
              value={row.name}
              onChange={(event) =>
                setAllergies((prev) =>
                  prev.map((item, i) =>
                    i === index ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
              placeholder="mis. sampo strawberry"
              disabled={saving}
            />
            <SelectField
              label="Tingkat"
              value={row.severity}
              onChange={(value) =>
                setAllergies((prev) =>
                  prev.map((item, i) =>
                    i === index
                      ? { ...item, severity: value as PetAllergy["severity"] }
                      : item,
                  ),
                )
              }
              options={SEVERITIES}
              disabled={saving}
            />
            <TextField
              label="Catatan"
              name={`allergy-note-${index}`}
              value={row.note ?? ""}
              onChange={(event) =>
                setAllergies((prev) =>
                  prev.map((item, i) =>
                    i === index ? { ...item, note: event.target.value } : item,
                  ),
                )
              }
              disabled={saving}
            />
          </div>
        )}
      />

      <Section
        label="Kondisi"
        rows={conditions}
        disabled={saving}
        onAdd={() =>
          setConditions((prev) => [
            ...prev,
            { name: "", foundAt: null, note: null },
          ])
        }
        onRemove={(index) =>
          setConditions((prev) => prev.filter((_, i) => i !== index))
        }
        render={(row, index) => (
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label="Nama"
              name={`condition-name-${index}`}
              value={row.name}
              onChange={(event) =>
                setConditions((prev) =>
                  prev.map((item, i) =>
                    i === index ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
              placeholder="mis. displasia panggul"
              disabled={saving}
            />
            <TextField
              label="Ditemukan"
              name={`condition-found-${index}`}
              type="date"
              value={dateValue(row.foundAt)}
              onChange={(event) =>
                setConditions((prev) =>
                  prev.map((item, i) =>
                    i === index
                      ? { ...item, foundAt: event.target.value || null }
                      : item,
                  ),
                )
              }
              disabled={saving}
            />
            <TextField
              label="Catatan"
              name={`condition-note-${index}`}
              value={row.note ?? ""}
              onChange={(event) =>
                setConditions((prev) =>
                  prev.map((item, i) =>
                    i === index ? { ...item, note: event.target.value } : item,
                  ),
                )
              }
              disabled={saving}
            />
          </div>
        )}
      />

      {/*
        DOSE AND FREQUENCY ARE SEPARATE FIELDS, not one line. The reader is
        somebody about to board the animal overnight and hand it a tablet;
        "1 tablet" and "2x sehari" answer two different questions, and one
        string is where the second one goes missing.
      */}
      <Section
        label="Obat rutin"
        rows={medications}
        disabled={saving}
        onAdd={() =>
          setMedications((prev) => [
            ...prev,
            { name: "", dose: null, frequency: null, since: null },
          ])
        }
        onRemove={(index) =>
          setMedications((prev) => prev.filter((_, i) => i !== index))
        }
        render={(row, index) => (
          <div className="grid gap-3 sm:grid-cols-4">
            <TextField
              label="Nama"
              name={`med-name-${index}`}
              value={row.name}
              onChange={(event) =>
                setMedications((prev) =>
                  prev.map((item, i) =>
                    i === index ? { ...item, name: event.target.value } : item,
                  ),
                )
              }
              disabled={saving}
            />
            <TextField
              label="Dosis"
              name={`med-dose-${index}`}
              value={row.dose ?? ""}
              onChange={(event) =>
                setMedications((prev) =>
                  prev.map((item, i) =>
                    i === index ? { ...item, dose: event.target.value } : item,
                  ),
                )
              }
              placeholder="1 tablet"
              disabled={saving}
            />
            <TextField
              label="Frekuensi"
              name={`med-freq-${index}`}
              value={row.frequency ?? ""}
              onChange={(event) =>
                setMedications((prev) =>
                  prev.map((item, i) =>
                    i === index
                      ? { ...item, frequency: event.target.value }
                      : item,
                  ),
                )
              }
              placeholder="2x sehari"
              disabled={saving}
            />
            <TextField
              label="Sejak"
              name={`med-since-${index}`}
              type="date"
              value={dateValue(row.since)}
              onChange={(event) =>
                setMedications((prev) =>
                  prev.map((item, i) =>
                    i === index
                      ? { ...item, since: event.target.value || null }
                      : item,
                  ),
                )
              }
              disabled={saving}
            />
          </div>
        )}
      />

      <Section
        label="Vaksinasi"
        hint="Tanggal jatuh tempo disimpan, bukan dihitung — intervalnya beda per vaksin dan per dokter."
        rows={vaccinations}
        disabled={saving}
        onAdd={() =>
          setVaccinations((prev) => [
            ...prev,
            { type: "", givenAt: "", nextDueAt: null },
          ])
        }
        onRemove={(index) =>
          setVaccinations((prev) => prev.filter((_, i) => i !== index))
        }
        render={(row, index) => {
          const overdue =
            row.nextDueAt && new Date(row.nextDueAt).getTime() < openedAt;

          return (
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField
                label="Jenis"
                name={`vac-type-${index}`}
                value={row.type}
                onChange={(event) =>
                  setVaccinations((prev) =>
                    prev.map((item, i) =>
                      i === index ? { ...item, type: event.target.value } : item,
                    ),
                  )
                }
                placeholder="mis. rabies"
                disabled={saving}
              />
              <TextField
                label="Diberikan"
                name={`vac-given-${index}`}
                type="date"
                value={dateValue(row.givenAt)}
                onChange={(event) =>
                  setVaccinations((prev) =>
                    prev.map((item, i) =>
                      i === index
                        ? { ...item, givenAt: event.target.value }
                        : item,
                    ),
                  )
                }
                disabled={saving}
              />
              <TextField
                label="Jatuh tempo"
                name={`vac-due-${index}`}
                type="date"
                value={dateValue(row.nextDueAt)}
                onChange={(event) =>
                  setVaccinations((prev) =>
                    prev.map((item, i) =>
                      i === index
                        ? { ...item, nextDueAt: event.target.value || null }
                        : item,
                    ),
                  )
                }
                error={overdue ? "Sudah lewat" : undefined}
                disabled={saving}
              />
            </div>
          );
        }}
      />

      {/*
        A CLINIC NAME WITH NO NUMBER IS A FACT NOBODY CAN ACT ON at the moment it
        matters, which is why both fields sit together rather than the name
        living in free text.
      */}
      <div className="flex flex-col gap-2">
        <Label>Dokter hewan</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Nama klinik"
            name="vet-clinic"
            value={clinicName}
            onChange={(event) => setClinicName(event.target.value)}
            disabled={saving}
          />
          <TextField
            label="Telepon"
            name="vet-phone"
            type="tel"
            value={vetPhone}
            onChange={(event) => setVetPhone(event.target.value)}
            disabled={saving}
          />
        </div>
      </div>
    </form>
  );
}

/** One repeatable block: a heading, its rows, and a way to add another. */
function Section<T>({
  label,
  hint,
  rows,
  disabled,
  onAdd,
  onRemove,
  render,
}: {
  label: string;
  hint?: string;
  rows: T[];
  disabled: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  render: (row: T, index: number) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-muted">{hint}</p>}

      {rows.length === 0 ? (
        <p className="text-sm text-muted">Belum ada.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <li
              key={index}
              className="rounded-lg border border-border p-3"
            >
              <div className="mb-2 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled}
                  aria-label={`Hapus ${label.toLowerCase()} ${index + 1}`}
                  onClick={() => onRemove(index)}
                >
                  <X className="size-4" />
                </Button>
              </div>
              {render(row, index)}
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || rows.length >= MAX_ENTRIES}
          onClick={onAdd}
        >
          <Plus className="size-4" />
          Tambah {label.toLowerCase()}
        </Button>
      </div>
    </div>
  );
}
