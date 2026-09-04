"use client";

import { useEffect, useState } from "react";

import { Alert, FilterPills, Spinner } from "@/components";
import { petService } from "@/services/pet.service";
import type { Pet } from "@/types/api";

import { PetInfoTab } from "./PetInfoTab";
import { PetMedicalTab } from "./PetMedicalTab";
import { PetPreferencesTab } from "./PetPreferencesTab";
import { PetSummaryCard } from "./PetSummaryCard";
import { PetTimelineTab } from "./PetTimelineTab";

type Tab = "info" | "riwayat" | "preferensi" | "medis";

const TABS: { value: Tab; label: string }[] = [
  { value: "info", label: "Info" },
  { value: "riwayat", label: "Riwayat" },
  { value: "preferensi", label: "Preferensi" },
  { value: "medis", label: "Medis" },
];

/**
 * The pet profile — FR-5 / PCR-044.
 *
 * FOUR TABS, ALL OF THEM READ-FIRST. Info shows the animal's own details;
 * Riwayat, Preferensi and Medis are what make a groomer look like they know it.
 *
 * INFO USED TO MOUNT THE EDIT FORM, and that was wrong twice over. A form
 * answers in FIELD VALUES — the owner rendered as a disabled select holding a
 * customer id, so somebody opening a profile to see whose dog this is read
 * `6a9797bacc28e96138ba7764`. And it asked for a permission the page does not
 * need: three of four tabs are things to LOOK at. Editing has its own route now,
 * behind its own gate.
 *
 * PILLS RATHER THAN A TABS PRIMITIVE, because this codebase has no tabs
 * component and `FilterPills` is what it already uses to switch a view. Inventing
 * a second pattern for the same gesture would be one more thing for the next
 * screen to choose wrongly between.
 *
 * THE SUMMARY SITS ABOVE THE TABS, on every one of them. It is what somebody
 * opened the page to find out, and putting it inside a tab would mean the answer
 * is only visible if you guessed the right tab first.
 *
 * WHAT IS NOT HERE: the printable profile card (FR-5 kriteria 5.12). It is on
 * the plan and not in this phase; the browser's own print of this page is a poor
 * stand-in and is not offered as one, because a half-built print-out is worse
 * than an obviously missing button.
 */
export function PetProfileScreen({ petId }: { petId: string }) {
  const [tab, setTab] = useState<Tab>("info");
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    petService
      .getById(petId)
      .then((result) => {
        if (active) {
          setPet(result);
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError("Data hewan tidak bisa dimuat. Coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [petId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat hewan…
      </div>
    );
  }

  if (error || !pet) {
    return <Alert variant="error">{error ?? "Hewan tidak ditemukan."}</Alert>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">{pet.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {[pet.breed, pet.color].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      {/*
        THE SAME CARD THE BOOKING FORM SHOWS, on purpose. One component means one
        answer to "what does the shop know about this animal" — a second
        rendering here would eventually disagree with the one a groomer actually
        reads.
      */}
      <PetSummaryCard pet={pet} />

      <FilterPills
        value={tab}
        options={TABS}
        onChange={setTab}
        ariaLabel="Bagian profil hewan"
      />

      {tab === "info" && <PetInfoTab pet={pet} />}
      {tab === "riwayat" && <PetTimelineTab petId={pet._id} />}
      {tab === "preferensi" && (
        <PetPreferencesTab pet={pet} onSaved={setPet} />
      )}
      {tab === "medis" && <PetMedicalTab pet={pet} onSaved={setPet} />}
    </div>
  );
}
