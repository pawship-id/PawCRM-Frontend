"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/features/tenant";
import { ApiError } from "@/services/api-error";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import type { Customer, Pet, PetTimelineEntry } from "@/types/api";

import { speciesLabel } from "./PetBadges";

import "@/features/pos/print/receipt.css";

const SEX_LABELS: Record<string, string> = {
  male: "Jantan",
  female: "Betina",
  unknown: "—",
};

function day(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
}

/**
 * KARTU PROFIL HEWAN — kriteria 5.12, the sheet handed to the groomer.
 *
 * ─── WHY IT IS PRINTED AT ALL, IN AN APP THAT HAS THE SCREEN ───────────────
 *
 * The groomer is standing at a wet table with a dog in both hands. They are not
 * going to unlock a phone, and the shop's one tablet is at the counter taking
 * the next booking. A sheet clipped to the cage door is read at the moment it
 * matters, which is the only moment an allergy note is worth anything.
 *
 * ─── WHAT IS ON IT, AND WHAT IS DELIBERATELY NOT ───────────────────────────
 *
 * ONE PAGE. The requirement says so and it is right: two pages means the second
 * one is on a different table by the time somebody needs it.
 *
 * SEVERE ALLERGIES FIRST AND IN A BOX. On screen `PetSummaryCard` can rely on
 * colour; paper is often black and white, so the box and the word BERAT carry it
 * instead of the red.
 *
 * NO PRICES, NO INVOICE NUMBERS, NO OWNER ADDRESS. This sheet gets left on a
 * table in a room customers walk through. It carries what somebody needs to
 * handle the animal and a phone number to ring if something goes wrong.
 *
 * THE VET'S NUMBER IS ON IT for the same reason: the moment it is needed, nobody
 * is going to go looking for a screen.
 *
 * ─── PRINTING MECHANICS ────────────────────────────────────────────────────
 *
 * `flushSync` IS LOAD-BEARING — `window.print()` runs synchronously against the
 * CURRENT DOM, and React would otherwise still have the state update queued.
 * The same trap `InvoicePrintScreen` documents.
 *
 * `receipt.css` removes every direct child of `body` except `[data-print-root]`,
 * which is what stops the dashboard chrome printing around the card.
 */
