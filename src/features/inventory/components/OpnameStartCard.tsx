"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button } from "@/components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError } from "@/services/api-error";
import { stockOpnameService } from "@/services/stockOpname.service";
import type { Category, StockWarehouse } from "@/types/inventory";

/** Radix Select forbids an empty item value, so "no category" needs a sentinel. */
const ALL_CATEGORIES = "all";

/**
 * Opening a count sheet: a warehouse, optionally one category, and a button.
 *
 * THE SHEET IS FILLED IN BY THE SERVER. Nothing is picked here beyond the scope
 * — the API populates every active stock-tracking product at that warehouse,
 * each line pre-filled with the quantity the system expects. That is what a
 * stock take is: you count the shelves, you do not curate a list first.
 *
 * THE CATEGORY IS A SCOPE, NOT A FILTER ON A LIST. It decides which products go
 * ON the sheet, permanently, and it is also the answer when a warehouse has more
 * countable products than one sheet may carry — the API refuses that outright
 * and names this control as the way out. Counting a warehouse in
 * category-sized passes is also how it is physically done.
 *
 * ACTIVE WAREHOUSES ONLY. The API refuses a count at an inactive location, so
 * offering one would produce a rejection after the user had already chosen. The
 * list's own filter beside this DOES include them — reading the history of a
 * closed warehouse is a different question from counting it.
 */
export function OpnameStartCard({
  warehouses,
  categories,
  onStarted,
}: {
  warehouses: StockWarehouse[];
  categories: Category[];
  /** Lets the screen re-read the list when a sheet is opened but not navigated to. */
  onStarted?: () => void;
}) {
  const router = useRouter();

  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = warehouses.filter((warehouse) => warehouse.isActive);

  useEffect(() => {
    if (warehouseId || active.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWarehouseId(active[0]._id);
  }, [active, warehouseId]);

  async function handleStart() {
    if (!warehouseId) return;

    setStarting(true);
    setError(null);

    try {
      const opname = await stockOpnameService.create({
        warehouseId,
        categoryFilter:
          categoryId === ALL_CATEGORIES ? undefined : categoryId,
      });

      onStarted?.();
      router.push(`/dashboard/inventory/opname/${opname._id}`);
    } catch (caught) {
      /**
       * `fullMessage` carries the actionable half of the 409 — "Opname
       * OPN-2026-0007 is still a draft; submit or delete it before starting
       * another". Without it the user is told they cannot start a count and not
       * which sheet is in the way.
       */
      setError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Opname gagal dibuka. Coba lagi.",
      );
      setStarting(false);
    }
  }

  if (active.length === 0) {
    return (
      <Alert variant="info">
        Belum ada gudang aktif. Aktifkan atau buat gudang dulu sebelum menghitung
        stok fisik.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="min-w-56 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            Mulai hitung fisik
          </p>
          <p className="mt-1 text-sm text-muted">
            Lembar akan diisi otomatis dengan seluruh produk yang menyimpan stok
            di gudang ini, lengkap dengan angka yang dicatat sistem. Anda tinggal
            mengisi jumlah yang benar-benar ada di rak.
          </p>
        </div>

        <div>
          <label
            htmlFor="opname-start-warehouse"
            className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-muted"
          >
            Gudang
          </label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger id="opname-start-warehouse" className="w-52">
              <SelectValue placeholder="Pilih gudang" />
            </SelectTrigger>
            <SelectContent>
              {active.map((warehouse) => (
                <SelectItem key={warehouse._id} value={warehouse._id}>
                  {warehouse.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label
            htmlFor="opname-start-category"
            className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-muted"
          >
            Kategori (opsional)
          </label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="opname-start-category" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>Semua kategori</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category._id} value={category._id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleStart} disabled={starting || !warehouseId}>
          {starting ? "Menyiapkan…" : "+ Mulai opname"}
        </Button>
      </div>

      <p className="text-xs text-muted">
        Satu gudang hanya boleh punya <b>satu draft</b> sekaligus. Dua lembar
        untuk gudang yang sama akan menghitung selisih yang sudah dikoreksi
        lembar pertama — dan mencatatnya dua kali.
      </p>
    </div>
  );
}
