"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Pencil, Printer } from "lucide-react";

import { Alert, Breadcrumb, Card, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Can } from "@/features/permissions";
import { usePetOptions } from "@/hooks/usePetOptions";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import type { Pet } from "@/types/api";

import { petAgeText } from "../age";
import { PetAvatar } from "./PetAvatar";
import { PetStatusBadge } from "./PetBadges";
import { PetMembershipPanel } from "@/features/memberships";

import { PetInfoTab } from "./PetInfoTab";
import { PetMedicalTab } from "./PetMedicalTab";
import { PetPreferencesTab } from "./PetPreferencesTab";
import { PetSummaryCard } from "./PetSummaryCard";
import { PetTimelineTab } from "./PetTimelineTab";

type Tab = "info" | "riwayat" | "preferensi" | "medis";

const TABS: { id: Tab; label: string }[] = [
  { id: "info", label: "Info" },
  { id: "riwayat", label: "Riwayat" },
  { id: "preferensi", label: "Preferensi" },
  { id: "medis", label: "Medis" },
];

/**
 * The pet profile — FR-5 / PCR-044, in the shape the mockup draws
 * (buloo-navigation-v3, `pelHewanDetail`).
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
 * ─── IT FOLLOWS THE MOCKUP NOW (28 September 2026, on request) ─────────────
 *
 * Three things changed, and each replaced something this screen had invented:
 *
 *   THE HERO IS A CARD (`prof-hero`): photo, name, one line saying whose animal
 *   this is and what it is, then the status and its handling tags as chips. The
 *   buttons moved up here from inside the Info tab — where "Ubah data hewan"
 *   vanished the moment somebody switched to Riwayat, which is a button people
 *   conclude does not exist.
 *
 *   UNDERLINE TABS, NOT `FilterPills` (`.tabs`). Both rows switch a view, and the
 *   pills were the closest thing this codebase had before. The underline is the
 *   one the mockup draws for the sections of one record, and it is what
 *   GroomingServiceDetailScreen already uses for the same job — `role="tablist"`
 *   with a roving tabindex, arrows, Home and End. Not `PageTabs`: that one
 *   NAVIGATES, one route per tab, and these four are one route.
 *
 *   EACH TAB BODY SITS IN A `.sec` CARD with its own heading. They used to sit
 *   straight on the page background under the pills, so a tab's content had no
 *   edge and no name of its own.
 *
 * WHAT THE MOCKUP DOES NOT GET. Its status chip TOGGLES Aktif/Nonaktif on click;
 * here that is a field on the edit form, and a badge that silently rewrites the
 * record it is describing is the one control on a read page that should not
 * exist. Its avatar is an orange square holding a paw icon — ui-rules §12 bans
 * the paw as decoration by name, and `PetAvatar` has the real photo. And there is
 * no "Kembali" button: the mockup needs one because its crumb is plain bold text,
 * while the breadcrumb above is real links.
 *
 * `Cetak kartu` is KEPT although the mockup draws no such button — it is a real
 * screen (FR-5 kriteria 5.12) that was reachable from the Info tab, and dropping
 * it to match a drawing would take a feature away.
 *
 * THE OWNER IS FETCHED HERE, not in the Info tab, and passed down. The hero names
 * them and so does the tab, so one fetch is shared rather than two requests for
 * the same customer.
 */
