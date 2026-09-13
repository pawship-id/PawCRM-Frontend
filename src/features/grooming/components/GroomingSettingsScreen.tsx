"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/features/permissions";
import { cn } from "@/lib/utils";

import { useGroomingSettings } from "../hooks/useGroomingSettings";
import { draftToSettings } from "../settings";
import {
  GroomingCapacitySettings,
  GroomingTeamLoadPanel,
} from "./GroomingCapacitySettings";
import {
  GroomingCommissionExample,
  GroomingCommissionSettings,
} from "./GroomingCommissionSettings";
import { GroomingModuleHeader } from "./GroomingModuleHeader";
import { GroomingSharedSettingsCard } from "./GroomingSharedSettingsCard";

type SettingsTab = "komisi" | "kapasitas";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "komisi", label: "Komisi" },
  { id: "kapasitas", label: "Kapasitas" },
];

const TAB_WORDS: Record<SettingsTab, string> = {
  komisi: "Komisi",
  kapasitas: "Kapasitas",
};

function tabOfError(key: string): SettingsTab {
  return key.startsWith("capacity.") || key.startsWith("override.")
    ? "kapasitas"
    : "komisi";
}

/**
 * Layanan › Grooming › Pengaturan — commission and daily capacity, from the
 * mockup, on the rule the shop settled on 13 September 2026.
 *
 * ─── KOMISI | KAPASITAS IS STATE, NOT A ROUTE ──────────────────────────────
 *
 * The module's own tabs are routes (see `GroomingModuleHeader`), and these two
 * are not, on purpose: they are one draft saved by one button. As two routes,
 * changing the commission and then opening Kapasitas would unmount the form and
 * lose the change — or the draft would have to live in a layout above both,
 * which is a second place for the same state. So it is a tablist inside the
 * page, drawn like `PageTabs` so it still reads as sections of one thing.
 *
 * ─── WHO MAY DO WHAT ───────────────────────────────────────────────────────
 *
 * The page is `tenants:read`. Saving is `tenants:update`. A groomer's own
 * number is written to the user, so changing it additionally needs
 * `users:update` — those boxes say so rather than failing on save.
 */
export function GroomingSettingsScreen() {
  const { can } = usePermissions();
  const mayUpdate = can("tenants", "update");
  const mayEditOverrides = mayUpdate && can("users", "update");
  const mayOpenCatalog = can("services", "read");

  const state = useGroomingSettings();
  const [tab, setTab] = useState<SettingsTab>("komisi");
  const tabRefs = useRef<Record<SettingsTab, HTMLButtonElement | null>>({
    komisi: null,
    kapasitas: null,
  });

  const errorTabs = TABS.filter((entry) =>
    Object.keys(state.errors).some((key) => tabOfError(key) === entry.id),
  );
  const invalid = errorTabs.length > 0;

  /*
    SAID BESIDE THE BUTTON, AND IT NAMES THE TAB. A box that went wrong on
    Kapasitas is invisible from Komisi, and a greyed Simpan with no reason is the
    commonest dead end in this app.
  */
  const blockedReason =
    state.dirty && invalid
      ? `isian di tab ${errorTabs.map((entry) => TAB_WORDS[entry.id]).join(" dan ")} belum benar`
      : null;

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

  const { draft, settings } = state;

  const header = (
    <GroomingModuleHeader
      action={
        draft && mayUpdate ? (
          <>
            {blockedReason && (
              <p className="max-w-xs self-center text-xs text-muted">
                Belum bisa disimpan:{" "}
                <b className="font-semibold">{blockedReason}</b>
              </p>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={!state.dirty || state.saving}
              onClick={state.discard}
            >
              Batalkan perubahan
            </Button>
            <Button
              type="button"
              disabled={!state.dirty || invalid || state.saving}
              onClick={() => void state.save()}
            >
              {state.saving && <Spinner size={16} />}
              {state.saving ? "Menyimpan…" : "Simpan pengaturan"}
            </Button>
          </>
        ) : undefined
      }
    />
  );

  if (state.loadError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Alert variant="error">{state.loadError}</Alert>
        <div>
          <Button type="button" variant="secondary" onClick={state.retry}>
            Muat ulang
          </Button>
        </div>
      </div>
    );
  }

  if (state.loading || !draft || !settings) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat pengaturan grooming…
        </div>
      </div>
    );
  }

  const disabled = !mayUpdate || state.saving;

  return (
    <div className="flex flex-col gap-6">
      {header}

      {!mayUpdate && (
        <Alert variant="info">
          Role Anda hanya bisa melihat pengaturan ini. Mengubahnya perlu izin
          ubah data usaha.
        </Alert>
      )}
      {state.saveError && <Alert variant="error">{state.saveError}</Alert>}

      <div
        role="tablist"
        aria-label="Bagian pengaturan grooming"
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
              id={`grooming-settings-tab-${entry.id}`}
              aria-selected={selected}
              aria-controls={`grooming-settings-panel-${entry.id}`}
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
        id={`grooming-settings-panel-${tab}`}
        aria-labelledby={`grooming-settings-tab-${tab}`}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start"
      >
        <div className="min-w-0">
          {tab === "komisi" ? (
            <GroomingCommissionSettings
              draft={draft}
              errors={state.errors}
              update={state.update}
              disabled={disabled}
              mayOpenCatalog={mayOpenCatalog}
            />
          ) : (
            <GroomingCapacitySettings
              draft={draft}
              errors={state.errors}
              update={state.update}
              disabled={disabled}
              mayEditOverrides={mayEditOverrides}
              capacity={state.capacity}
              capacityError={state.capacityError}
              mayReadBookings={state.mayReadBookings}
            />
          )}
        </div>

        <aside className="lg:sticky lg:top-20">
          {tab === "komisi" ? (
            <GroomingCommissionExample
              settings={draftToSettings(draft, settings)}
            />
          ) : (
            <GroomingTeamLoadPanel
              draft={draft}
              capacity={state.capacity}
              capacityError={state.capacityError}
              mayReadBookings={state.mayReadBookings}
            />
          )}
        </aside>
      </div>

      <GroomingSharedSettingsCard mayOpenCatalog={mayOpenCatalog} />
    </div>
  );
}
