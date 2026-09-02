"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Alert, FormActionBar, TextField, TextareaField } from "@/components";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { swalToast } from "@/lib/swal";
import { petService } from "@/services/pet.service";
import type { Pet } from "@/types/api";

/** Mirrors MAX_TAGS in pet.model.js. */
const MAX_TAGS = 10;

/**
 * The same normalisation the server applies, run here so the chip somebody sees
 * is the chip that gets stored.
 *
 * WITHOUT IT the form shows `#Galak` and the list filters on `galak`, and the
 * two disagreeing is how people stop trusting a filter.
 */
function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
}

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
  const [draft, setDraft] = useState("");
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

  function addTag(raw: string) {
    const tag = normalize(raw);

    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) {
      setDraft("");
      return;
    }

    setTags((prev) => [...prev, tag]);
    setDraft("");
  }

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

      /* Chrome must never be able to fail a save — see BookingCreateForm. */
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

  const unused = known.filter((tag) => !tags.includes(tag));

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

      <div className="flex flex-col gap-2">
        <Label>Tag</Label>

        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={saving}
                  aria-label={`Hapus tag ${tag}`}
                  onClick={() =>
                    setTags((prev) => prev.filter((item) => item !== tag))
                  }
                >
                  #{tag}
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label="Tambah tag"
            name="pet-tag"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              /*
                ENTER ADDS THE TAG, IT DOES NOT SUBMIT THE FORM. Without the
                preventDefault a single-field form saves on Enter, and somebody
                adding their second tag would find the first one saved and the
                page moved on.
              */
              if (event.key === "Enter") {
                event.preventDefault();
                addTag(draft);
              }
            }}
            placeholder="galak"
            hint={`Maksimal ${MAX_TAGS} tag. Huruf kecil, spasi jadi tanda hubung.`}
            disabled={saving || tags.length >= MAX_TAGS}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={saving || draft.trim() === "" || tags.length >= MAX_TAGS}
            onClick={() => addTag(draft)}
          >
            Tambah
          </Button>
        </div>

        {unused.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Sudah dipakai di toko:</span>
            {unused.slice(0, 12).map((tag) => (
              <Button
                key={tag}
                type="button"
                variant="ghost"
                size="sm"
                disabled={saving || tags.length >= MAX_TAGS}
                onClick={() => addTag(tag)}
              >
                #{tag}
              </Button>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}
