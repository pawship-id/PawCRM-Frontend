"use client";

import { useEffect, useState } from "react";

import {
  Alert,
  Button,
  Card,
  SelectField,
  Spinner,
  TextField,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Can, usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { tenantService } from "@/services/tenant.service";
import type {
  DocumentNumberOverride,
  DocumentNumberReset,
  DocumentNumberSeries,
} from "@/types/api";

import { previewNumber, RESET_LABELS, seriesLabel } from "../numbering";
import { SettingsPageHeader } from "./SettingsHeader";

/**
 * Pengaturan › Nomor dokumen — the shape of every number this shop issues
 * (23 September 2026, the mockup's fourth "Data master & preferensi" card).
 *
 * THE SHAPES COME FROM THE SERVER and the form sends back only what differs.
 * `GET /tenants/me/numbering` merges the registry's defaults with this tenant's
 * overrides, so a series added on the server appears here with a sensible
 * default and no release of this file.
 *
 * IT CHANGES THE NEXT NUMBER, NEVER AN OLD ONE, and the page says so where
 * somebody is about to press Simpan. Numbers already issued are strings on the
 * documents that carry them; nothing re-derives one.
 *
 * SOME SERIES ARE NOT A TENANT'S TO RESHAPE, and they are drawn rather than
 * hidden — a page that showed eight of sixteen series would send somebody
 * hunting for the ninth. BKM/BKK/BBM/BBK are the convention Indonesian
 * bookkeeping reads kas-vs-bank by; the till's own series are quoted by nobody
 * outside it.
 *
 * THE SEPARATOR AND THE BRANCH SEGMENT ARE NOT OFFERED. `INV/CBS/2609/0001`
 * parses as four segments across this codebase, and a tenant swapping "/" for
 * "-" would change what half the screens read by eye.
 */

/** One row's editable state, as the boxes hold it. */
interface Draft {
  prefix: string;
  reset: DocumentNumberReset;
  padding: string;
}

const RESET_OPTIONS = (Object.keys(RESET_LABELS) as DocumentNumberReset[]).map(
  (value) => ({ value, label: RESET_LABELS[value] }),
);

export function NumberingSettingsScreen() {
  const { can } = usePermissions();
  const mayEdit = can("tenants", "update");

  const [series, setSeries] = useState<DocumentNumberSeries[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;

    // The sanctioned fetch-effect shape (see useTenant).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);

    tenantService
      .numbering()
      .then((rows) => {
        if (!active) return;
        setSeries(rows);
        setDrafts(
          Object.fromEntries(rows.map((row) => [row.key, toDraft(row)])),
        );
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.fullMessage
            : "Pengaturan nomor dokumen tidak bisa dimuat.",
        );
      });

    return () => {
      active = false;
    };
  }, [nonce]);

  function patch(key: string, change: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...change } }));
  }

  const editable = series?.filter((row) => row.editable) ?? [];
  const fixed = series?.filter((row) => !row.editable) ?? [];

  const invalid = editable.filter((row) => draftError(drafts[row.key]));
  const changed = editable.some((row) => isChanged(row, drafts[row.key]));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!changed || invalid.length > 0) return;

    setSaving(true);

    try {
      /*
        SENT WHOLE. The server flattens `settings` one level, so
        `settings.numbering` is replaced as a unit — a map carrying only the row
        somebody just touched would silently reset every other series to ours.
      */
      const numbering: Record<string, DocumentNumberOverride> = {};
      for (const row of editable) {
        const override = toOverride(row, drafts[row.key]);
        if (override) numbering[row.key] = override;
      }

      await tenantService.updateSettings({ numbering });
      setSaving(false);
      setNonce((n) => n + 1);
      swalToast("Format nomor dokumen tersimpan.");
    } catch (err) {
      swalToast(
        err instanceof ApiError ? err.message : "Terjadi kesalahan. Coba lagi.",
        "error",
        8000,
      );
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsPageHeader
        tab="umum"
        title="Nomor dokumen"
        description="Format dan nomor urut berikutnya. Dokumen yang sudah terbit tidak ikut berubah."
      />

      {error && (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="error">{error}</Alert>
          <Button variant="secondary" onClick={() => setNonce((n) => n + 1)}>
            Coba lagi
          </Button>
        </div>
      )}

      {!series && !error && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat format nomor…
        </div>
      )}

      {series && (
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-6"
        >
          {editable.map((row) => (
            <SeriesCard
              key={row.key}
              series={row}
              draft={drafts[row.key]}
              onChange={(change) => patch(row.key, change)}
              disabled={saving || !mayEdit}
            />
          ))}

          <Can feature="tenants" action="update">
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={saving || !changed || invalid.length > 0}
              >
                {saving ? "Menyimpan…" : "Simpan format nomor"}
              </Button>
            </div>
          </Can>

          <Card
            title="Diatur sistem"
            description="Bentuknya tetap: BKM/BKK/BBM/BBK adalah penanda kas dan bank yang dibaca pembukuan, dan sisanya tidak pernah dikutip di luar kasir."
          >
            <ul className="divide-y divide-border">
              {fixed.map((row) => (
                <li
                  key={row.key}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-sm"
                >
                  <span className="font-semibold text-foreground">
                    {seriesLabel(row.key).label}
                  </span>
                  <span className="tabular-nums text-muted">{row.example}</span>
                </li>
              ))}
            </ul>
          </Card>
        </form>
      )}
    </div>
  );
}

