"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, Card, ConfirmDialog, Spinner, TextField } from "@/components";
import { Can, usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { openingBalanceService } from "@/services/openingBalance.service";
import type { CashBankOpening } from "@/types/accounting";
import { formatMoney, sumDecimals } from "@/utils/decimal";

import { useCashBankOpening } from "../hooks/useCashBankOpening";
import { SettingsPageHeader } from "./SettingsHeader";

/**
 * Pengaturan › Data awal › Saldo awal kas & bank.
 *
 * ONE DATE AND ONE NUMBER PER ACCOUNT. The tenant says on which day Buloo starts
 * keeping the books and what each cash and bank account held at that moment; the
 * server turns that into a single journal entry (Dr each account / Cr Modal
 * Disetor) dated the day before, so a report starting on the start date finds the
 * money in its Saldo Awal column.
 *
 * SAVING AGAIN REPLACES, it does not add. A posted entry is never edited, so the
 * server reverses the old one and posts a new one — which is why changing a saved
 * balance asks for a confirmation that says so.
 *
 * THE FIRST TRANSACTION BOUNDS THE DATE. The books open before their first entry;
 * when something is already recorded, the start date may not be later than it.
 * `max` on the date input states it, and the server enforces it.
 *
 * PER TENANT, and the entry lives on one branch (the session's, else the first
 * active) because every journal entry needs one. The page says so rather than
 * letting a per-branch Kas & Bank view surprise anybody.
 */

/** Digits and at most one dot; the server owns the real validation. */
function cleanAmount(raw: string): string {
  const stripped = raw.replace(/[^\d.]/g, "");
  const [whole, ...rest] = stripped.split(".");
  return rest.length > 0 ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

/** "1500000.0000" → "1500000"; zero → "". What the input shows. */
function toInput(amount: string): string {
  const trimmed = amount.replace(/\.?0+$/, "");
  return trimmed === "0" || trimmed === "" ? "" : trimmed;
}

const isoToday = () => new Date().toLocaleDateString("sv-SE");

export function CashBankOpeningScreen() {
  const { can } = usePermissions();
  const mayEdit = can("openingBalances", "update");

  const { opening, loading, error, refetch } = useCashBankOpening(
    can("openingBalances", "read"),
  );

  const [startDate, setStartDate] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Seeded once per load of the server's answer; edits live in state after that.
  useEffect(() => {
    if (!opening) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStartDate(opening.startDate ?? "");
    setAmounts(
      Object.fromEntries(opening.accounts.map((a) => [a.id, toInput(a.amount)])),
    );
  }, [opening]);

  const total = useMemo(
    () => sumDecimals(Object.values(amounts).map((v) => v || "0")),
    [amounts],
  );

  const saved = opening?.entry != null;
  const maxDate = useMemo(() => {
    const today = isoToday();
    const first = opening?.firstEntryDate;
    return first && first < today ? first : today;
  }, [opening]);

  const dateError =
    startDate && startDate > maxDate
      ? opening?.firstEntryDate && startDate > opening.firstEntryDate
        ? `Sudah ada transaksi pada ${opening.firstEntryDate}. Pilih tanggal yang sama atau sebelumnya.`
        : "Tanggal mulai tidak boleh di masa depan."
      : undefined;

  const filled = Object.values(amounts).some((v) => v !== "" && Number(v) > 0);
  const canSubmit = !saving && !!startDate && !dateError && filled;

  async function persist() {
    if (!opening) return;
    setSaving(true);
    setSaveError(null);

    try {
      await openingBalanceService.saveCashBank({
        startDate,
        lines: opening.accounts.map((account) => ({
          accountId: account.id,
          amount: amounts[account.id] || "0",
        })),
      });
      setConfirming(false);
      swalToast("Saldo awal kas & bank tersimpan.");
      refetch();
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.fullMessage : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    if (saved) setConfirming(true);
    else void persist();
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsPageHeader
        tab="sistem"
        title="Saldo awal kas & bank"
        description="Berapa isi tiap akun kas dan bank pada hari Buloo mulai mencatat. Dicatat satu kali, untuk seluruh usaha."
      />

      {error && (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="error">{error}</Alert>
          <Button variant="secondary" onClick={refetch}>
            Coba lagi
          </Button>
        </div>
      )}

      {loading && !opening && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat akun kas dan bank…
        </div>
      )}

      {opening && opening.accounts.length === 0 && (
        <Alert variant="info">
          Belum ada akun Kas & Bank yang aktif. Tambahkan dulu di Daftar Akun.
        </Alert>
      )}

      {opening && opening.accounts.length > 0 && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          <Card
            title="Tanggal mulai"
            description="Hari pertama Buloo mencatat. Saldo di bawah adalah isi akun pada awal hari itu."
          >
            <div className="max-w-xs">
              <TextField
                label="Tanggal mulai"
                name="opening-start"
                type="date"
                value={startDate}
                max={maxDate}
                required
                disabled={saving || !mayEdit}
                error={dateError}
                hint={
                  opening.firstEntryDate
                    ? `Transaksi pertama di Buloo: ${opening.firstEntryDate}.`
                    : undefined
                }
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
          </Card>

          <Card
            title="Saldo per akun"
            description="Kosongkan akun yang saldonya nol."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {opening.accounts.map((account) => (
                <TextField
                  key={account.id}
                  label={`${account.code} · ${account.name} (Rp)`}
                  name={`opening-${account.id}`}
                  inputMode="decimal"
                  placeholder="0"
                  value={amounts[account.id] ?? ""}
                  disabled={saving || !mayEdit}
                  onChange={(event) =>
                    setAmounts((prev) => ({
                      ...prev,
                      [account.id]: cleanAmount(event.target.value),
                    }))
                  }
                />
              ))}
            </div>

            <div className="mt-5 flex items-baseline justify-between border-t border-border pt-4">
              <span className="text-sm font-semibold text-foreground">Total</span>
              <span className="text-lg font-extrabold tabular-nums text-foreground">
                {formatMoney(total)}
              </span>
            </div>
          </Card>

          <Alert variant="info">
            Selisihnya dicatat sebagai Modal Disetor (3101), jadi tidak masuk
            Laba Rugi. Seluruh saldo awal dicatat di satu cabang, sehingga di
            tampilan Kas & Bank per cabang angkanya muncul di cabang itu.
          </Alert>

          {saveError && <Alert variant="error">{saveError}</Alert>}

          <Can feature="openingBalances" action="update">
            <div className="flex justify-end">
              <Button type="submit" disabled={!canSubmit}>
                {saving ? "Menyimpan…" : saved ? "Ubah saldo awal" : "Simpan saldo awal"}
              </Button>
            </div>
          </Can>
        </form>
      )}

      {confirming && (
        <ConfirmDialog
          title="Ubah saldo awal?"
          confirmLabel="Ubah saldo awal"
          busy={saving}
          error={saveError}
          onConfirm={() => void persist()}
          onCancel={() => {
            setConfirming(false);
            setSaveError(null);
          }}
        >
          Catatan saldo awal yang lama dibatalkan, lalu dicatat ulang dengan
          angka ini. Saldo kas, bank, Arus Kas, dan Neraca ikut berubah.
        </ConfirmDialog>
      )}
    </div>
  );
}

export type { CashBankOpening };
