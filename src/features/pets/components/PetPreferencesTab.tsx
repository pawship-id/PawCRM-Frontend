"use client";

import { useEffect, useState } from "react";

import { Alert, FormActionBar, TagField, TextareaField } from "@/components";
import { swalToast } from "@/lib/swal";
import { petService } from "@/services/pet.service";
import type { Pet } from "@/types/api";

/**
 * How the shop handles this animal — FR-5's Preferensi tab.
 *
 * TWO CONTROLS DOING TWO JOBS. The free text is READ by a groomer ("mandi
 * duluan, jangan blow keras"); the tags are FILTERED ("which animals need two
 * people on a Saturday"). A shop can ask the tag and cannot ask the sentence,
 * which is the whole reason both exist.
 *
 * THE SUGGESTIONS ARE THE VOCABULARY. `GET /pets/tags` returns what the tenant
 * already uses, so `galak` is typed once and picked thereafter. FR-5 asked for a
 * managed list with an editor behind it; this is the deviation, and it is
 * written down in pet.model.js rather than left to be discovered.
 *
 * The tag control itself is `TagField` from `@/components` (26 October 2026),
 * shared with the customer form — normalisation and MAX_TAGS live there.
 */
export function PetPreferencesTab({
  pet,
  onSaved,
}: {
  pet: Pet;
  onSaved: (pet: Pet) => void;
}) {
  const [text, setText] = useState(pet.preferences?.text ?? "");
  const [tags, setTags] = useState<string[]>(pet.preferences?.tags ?? []);
  const [known, setKnown] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    petService
      .tags()
      .then((result) => {
        if (active) setKnown(result);
      })
      /* Suggestions are a convenience. A shop can still type the tag. */
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);

    try {
      const saved = await petService.updatePreferences(pet._id, {
        text: text.trim() === "" ? null : text.trim(),
        tags,
      });

      onSaved(saved);

      /* Chrome must never be able to fail a save — see BookingForm. */
      try {
        swalToast("Preferensi disimpan.");
      } catch {
        /* The form already shows what was saved. */
      }
    } catch {
      setError("Preferensi tidak bisa disimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <FormActionBar
        title={`Preferensi ${pet.name}`}
        submitLabel="Simpan preferensi"
        submitting={saving}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <TextareaField
        label="Catatan preferensi"
        name="pet-preferences"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={1000}
        placeholder="mis. suka dimandiin pertama, tidak suka blow dry keras"
        hint="Dibaca groomer sebelum mulai. Muncul sendiri di form booking."
        disabled={saving}
      />

      <TagField
        value={tags}
        onChange={setTags}
        suggestions={known}
        name="pet-tag"
        placeholder="galak"
        disabled={saving}
      />
    </form>
  );
}