export function PetCardPrintScreen({ petId }: { petId: string }) {
  const { tenant } = useTenant();

  const [pet, setPet] = useState<Pet | null>(null);
  const [owner, setOwner] = useState<Customer | null>(null);
  const [lastGroom, setLastGroom] = useState<PetTimelineEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let active = true;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    petService
      .getById(petId)
      .then(async (found) => {
        if (!active) return;
        setPet(found);

        /*
          THE OWNER AND THE LAST VISIT ARE FETCHED SEPARATELY AND ALLOWED TO
          FAIL. Neither is what the card is for — a sheet with the allergies and
          no phone number still does its job, and one that refused to print
          because a timeline call timed out would send somebody to the wet table
          with nothing at all.
        */
        const [ownerResult, timelineResult] = await Promise.allSettled([
          customerService.getById(found.customerId),
          /*
            THE WHOLE TIMELINE, AND ONLY ITS FIRST ROW IS READ. The endpoint
            takes no `limit` — it answers a profile screen that shows everything
            — and inventing one here would be a query parameter the server
            ignores, which reads as a promise it does not keep.
          */
          petService.timeline(petId, { kind: "booking" }),
        ]);

        if (!active) return;

        if (ownerResult.status === "fulfilled") setOwner(ownerResult.value);
        if (timelineResult.status === "fulfilled") {
          setLastGroom(timelineResult.value.entries[0] ?? null);
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "Hewan ini tidak ada, atau bukan milik toko Anda."
            : "Profil hewan tidak bisa dimuat. Coba lagi.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [petId]);

  function print() {
    if (!pet) return;

    const previousTitle = document.title;

    flushSync(() => setPrinting(true));
    /* The filename a browser suggests when somebody prints to PDF. */
    document.title = `Kartu ${pet.name}`;

    /*
      `afterprint` rather than the line after `print()`: Chrome blocks until the
      dialog closes and Safari does not, so restoring unconditionally would tear
      the sheet out of the page while the dialog was still open.
    */
    window.addEventListener(
      "afterprint",
      () => {
        document.title = previousTitle;
        setPrinting(false);
      },
      { once: true },
    );

    window.print();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat profil…
      </div>
    );
  }

  if (error || !pet) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="error">{error ?? "Hewan tidak ditemukan."}</Alert>
        <Button variant="secondary" asChild className="self-start">
          <Link href="/dashboard/master/pets">Kembali ke daftar hewan</Link>
        </Button>
      </div>
    );
  }

  const severe = (pet.medical?.allergies ?? []).filter(
    (allergy) => allergy.severity === "severe",
  );
  const mild = (pet.medical?.allergies ?? []).filter(
    (allergy) => allergy.severity !== "severe",
  );
  const conditions = pet.medical?.conditions ?? [];
  const medications = pet.medical?.medications ?? [];
  const tags = pet.preferences?.tags ?? [];
  const vet = pet.medical?.vet;

  return (
    <div className="flex flex-col gap-4">
      {!printing && (
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Button variant="secondary" asChild>
            <Link href={`/dashboard/master/pets/${pet._id}`}>Kembali</Link>
          </Button>
          <Button onClick={print}>Cetak kartu</Button>
        </div>
      )}

      {/*
        `data-print-root` IS WHAT SURVIVES THE PRINT. Everything else on the page
        is removed by `receipt.css` — not hidden, removed: a hidden box still
        occupies the page and would push the card onto sheet two.
      */}
      <div
        data-print-root
        className="mx-auto w-full max-w-[210mm] bg-white p-8 text-black"
      >
        <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-3">
          <div>
            <h1 className="text-3xl font-extrabold leading-tight">{pet.name}</h1>
            <p className="text-sm">
              {speciesLabel(pet.species)}
              {pet.breed ? ` · ${pet.breed}` : ""}
              {` · ${SEX_LABELS[pet.sex] ?? pet.sex}`}
              {pet.weightKg ? ` · ${pet.weightKg} kg` : ""}
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-semibold">{tenant?.name ?? "—"}</p>
            <p>Dicetak {day(new Date().toISOString())}</p>
          </div>
        </header>

        {/*
          FIRST ON THE PAGE, AND IN A BOX. On screen `PetSummaryCard` can lean on
          red; a sheet is often printed in black and white, so the border and the
          word BERAT do the work the colour cannot.
        */}
        {severe.length > 0 && (
          <section className="mt-4 border-4 border-black p-3">
            <h2 className="text-lg font-extrabold uppercase">
              Alergi berat — jangan dipakai
            </h2>
            <ul className="mt-1 list-disc pl-5 text-base font-bold">
              {severe.map((allergy) => (
                <li key={allergy.name}>
                  {allergy.name}
                  {allergy.note ? ` — ${allergy.note}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <section>
            <h2 className="font-bold uppercase">Pemilik</h2>
            <p>{owner?.name ?? "—"}</p>
            {/* The number is the point of this block — it is who to ring. */}
            <p className="tabular-nums">{owner?.phone ?? "—"}</p>
          </section>

          <section>
            <h2 className="font-bold uppercase">Dokter hewan</h2>
            <p>{vet?.clinicName ?? "—"}</p>
            <p className="tabular-nums">{vet?.phone ?? "—"}</p>
          </section>
        </div>

        <section className="mt-4 text-sm">
          <h2 className="font-bold uppercase">Cara menangani</h2>
          {pet.preferences?.text ? (
            <p className="whitespace-pre-wrap">{pet.preferences.text}</p>
          ) : (
            <p>—</p>
          )}
          {tags.length > 0 && (
            <p className="mt-1 font-semibold">{tags.join(" · ")}</p>
          )}
        </section>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <section>
            <h2 className="font-bold uppercase">Alergi lain</h2>
            {mild.length > 0 ? (
              <ul className="list-disc pl-5">
                {mild.map((allergy) => (
                  <li key={allergy.name}>
                    {allergy.name}
                    {allergy.note ? ` — ${allergy.note}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
          </section>

          <section>
            <h2 className="font-bold uppercase">Kondisi &amp; obat</h2>
            {conditions.length > 0 || medications.length > 0 ? (
              <ul className="list-disc pl-5">
                {conditions.map((condition) => (
                  <li key={condition.name}>{condition.name}</li>
                ))}
                {medications.map((medication) => (
                  <li key={medication.name}>
                    {medication.name}
                    {medication.dose ? ` — ${medication.dose}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
          </section>
        </div>

        <section className="mt-4 border-t border-black pt-2 text-sm">
          <h2 className="font-bold uppercase">Terakhir digroom</h2>
          <p>
            {lastGroom
              ? `${day(lastGroom.at)} · ${lastGroom.title}${
                  lastGroom.groomerName ? ` · ${lastGroom.groomerName}` : ""
                }`
              : "Belum pernah tercatat"}
          </p>
        </section>

        {/*
          A LINE TO WRITE ON. The card is handed over at the start of the job and
          comes back at the end; whoever groomed the dog has something to say
          about it, and a sheet with nowhere to say it gets written on the back.
        */}
        <section className="mt-6 border-t border-black pt-2 text-sm">
          <h2 className="font-bold uppercase">Catatan groomer hari ini</h2>
          <div className="mt-6 border-b border-black" />
          <div className="mt-5 border-b border-black" />
        </section>
      </div>
    </div>
  );
}