function SeriesCard({
  series,
  draft,
  onChange,
  disabled,
}: {
  series: DocumentNumberSeries;
  draft: Draft;
  onChange: (change: Partial<Draft>) => void;
  disabled: boolean;
}) {
  const { label, hint } = seriesLabel(series.key);
  const error = draftError(draft);
  const padding = Number(draft.padding);

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {label}
          {series.overridden && <Badge variant="outline">Diubah</Badge>}
        </span>
      }
      description={hint}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TextField
          label="Awalan"
          name={`${series.key}-prefix`}
          value={draft.prefix}
          onChange={(event) =>
            onChange({ prefix: event.target.value.toUpperCase() })
          }
          error={error?.field === "prefix" ? error.message : undefined}
          maxLength={6}
          hint="Huruf dan angka, maksimal 6 karakter."
          disabled={disabled}
        />

        <SelectField
          label="Nomor mengulang"
          value={draft.reset}
          onChange={(reset) =>
            onChange({ reset: reset as DocumentNumberReset })
          }
          options={RESET_OPTIONS}
          hint="Periode ikut ditulis di nomornya, jadi nomor lama tidak akan kembar."
          disabled={disabled}
        />

        <TextField
          label="Jumlah digit"
          name={`${series.key}-padding`}
          type="number"
          min={1}
          max={8}
          value={draft.padding}
          onChange={(event) => onChange({ padding: event.target.value })}
          error={error?.field === "padding" ? error.message : undefined}
          hint="Nomor yang melewati batas digit tetap ditulis utuh."
          disabled={disabled}
        />
      </div>

      <p className="mt-4 text-sm text-muted">
        Contoh nomor:{" "}
        <span className="font-semibold tabular-nums text-foreground">
          {error
            ? "—"
            : previewNumber(series, {
                prefix: draft.prefix,
                reset: draft.reset,
                padding,
              })}
        </span>
      </p>
    </Card>
  );
}

function toDraft(series: DocumentNumberSeries): Draft {
  return {
    prefix: series.prefix,
    reset: series.reset,
    padding: String(series.padding),
  };
}

/** Which box is wrong, and why — mirroring what the server would refuse. */
function draftError(
  draft: Draft | undefined,
): { field: "prefix" | "padding"; message: string } | null {
  if (!draft) return null;

  if (draft.prefix.trim() === "") {
    return { field: "prefix", message: "Isi awalannya" };
  }
  if (!/^[A-Z0-9]{1,6}$/.test(draft.prefix)) {
    return { field: "prefix", message: "Huruf dan angka saja, maksimal 6" };
  }

  const padding = Number(draft.padding);
  if (!Number.isInteger(padding) || padding < 1 || padding > 8) {
    return { field: "padding", message: "Antara 1 dan 8" };
  }

  return null;
}

function isChanged(series: DocumentNumberSeries, draft: Draft | undefined) {
  if (!draft) return false;

  return (
    draft.prefix !== series.prefix ||
    draft.reset !== series.reset ||
    Number(draft.padding) !== series.padding
  );
}

/**
 * What to store for one series — the fields that differ from what the server
 * would use anyway, and `null` when nothing does.
 *
 * ONLY THE DIFFERENCES, so a tenant that never touched a series keeps following
 * the registry: storing today's default as an override would freeze it, and a
 * shop that agreed with us once would stop agreeing the day the default moved.
 *
 * MEASURED AGAINST `defaults`, NEVER AGAINST THE MERGED SHAPE. The merged shape
 * already includes this tenant's overrides, so comparing against it would find
 * no differences the second time somebody pressed Simpan — and the save would
 * quietly drop every override the shop had set.
 */
function toOverride(
  series: DocumentNumberSeries,
  draft: Draft | undefined,
): DocumentNumberOverride | null {
  if (!draft) return null;

  const { defaults } = series;
  const override: DocumentNumberOverride = {};
  if (draft.prefix !== defaults.prefix) override.prefix = draft.prefix;
  if (draft.reset !== defaults.reset) override.reset = draft.reset;
  if (Number(draft.padding) !== defaults.padding) {
    override.padding = Number(draft.padding);
  }

  return Object.keys(override).length > 0 ? override : null;
}
