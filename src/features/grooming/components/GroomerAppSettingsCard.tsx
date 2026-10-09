"use client";

import { Alert, Button, Card, Spinner } from "@/components";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/features/permissions";

import { useGroomerAppSettings } from "../hooks/useGroomerAppSettings";

/**
 * Layanan › Grooming › Pengaturan › Aplikasi groomer — what a groomer's phone
 * may show and do. Two switches, for the WHOLE business (all branches), both off
 * until a manager turns them on.
 *
 * ─── WHY IT IS A CARD OF ITS OWN, WITH ITS OWN BUTTON ───────────────────────
 * The tabs above are one draft saved by one button, and these live under a
 * different key on the server. A switch that waited on a commission box being
 * valid would be a strange thing to explain. See `useGroomerAppSettings`.
 *
 * ─── THE SERVER IS THE RULE ────────────────────────────────────────────────
 * Turning "open job" off hides the tab AND makes the server refuse a claim;
 * turning commission off makes the server refuse the summary. Nothing here only
 * hides.
 */
export function GroomerAppSettingsCard() {
  const { can } = usePermissions();
  const mayUpdate = can("tenants", "update");
  const state = useGroomerAppSettings();
  const { draft } = state;

  return (
    <Card
      title="Aplikasi groomer"
      description="Yang boleh dilihat dan dilakukan groomer di ponselnya. Berlaku untuk semua cabang."
      action={
        mayUpdate && state.dirty ? (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={state.discard} disabled={state.saving}>
              Batalkan
            </Button>
            <Button onClick={() => void state.save()} loading={state.saving}>
              Simpan
            </Button>
          </div>
        ) : undefined
      }
    >
      {state.loadError ? (
        <div className="space-y-3">
          <Alert variant="error">{state.loadError}</Alert>
          <Button variant="secondary" onClick={state.retry}>
            Muat ulang
          </Button>
        </div>
      ) : state.loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted">
          <Spinner /> Memuat…
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {state.saveError && <Alert variant="error">{state.saveError}</Alert>}
          {!mayUpdate && (
            <Alert variant="info">
              Role Anda hanya bisa melihat pengaturan ini. Mengubahnya perlu izin ubah data usaha.
            </Alert>
          )}

          <SwitchRow
            id="groomer-app-open-job"
            label="Groomer boleh mengambil open job"
            hint="Sesi yang belum ada groomernya muncul di tab Open Job, dan groomer bisa mengambilnya sendiri. Kalau dimatikan, semua penugasan lewat admin dan tab Open Job hilang."
            checked={draft.allowOpenJobClaim}
            disabled={!mayUpdate || state.saving}
            onChange={(checked) => state.setDraft({ ...draft, allowOpenJobClaim: checked })}
          />
          <SwitchRow
            id="groomer-app-commission"
            label="Groomer boleh melihat komisinya sendiri"
            hint="Ringkasan komisi bulan ini muncul di tab Selesai. Hanya komisi milik sendiri, tidak pernah milik groomer lain. Kalau dimatikan, tab Selesai hanya menampilkan jumlah hewan dan sesi."
            checked={draft.showOwnCommission}
            disabled={!mayUpdate || state.saving}
            onChange={(checked) => state.setDraft({ ...draft, showOwnCommission: checked })}
          />
        </div>
      )}
    </Card>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        aria-describedby={`${id}-hint`}
        className="mt-1"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-semibold">
          {label}{" "}
          <span className="font-normal text-muted">({checked ? "menyala" : "mati"})</span>
        </label>
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      </div>
    </div>
  );
}
