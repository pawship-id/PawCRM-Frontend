"use client";

import { AlertTriangle, Stethoscope } from "lucide-react";

import type { Pet } from "@/types/api";

/**
 * WHAT A GROOMER HAS TO KNOW BEFORE TOUCHING THE ANIMAL — FR-5 kriteria 5.13.
 *
 * THIS COMPONENT IS THE FEATURE. The pet profile page is where the facts are
 * ENTERED; this is where they are READ, and it is the half that changes what
 * happens in the shop. A profile somebody has to remember to open is a profile
 * nobody opens on a Saturday morning — so the facts come to them, on the card
 * they are already filling in.
 *
 * THREE TIERS, AND THE ORDER IS THE POINT:
 *
 *   1. SEVERE ALLERGIES, red, first, always. This is the one that stops a wash
 *      going wrong, and it is why `severity` is a field rather than an adjective
 *      in a sentence.
 *   2. MEDICATIONS AND MILD ALLERGIES — things to know, not things to stop for.
 *   3. PREFERENCES AND TAGS — how the shop handles this animal.
 *
 * IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY. An empty box under every
 * pet teaches people to stop looking at the box, and the day it matters is the
 * day it is ignored.
 *
 * DELIBERATELY DUMB. It takes a `Pet` and draws it — no fetching, no state. The
 * booking form already has the animal in hand; making this component ask for it
 * again would be one request per card on a form with three.
 */
export function PetSummaryCard({
  pet,
  className,
}: {
  pet: Pet;
  className?: string;
}) {
  const severe = (pet.medical?.allergies ?? []).filter(
    (allergy) => allergy.severity === "severe",
  );
  const mild = (pet.medical?.allergies ?? []).filter(
    (allergy) => allergy.severity !== "severe",
  );
  const medications = pet.medical?.medications ?? [];
  const tags = pet.preferences?.tags ?? [];
  const preferenceText = pet.preferences?.text ?? null;

  const hasAnything =
    severe.length > 0 ||
    mild.length > 0 ||
    medications.length > 0 ||
    tags.length > 0 ||
    Boolean(preferenceText);

  if (!hasAnything) {
    return null;
  }

  return (
    <div className={className}>
      {/*
        RED, AND IT SAYS THE WORD "ALERGI". A coloured box with a name in it is
        something somebody has to decode; the label is what makes it readable at
        arm's length while holding a dog.
      */}
      {severe.length > 0 && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md bg-tint-danger px-3 py-2 text-sm font-semibold text-danger-ink"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Alergi:{" "}
            {severe
              .map((allergy) =>
                allergy.note ? `${allergy.name} (${allergy.note})` : allergy.name,
              )
              .join(", ")}
          </span>
        </p>
      )}

      {(mild.length > 0 || medications.length > 0) && (
        <p className="mt-1 flex items-start gap-2 text-xs text-muted">
          <Stethoscope className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {mild.length > 0 && (
              <span className="block">
                Alergi ringan: {mild.map((allergy) => allergy.name).join(", ")}
              </span>
            )}
            {medications.length > 0 && (
              <span className="block">
                Obat rutin:{" "}
                {medications
                  .map((medication) =>
                    /*
                      DOSE AND FREQUENCY TOGETHER OR NOT AT ALL. "Apoquel 1
                      tablet" without "2x sehari" is the half of the instruction
                      that gets somebody in trouble.
                    */
                    [medication.name, medication.dose, medication.frequency]
                      .filter(Boolean)
                      .join(" · "),
                  )
                  .join("; ")}
              </span>
            )}
          </span>
        </p>
      )}

      {/*
        ─── HOW THIS ANIMAL IS HANDLED, UNDER ITS OWN HEADING ────────────────

        It used to be a line of grey text under the alerts, where it read as a
        caption for them. It is not a caption: "dryer jangan dekat telinga" is an
        instruction somebody is about to follow, and it comes from the profile
        rather than from this visit. The label is what separates it from the
        booking's own note a few centimetres away.
      */}
      {preferenceText && (
        <div className="mt-2 rounded-md border border-secondary/40 bg-secondary/10 px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-warning">
            Catatan penanganan
          </p>
          <p className="mt-0.5 text-sm text-foreground">{preferenceText}</p>
        </div>
      )}

      {tags.length > 0 && (
        <ul className="mt-1 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-muted"
            >
              #{tag}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
