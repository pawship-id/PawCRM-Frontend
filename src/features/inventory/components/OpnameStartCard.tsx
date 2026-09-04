"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert, FilterSelect, namedOptions, withAll } from "@/components";
// The shadcn button rather than the app wrapper: `asChild` is what makes
// "continue the open draft" a real <Link> rather than a button that pushes.
import { Button } from "@/components/ui/button";
import { ApiError } from "@/services/api-error";
import { stockOpnameService } from "@/services/stockOpname.service";
import type { Category, StockWarehouse } from "@/types/inventory";

import { useOpenDraft } from "../hooks/useOpenDraft";
import { useBranchScope, warehousesForBranch } from "../hooks/useBranchScope";

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
  /**
   * WHERE, asked before WHICH SHELF — the order every hand-typed stock form now
   * asks its two scoping questions in. A counter knows which shop they are
   * walking; the warehouse list follows from it.
   */
  const [pickedBranch, setPickedBranch] = useState("");
  // "" is the repo's unset convention, and reachable now that this is a
  // FilterSelect: the `"all"` sentinel this used to carry existed only because
  // Radix Select forbids an empty item value.
  const [categoryId, setCategoryId] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope = useBranchScope();
  /**
   * ONE BRANCH IS NOT A CHOICE — a tenant with a single shop reaches the field
   * below without opening a dropdown that has one option in it. Derived rather
   * than written into state by an effect: an effect would render once with the
   * empty value and again with the real one, and the warehouse list in between
   * would be empty for no reason.
   */
  const branchId = pickedBranch || scope.soleBranch;
  const scopedWarehouses = warehousesForBranch(branchId, warehouses);
  const { draft, checking } = useOpenDraft(warehouseId);

  /*
    ONE WAREHOUSE IS NOT A CHOICE. Once a branch is named, a branch with exactly
    one warehouse fills it in — but nothing is preselected before that, because
    the list is empty and preselecting from an empty list is how a form ends up
    submitting a warehouse nobody saw.
  */
  useEffect(() => {
    if (warehouseId || scopedWarehouses.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWarehouseId(scopedWarehouses[0]._id);
  }, [scopedWarehouses, warehouseId]);

  async function handleStart() {
    if (!warehouseId) return;

    setStarting(true);
    setError(null);

    try {
      const opname = await stockOpnameService.create({
        warehouseId,
        // Omitted when the warehouse has no default and nothing was chosen: the
        // server then falls back to the session's branch, which this screen
        // cannot see and must not guess at.
        branchId: branchId || undefined,
        categoryFilter: categoryId || undefined,
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

  /*
    Asked of the WHOLE list rather than of the branch's slice: "this tenant has
    no active warehouse" is a setup problem with an instruction attached, while
    "this branch has none" is an ordinary state a different branch fixes.
  */
  if (warehouses.filter((warehouse) => warehouse.isActive).length === 0) {
    return (
      <Alert variant="info">
        Belum ada gudang aktif. Aktifkan atau buat gudang dulu sebelum
        menghitung stok fisik.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert variant="error">{error}</Alert>}

      {/*
        A COLUMN, not a row: the copy explains the choice the controls below it
        make, and beside them it was a paragraph competing for width with three
        controls that each need a fixed one. Reading it first is the point —
        "this warehouse already has an unfinished sheet" is the reason the
        button says Lanjutkan rather than Mulai.
      */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
        <div>
          {/* text-xs, not text-[10px]: §1 puts the floor at 13px and bans the
              latter outright. */}
          <p className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
            Mulai hitung fisik
          </p>
          {/* Capped: the paragraph now has the whole card to run across, and a
              line of prose 1400px wide is one the eye loses its place in. */}
          <p className="mt-1 max-w-3xl text-sm text-muted">
            {draft ? (
              <>
                Satu gudang hanya boleh punya <b>satu draft</b> sekaligus. Dua
                lembar untuk gudang yang sama akan menghitung selisih yang sudah
                dikoreksi lembar pertama dan mencatatnya dua kali. Gudang ini
                masih punya lembar yang belum selesai, lanjutkan draft
              </>
            ) : (
              <>
                Lembar akan dibuka kosong. Produknya dipilih di lembar itu —
                muat semua isi gudang, atau pilih rak yang memang akan dihitung.
              </>
            )}
          </p>
        </div>

        {/* The controls, on their own line. Each takes the full width on a
            phone and its own on anything wider — three 208px boxes side by side
            do not fit 320px, and half-width selects truncate the warehouse
            names they exist to show. */}
        <div className="flex flex-wrap items-end gap-3">
          {/*
            THE FILTER SHELL ON A FORM, which FilterTrigger is exported to
            allow. These two sit a few centimetres from the list's own filter
            panel and pick from the same two lists; a second select convention
            on the same screen is a second thing to recognise for no gain. The
            long option lists also get the popover's search for free, which
            Radix Select cannot do.

            `active={false}` on both: the trigger's navy state means "a filter
            is applied", and a warehouse that always has a value would wear it
            permanently.
          */}
          {/* LOCATION FIRST. The warehouse list is whatever this branch may
              count at — its own, plus the shared central one.

              NEVER DISABLED, not even while a draft is in the way. The draft
              belongs to the warehouse, and the way out of it is to look
              somewhere else — locking the branch that chose the warehouse
              leaves a counter with a Lanjutkan button for a sheet they did not
              want and no control that changes it. */}
          <FilterSelect
            layout="field"
            label="Cabang"
            ariaLabel="Cabang"
            value={branchId}
            options={namedOptions(scope.branches)}
            active={false}
            placeholder={scope.loading ? "Memuat…" : "Pilih cabang"}
            onChange={(value) => {
              if (value === branchId) return;
              setPickedBranch(value);
              // The warehouse may not belong to the new branch.
              setWarehouseId("");
            }}
            className="w-full sm:w-52"
          />

          <FilterSelect
            layout="field"
            label="Gudang"
            ariaLabel="Gudang"
            value={warehouseId}
            options={namedOptions(scopedWarehouses)}
            active={false}
            placeholder={branchId === "" ? "Pilih cabang dulu" : "Pilih gudang"}
            disabled={branchId === ""}
            onChange={setWarehouseId}
            className="w-full sm:w-52"
          />

          <FilterSelect
            layout="field"
            label="Kategori (opsional)"
            ariaLabel="Kategori"
            value={categoryId}
            options={withAll(namedOptions(categories), "Semua kategori")}
            active={false}
            // Meaningless while a draft is in the way: the scope belongs to the
            // sheet being opened, and that sheet already exists with its own.
            disabled={Boolean(draft)}
            onChange={setCategoryId}
            className="w-full sm:w-52"
          />

          {draft ? (
            <Button variant="secondary" asChild className="w-full sm:w-auto">
              <Link href={`/dashboard/inventory/opname/${draft._id}`}>
                Lanjutkan {draft.opnameNumber}
              </Link>
            </Button>
          ) : (
            <Button
              onClick={handleStart}
              disabled={starting || checking || !warehouseId}
              className="w-full sm:w-auto"
            >
              {starting ? "Menyiapkan…" : "+ Mulai opname"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
