"use client";

import { useEffect, useState } from "react";

import { Alert, Card, TextField } from "@/components";
import { FilterSelect } from "@/components";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/services/api-error";
import { posService } from "@/services/pos.service";
import { useAuth } from "@/features/auth";
import { warehouseService } from "@/services/warehouse.service";

/** Digits only — the same rule the service catalogue's price box uses. */
const WHOLE_RUPIAH = /^\d+$/;

/** The API's page cap. Asking for more is a 400, not a bigger page. */
const FETCH_LIMIT = 100;

/**
 * Buka Kasir — the screen that stands in front of the till (FR-9).
 *
 * THE WHOLE POS IS LOCKED UNTIL THIS PASSES, and that is not a UI choice: a sale
 * with no shift has no drawer to be counted against, so the Z-Report at the end
 * of the day would be short by exactly the transactions nobody attached to
 * anything.
 *
 * TWO FIELDS AND NO MORE. The warehouse decides which shelves the day's sales
 * come off; the opening float is what every later figure is measured from. The
 * cashier is whoever is signed in — a shift opened in somebody else's name is a
 * cash variance assigned to somebody else, and the API refuses to take one from
 * the payload at all.
 *
 * ZERO IS A VALID FLOAT. A till that starts empty is a real arrangement; what is
 * not allowed is leaving it unsaid.
 */
export function PosShiftGate({ onOpened }: { onOpened: () => void }) {
  // The branch chosen at the gate before this one. The shift is bound to it, so
  // it also decides which shelves may be offered — see the effect.
  const branchId = useAuth().session?.currentBranchId ?? null;

  const [warehouses, setWarehouses] = useState<
    { value: string; label: string }[]
  >([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [openingCash, setOpeningCash] = useState("");

  const [warehouseError, setWarehouseError] = useState<string | null>(null);
  const [cashError, setCashError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    warehouseService
      .list({ isActive: true, limit: FETCH_LIMIT })
      .then((result) => {
        if (!active) return;
        /*
          ONLY SHELVES THIS BRANCH CAN SELL FROM.

          `defaultBranchId` is a soft link and is deliberately nullable — a
          central warehouse serving three branches belongs to none of them — so
          the rule is "does not name a DIFFERENT branch", not "names this one".
          The same rule posShift.service.js#assertWarehouse enforces, and THAT is
          the authority: this only keeps the picker from offering a choice the
          server will refuse.

          The failure it prevents is silent: a shift pairing Cabang A with
          Cabang B's warehouse books revenue to A while deducting stock from B,
          and nothing looks wrong until somebody counts a shelf.
        */
        const options = result.items
          .filter(
            (warehouse) =>
              !warehouse.defaultBranchId ||
              warehouse.defaultBranchId === branchId,
          )
          .map((warehouse) => ({
            value: warehouse._id,
            label: warehouse.name,
          }));
        setWarehouses(options);
        // One warehouse is the overwhelming case; pre-selecting it removes a
        // tap from the start of every shift.
        if (options.length === 1) {
          setWarehouseId(options[0].value);
        }
      })
      .catch(() => {
        if (!active) return;
        setWarehouseError("Daftar gudang tidak bisa dimuat. Coba muat ulang.");
      });

    return () => {
      active = false;
    };
  }, [branchId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const cash = openingCash.trim();
    let invalid = false;

    if (!warehouseId) {
      setWarehouseError("Pilih gudang yang jadi sumber stok kasir ini.");
      invalid = true;
    }
    if (cash === "") {
      setCashError("Isi saldo awal. Kalau laci kosong, isi 0.");
      invalid = true;
    } else if (!WHOLE_RUPIAH.test(cash)) {
      setCashError("Isi angka saja, tanpa titik atau koma. Contoh: 500000");
      invalid = true;
    }

    if (invalid) return;

    setSaving(true);
    setFormError(null);

    try {
      await posService.openShift({ warehouseId, openingCash: cash });
      onOpened();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Already open — almost always a second tab, and reloading is the fix.
        setFormError(
          error.reason ??
            "Kamu sudah punya shift terbuka. Muat ulang halaman untuk melanjutkannya.",
        );
      } else {
        setFormError(
          error instanceof ApiError
            ? (error.reason ?? error.message)
            : "Terjadi kesalahan. Coba lagi.",
        );
      }
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-10">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Buka Kasir</h1>
        <p className="mt-1 text-sm text-muted">
          Hitung isi laci dan masukkan saldo awalnya sebelum mulai melayani.
          Angka ini yang jadi dasar perhitungan selisih saat tutup kasir nanti.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <Card title="Mulai shift">
          <div className="flex flex-col gap-4">
            <FilterSelect
              layout="form"
              label="Gudang"
              ariaLabel="Pilih gudang"
              value={warehouseId}
              options={warehouses}
              onChange={(next) => {
                setWarehouseId(next);
                setWarehouseError(null);
              }}
              active={false}
              placeholder="Pilih gudang"
              searchable
              required
              disabled={saving}
              error={warehouseError ?? undefined}
            />

            <TextField
              label="Saldo awal (Rp)"
              name="openingCash"
              // `inputMode` rather than type=number: a number input in some
              // browsers silently reformats what was typed, and this value has
              // to reach the API exactly as entered.
              inputMode="numeric"
              value={openingCash}
              onChange={(event) => {
                setOpeningCash(event.target.value);
                setCashError(null);
              }}
              error={cashError ?? undefined}
              placeholder="500000"
              hint="Boleh 0 kalau laci mulai kosong."
              autoFocus
              disabled={saving}
              required
            />

            {formError && <Alert variant="error">{formError}</Alert>}

            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Membuka…" : "Buka Kasir & Mulai"}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