export function PetProfileScreen({ petId }: { petId: string }) {
  const [tab, setTab] = useState<Tab>("info");
  const [pet, setPet] = useState<Pet | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  /* Breed and species under the name are CODES; the words are the tenant's. */
  const { label } = usePetOptions();

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

  /* A SECOND REQUEST, once the animal names its owner. A failure is silent: both
     places that show the name fall back to saying so rather than to an id. */
  const customerId = pet?.customerId ?? null;

  useEffect(() => {
    if (!customerId) return;

    let active = true;

    customerService
      .getById(customerId)
      .then((customer) => {
        if (active) setOwnerName(customer.name);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [customerId]);

  /** Arrows, Home and End move between tabs — ARIA's tablist contract. */
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((entry) => entry.id === tab);
    const next =
      event.key === "ArrowRight"
        ? TABS[(index + 1) % TABS.length]
        : event.key === "ArrowLeft"
          ? TABS[(index - 1 + TABS.length) % TABS.length]
          : event.key === "Home"
            ? TABS[0]
            : event.key === "End"
              ? TABS[TABS.length - 1]
              : null;

    if (!next) return;
    event.preventDefault();
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  }

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

  const deleted = pet.deletedAt !== null;
  const age = petAgeText(pet.birthDate);
  /* THE MOCKUP'S SUBTITLE: "Milik <pemilik> · <ras> · <umur>". Breed falls back
     to the species, as it does there — a domestic cat with no breed filed still
     has something to say on this line. */
  const kind = label("breed", pet.breed) ?? label("species", pet.species);

  const editLink = `/dashboard/master/pets/${pet._id}/edit`;

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: "Pelanggan", href: "/dashboard/master/customers" },
          { label: "Hewan", href: "/dashboard/master/pets" },
          { label: pet.name },
        ]}
      />

      {/* ── THE HERO: who this is, and what to do about it ── */}
      <Card>
        <div className="flex flex-wrap items-start gap-5">
          {/* Decorative: the name it would announce is the `h1` beside it. */}
          <PetAvatar pet={pet} size="lg" />

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-foreground">
              {pet.name}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Milik{" "}
              {ownerName ? (
                <Link
                  href={`/dashboard/master/customers/${pet.customerId}`}
                  className="font-semibold text-primary underline-offset-2 hover:underline"
                >
                  {ownerName}
                </Link>
              ) : (
                "…"
              )}
              {[kind, age].filter(Boolean).map((part) => ` · ${part}`)}
            </p>

            {/*
              THE STATUS ALONE, where the mockup's chip row also carries the
              handling tags. `PetSummaryCard` draws those two rows below this
              card, so putting them here as well would print the same words
              twice within a hundred pixels — the mockup has no summary card to
              collide with. The Info tab's `Tag` row is the third and last place
              they appear, and that one is the record rather than a heading.
            */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <PetStatusBadge isActive={pet.isActive} deleted={deleted} />
            </div>
          </div>

          <div className="flex flex-none flex-wrap gap-2">
            {/*
              CETAK IS UNGATED beyond the `pets:read` this page already required.
              The card is for the groomer holding the dog, and a grant that kept
              it from them would keep the allergy off the cage door.
            */}
            <Button asChild variant="secondary" size="sm">
              <Link href={`/dashboard/master/pets/${pet._id}/print`}>
                <Printer className="size-4" />
                Cetak kartu
              </Link>
            </Button>

            <Can feature="pets" action="update">
              <Button asChild size="sm">
                <Link href={editLink}>
                  <Pencil className="size-4" />
                  Ubah
                </Link>
              </Button>
            </Can>
          </div>
        </div>
      </Card>

      {deleted && (
        <Alert variant="info">
          Hewan ini sudah dihapus. Datanya masih lengkap dan bisa dipulihkan dari
          daftar Hewan.
        </Alert>
      )}

      {/*
        THE SAME CARD THE BOOKING FORM SHOWS, on purpose. One component means one
        answer to "what does the shop know about this animal" — a second
        rendering here would eventually disagree with the one a groomer actually
        reads. It sits ABOVE the tabs, on every one of them: an allergy that is
        only visible on the right tab is an allergy nobody reads on a Saturday.
      */}
      <PetSummaryCard pet={pet} />

      {/*
        MEMBERSHIP SITS ABOVE THE TABS, beside the summary card, for the reason
        that card does: it answers "what has this animal already been promised",
        and a front desk asking it is not going to hunt for the right tab first.
        It is also the panel with a BUTTON on it — Terbitkan, Perpanjang — and a
        control hidden behind a tab is a control nobody finds.
      */}
      <PetMembershipPanel petId={pet._id} petName={pet.name} />

      <div
        role="tablist"
        aria-label="Bagian profil hewan"
        className="flex gap-1 overflow-x-auto border-b border-border"
      >
        {TABS.map((entry) => {
          const selected = entry.id === tab;

          return (
            <button
              key={entry.id}
              ref={(node) => {
                tabRefs.current[entry.id] = node;
              }}
              type="button"
              role="tab"
              id={`pet-profile-tab-${entry.id}`}
              aria-selected={selected}
              aria-controls={`pet-profile-panel-${entry.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(entry.id)}
              onKeyDown={onTabKey}
              className={cn(
                "-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`pet-profile-panel-${tab}`}
        aria-labelledby={`pet-profile-tab-${tab}`}
      >
        {tab === "info" && (
          <Card
            title="Identitas"
            /* THE HEADER'S OWN `Ubah`, as the mockup's `.sec-h .edit`. The hero
               carries one too; this is the one that is beside the fields it
               changes, which is what somebody reading a wrong value reaches
               for. */
            action={
              <Can feature="pets" action="update">
                <Button asChild variant="secondary" size="sm">
                  <Link href={editLink}>Ubah</Link>
                </Button>
              </Can>
            }
          >
            <PetInfoTab pet={pet} ownerName={ownerName} />
          </Card>
        )}

        {tab === "riwayat" && (
          <Card title="Riwayat" description={`Transaksi tercatat untuk ${pet.name}`}>
            <PetTimelineTab petId={pet._id} />
          </Card>
        )}

        {tab === "preferensi" && (
          <Card
            title="Preferensi & penanganan"
            description="Muncul otomatis di form booking dan layar kasir."
          >
            <PetPreferencesTab pet={pet} onSaved={setPet} />
          </Card>
        )}

        {tab === "medis" && (
          <Card title={`Catatan medis ${pet.name}`}>
            <PetMedicalTab pet={pet} onSaved={setPet} />
          </Card>
        )}
      </div>
    </div>
  );
}
