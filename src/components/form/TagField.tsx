"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TextField } from "../TextField";

/** Mirrors MAX_TAGS in pet.model.js — the customer model uses the same limit. */
export const MAX_TAGS = 10;

/** Mirrors TAG_MAX_LENGTH in pet.model.js — the customer model uses the same limit. */
export const TAG_MAX_LENGTH = 40;

/**
 * The same normalisation the server applies, run here so the chip somebody sees
 * is the chip that gets stored.
 *
 * WITHOUT IT the form shows `#Galak` and the server keeps `galak`, and the two
 * disagreeing is how people stop trusting a tag.
 */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-");
}

export interface TagFieldProps {
  /** The tags as stored — already normalised. */
  value: string[];
  onChange: (tags: string[]) => void;
  /**
   * What the tenant already uses (`GET /pets/tags`, `GET /customers/tags`).
   * Offered as one-press chips, minus the ones already on this record, so a tag
   * is typed once and picked thereafter.
   */
  suggestions?: string[];
  /** The draft input's `name` — distinct per form, so tests and autofill can find it. */
  name: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
}

/**
 * Free-form tags with suggestions — the control pets got first (PetPreferencesTab)
 * and customers second, promoted here when the second one arrived (§14).
 *
 * CONTROLLED ON THE LIST, LOCAL ON THE DRAFT. The caller owns the tags because it
 * saves them; the half-typed word is nobody's business until Enter or Tambah.
 *
 * ENTER ADDS THE TAG, IT DOES NOT SUBMIT THE FORM. Without the preventDefault a
 * form saves on Enter, and somebody adding their second tag would find the first
 * one saved and the page moved on.
 */
export function TagField({
  value,
  onChange,
  suggestions = [],
  name,
  label = "Tag",
  placeholder,
  disabled,
  error,
}: TagFieldProps) {
  const [draft, setDraft] = useState("");
  const full = value.length >= MAX_TAGS;

  function addTag(raw: string) {
    const tag = normalizeTag(raw);
    setDraft("");

    if (!tag || value.includes(tag) || full) return;

    onChange([...value, tag]);
  }

  const unused = suggestions.filter((tag) => !value.includes(tag));

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((tag) => (
            <li key={tag}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled}
                aria-label={`Hapus tag ${tag}`}
                onClick={() => onChange(value.filter((item) => item !== tag))}
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
          name={name}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addTag(draft);
            }
          }}
          maxLength={TAG_MAX_LENGTH}
          placeholder={placeholder}
          hint={`Maksimal ${MAX_TAGS} tag. Huruf kecil, spasi jadi tanda hubung.`}
          error={error}
          disabled={disabled || full}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || draft.trim() === "" || full}
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
              disabled={disabled || full}
              onClick={() => addTag(tag)}
            >
              #{tag}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
