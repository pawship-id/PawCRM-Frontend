"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert } from "@/components";
// The shadcn button rather than the app wrapper: `asChild` is what makes
// "continue the open draft" a real <Link> rather than a button that pushes.
import { Button } from "@/components/ui/button";
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

import { useOpenDraft } from "../hooks/useOpenDraft";

/** Radix Select forbids an empty item value, so "no category" needs a sentinel. */
const ALL_CATEGORIES = "all";

/**
 * The entry point to a count: a warehouse, optionally one category, and the
 * button that opens the sheet.
 *
 * IT OPENS AN EMPTY SHEET AND GOES STRAIGHT TO IT. Which products get counted is
 * decided ON the sheet — "load everything in this warehouse" or "pick these
 * six" are two buttons there, next to the lines they produce. An earlier version
 * asked that question on a page of its own before the sheet existed, which meant
 * a counter had to commit to a list before seeing a single row, and the same
 * decision then existed in two places once adding products mid-count became
 * possible.
 *
 * THE WAREHOUSE IS CHECKED BEFORE THE CLICK, not after. One warehouse may hold
 * one draft — two sheets for the same place would each count differences the
 * other had already corrected — and the API refuses the second with a 409. Doing
 * the read here turns that refusal into an offer: the button becomes a link to
 * the sheet already open, which is where that counter was going anyway.
 *
 * THE CATEGORY IS THE SHEET'S SCOPE, recorded on it and used later by "load
 * everything" — not a filter on anything visible here.
 *
 * ACTIVE WAREHOUSES ONLY. The API refuses a count at an inactive location, so
 * offering one would produce a rejection after the user had already chosen. The
 * list's own filter beside this DOES include them — reading the history of a
 * closed warehouse is a different question from counting it.
 */
export function OpnameStartCard({
  warehouses,
  categories,
}: {
  warehouses: StockWarehouse[];
  categories: Category[];
}) {
  const router = useRouter();

  const [warehouseId, setWarehouseId] = useState("");
  const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = warehouses.filter((warehouse) => warehouse.isActive);
  const { draft, checking } = useOpenDraft(warehouseId);

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
        /**
         * EMPTY, and that is not the same as omitting it: an absent `items` asks
         * the server for the whole catalogue. The sheet opens with no lines and
         * the counter fills it there — everything, or the shelves they mean to
         * walk to.
         */
        items: [],
      });

      router.push(`/dashboard/inventory/opname/${opname._id}`);
    } catch (caught) {
      /**
       * `fullMessage` carries the actionable half of the 409 — "Opname
       * OPN-2026-0007 is still a draft; submit or delete it before starting
       * another". The pre-check above catches the ordinary case, but somebody
       * else can open a draft between that read and this write.
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
          <p className="text-[10px] font-medium tracking-[0.14em] text-muted uppercase">
            Mulai hitung fisik
          </p>
          <p className="mt-1 text-sm text-muted">
            {draft ? (
              <>
                Gudang ini masih punya lembar yang belum selesai. Lanjutkan yang
                itu — satu gudang hanya boleh punya satu draft, karena lembar
                kedua akan menghitung selisih yang sudah dikoreksi lembar
                pertama.
              </>
            ) : (
              <>
                Lembar akan dibuka kosong. Produknya dipilih di lembar itu —
                muat semua isi gudang, atau pilih rak yang memang akan dihitung.
              </>
            )}
          </p>
        </div>

        <div>
          <label
            htmlFor="opname-start-warehouse"
            className="mb-1.5 block text-[10px] font-medium tracking-[0.14em] text-muted uppercase"
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
            className="mb-1.5 block text-[10px] font-medium tracking-[0.14em] text-muted uppercase"
          >
            Kategori (opsional)
          </label>
          <Select
            value={categoryId}
            onValueChange={setCategoryId}
            // Meaningless while a draft is in the way: the scope belongs to the
            // sheet being opened, and that sheet already exists with its own.
            disabled={Boolean(draft)}
          >
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

        {draft ? (
          <Button variant="secondary" asChild>
            <Link href={`/dashboard/inventory/opname/${draft._id}`}>
              Lanjutkan {draft.opnameNumber}
            </Link>
          </Button>
        ) : (
          <Button
            onClick={handleStart}
            disabled={starting || checking || !warehouseId}
          >
            {starting ? "Menyiapkan…" : "+ Mulai opname"}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted">
        Satu gudang hanya boleh punya <b>satu draft</b> sekaligus. Dua lembar
        untuk gudang yang sama akan menghitung selisih yang sudah dikoreksi
        lembar pertama — dan mencatatnya dua kali.
      </p>
    </div>
  );
}
