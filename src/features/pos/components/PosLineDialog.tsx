"use client";

import { Minus, Percent, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { posService } from "@/services/pos.service";
import { formatMoney } from "@/utils/decimal";
import type { PosDiscountMode, PosItem, PosLot, PosLots } from "@/types/api";

import { ownDiscountOf } from "../bookingDiscount";
import { PERCENT, storedToInput, WHOLE_RUPIAH } from "./PosDiscountPopover";

/** Matches the server's `LINE_NOTE_MAX_LENGTH`. */
const NOTE_MAX_LENGTH = 200;

/**
 * What a cashier can change on ONE basket line besides its quantity and price
 * (8 October 2026): the line's discount, which lot a product is taken from, and
 * a note.
 *
 * DRAFT STATE, ONE WRITE. Nothing is sent until Simpan, and then all three go in
 * a single cart write — every write rebuilds the whole basket, so three
 * separate ones would each race the one before it.
 *
 * THE LOT PICKER ONLY EXISTS FOR A PRODUCT THAT EXPIRES. The server decides
 * (`hasExpiry`), because the till's catalogue tile does not carry it, and a
 * product with no lots has nothing to choose between. Lots are the SHIFT'S
 * warehouse's, never another building's.
 *
 * "OTOMATIS" IS A REAL CHOICE, not an empty state: it is FEFO, the default the
 * till has always had, and picking it clears a lot chosen earlier.
 */
/** One row of the manual split: which lot, and how many from it. */
interface LotRow {
  batchId: string;
  qty: number;
}

/**
 * The default split: earliest-expiring lots first, which is what FEFO would do.
 * It is only the STARTING point of manual mode — the cashier edits it from here
 * rather than building it from nothing.
 */
function fefoSplit(lots: PosLot[], qty: number): LotRow[] {
  const rows: LotRow[] = [];
  let left = qty;

  for (const lot of lots) {
    if (left <= 0) break;

    const take = Math.min(left, Math.floor(Number(lot.qtyRemaining)));
    if (take <= 0) continue;

    rows.push({ batchId: lot._id, qty: take });
    left -= take;
  }

  return rows.length > 0 ? rows : [{ batchId: "", qty: Math.max(qty, 1) }];
}

export function PosLineDialog({
  item,
  open,
  busy = false,
  onOpenChange,
  maySetPrice = false,
  onSave,
}: {
  item: PosItem | null;
  /** `posTransactions:setPrice` — without it the price is shown, not editable. */
  maySetPrice?: boolean;
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  /** Resolves `false` when the server refused it — the dialog then stays open. */
  onSave: (details: {
    discount: { mode: PosDiscountMode; value: string } | null;
    /**
     * A price typed over the catalogue's; `null` puts the line back to it.
     * ABSENT = leave the line's price as it is.
     */
    unitPrice?: string | null;
    /** Only for a product — a service is always one. */
    qty?: string;
    lots: Array<{ batchId: string; qty: string }>;
    note: string | null;
  }) => Promise<boolean>;
}) {
  const own = item ? ownDiscountOf(item) : null;

  const [mode, setMode] = useState<PosDiscountMode>("percent");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState(1);
  const [rows, setRows] = useState<LotRow[]>([]);
  const [note, setNote] = useState("");
  const [lots, setLots] = useState<PosLots | null>(null);
  const [lotsError, setLotsError] = useState<string | null>(null);
  /** Why Simpan was refused — shown only after it is pressed. */
  const [submitError, setSubmitError] = useState<string | null>(null);

  const itemKey = item ? `${item.kind}-${item.refId}` : null;

  // Seed the draft from the line each time the dialog opens.
  useEffect(() => {
    if (!open || !item) return;

    /* eslint-disable react-hooks/set-state-in-effect */
    setMode(own?.mode ?? "percent");
    setAmount(storedToInput(own));
    setPrice(String(Number(item.unitPrice)));
    setQty(Math.max(Number(item.qty) || 1, 1));
    setRows(
      (item.lots ?? []).map((lot) => ({
        batchId: lot.batchId,
        qty: Number(lot.qty),
      })),
    );
    setNote(item.note ?? "");
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemKey]);

  // An error belongs to the figures it was raised on; editing them retires it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSubmitError(null);
  }, [rows, qty, amount, mode, price]);

  // Only products have lots; ask the server which of them expire.
  useEffect(() => {
    if (!open || !item || item.kind !== "product") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLots(null);
      return;
    }

    let active = true;

    setLotsError(null);

    posService
      .lots(item.refId)
      .then((result) => {
        if (active) setLots(result);
      })
      .catch(() => {
        if (active) setLotsError("Batch gagal dimuat. Coba lagi.");
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, itemKey]);

  const trimmed = amount.trim();
  const normalised = trimmed.replace(",", ".");
  // An empty box means "no discount", which is a valid thing to save.
  const discountValid =
    trimmed === "" ||
    (mode === "percent"
      ? PERCENT.test(trimmed) && Number(normalised) <= 100
      : WHOLE_RUPIAH.test(trimmed));

  const isProduct = item?.kind === "product";
  const lotList = lots?.lots ?? [];
  const lotOf = (id: string) => lotList.find((lot) => lot._id === id);

  const total = rows.reduce((sum, row) => sum + row.qty, 0);
  /*
    THE SPLIT MUST ADD UP, and Simpan stays off until it does: every row names
    a lot, takes a whole number within what the lot holds, and the rows total
    the quantity being sold. The server enforces the same — this is so the
    cashier is told BEFORE pressing, not refused after.
  */
  const rowsValid =
    rows.length > 0 &&
    total === qty &&
    rows.every((row) => {
      const lot = lotOf(row.batchId);
      return (
        lot !== undefined &&
        Number.isInteger(row.qty) &&
        row.qty >= 1 &&
        row.qty <= Number(lot.qtyRemaining)
      );
    });
  /*
    NO ROWS = AUTOMATIC (FEFO), which is the default and needs no choosing. The
    moment the cashier adds a batch row they are naming lots, and then the rows
    must add up. Removing the last row is the way back.
  */
  const manual = rows.length > 0;
  const batchValid = !manual || rowsValid;

  /*
    OFFERED WHILE THERE IS SOMETHING TO ADD: no rows yet (the first one starts
    from FEFO's own split, so the cashier edits a sensible default instead of
    building one), or rows that do not yet cover the quantity with lots left.
  */
  const canAddBatch =
    isProduct &&
    lots?.hasExpiry === true &&
    lotList.length > 0 &&
    (rows.length === 0 || (total < qty && rows.length < lotList.length));

  function addBatch() {
    setRows((current) =>
      current.length === 0
        ? fefoSplit(lotList, qty)
        : [...current, { batchId: "", qty: Math.max(qty - total, 1) }],
    );
  }

  function patchRow(index: number, patch: Partial<LotRow>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function save() {
    /*
      REFUSED ON PRESS, NOT BY A GREYED BUTTON: a disabled Simpan says nothing
      about why. The dialog stays open and says what is wrong.
    */
    if (!discountValid) {
      setSubmitError(
        mode === "percent"
          ? "Isi persentase diskon 0–100, misalnya 7,5."
          : "Isi diskon dengan angka rupiah tanpa titik, misalnya 15000.",
      );
      return;
    }

    const typedPrice = price.trim();
    const priceNumber = Number(typedPrice);

    if (
      maySetPrice &&
      typedPrice !== "" &&
      (!Number.isFinite(priceNumber) || priceNumber < 0)
    ) {
      setSubmitError("Isi harga dengan angka rupiah, misalnya 15000.");
      return;
    }

    if (!batchValid) {
      setSubmitError(
        "Total keseluruhan batch number harus sama dengan jumlah produk yang dibeli",
      );
      return;
    }

    /*
      THE PRICE IS SENT ONLY WHEN IT MOVED. Unchanged is no write at all — it
      would otherwise turn every line into one carrying a "typed" price. An
      emptied box puts the line back to the catalogue's.
    */
    const priceChange: { unitPrice?: string | null } = {};
    if (maySetPrice && item) {
      if (typedPrice === "") {
        if (item.listPrice) priceChange.unitPrice = null;
      } else if (priceNumber !== Number(item.unitPrice)) {
        priceChange.unitPrice = String(priceNumber);
      }
    }

    const saved = await onSave({
      ...priceChange,
      discount: trimmed === "" ? null : { mode, value: normalised },
      ...(isProduct ? { qty: String(qty) } : {}),
      lots: manual
        ? rows.map((row) => ({ batchId: row.batchId, qty: String(row.qty) }))
        : [],
      note: note.trim() || null,
    });

    if (saved) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] grid-cols-[minmax(0,1fr)] gap-4 overflow-x-hidden overflow-y-auto p-4 sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle>Ubah baris</DialogTitle>
          <DialogDescription>
            {item?.petName ? `${item.petName} - ${item.name}` : item?.name}
            {item?.sku ? ` · ${item.sku}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ─── HARGA — label and box on ONE line ─── */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Label
                htmlFor="pos-line-price"
                className="w-16 shrink-0 text-sm font-semibold"
              >
                Harga
              </Label>
              {maySetPrice ? (
                <div className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">
                    Rp
                  </span>
                  <Input
                    id="pos-line-price"
                    inputMode="decimal"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    placeholder="0"
                    className="h-9 pl-9 tabular-nums"
                  />
                </div>
              ) : (
                <p className="text-sm tabular-nums">
                  {formatMoney(item?.unitPrice ?? "0")}
                </p>
              )}
            </div>
            {item?.listPrice && (
              <p className="pl-[76px] text-xs text-muted">
                Harga katalog {formatMoney(item.listPrice)}. Kosongkan kotak
                untuk mengembalikannya.
              </p>
            )}
          </div>

          {/* ─── JUMLAH — label, − and + on ONE line; a product only ─── */}
          {isProduct && (
            <div className="flex items-center gap-3">
              <Label className="w-16 shrink-0 text-sm font-semibold">
                Jumlah
              </Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="size-7"
                  aria-label="Kurangi jumlah"
                  disabled={qty <= 1}
                  onClick={() => setQty((current) => Math.max(current - 1, 1))}
                >
                  <Minus className="size-3.5" />
                </Button>
                <span className="w-10 text-center text-sm font-medium tabular-nums">
                  {qty}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="size-7"
                  aria-label="Tambah jumlah"
                  onClick={() => setQty((current) => current + 1)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ─── DISKON — two icon toggles and the box on ONE line ─── */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Label className="w-16 shrink-0 text-sm font-semibold">
                Diskon
              </Label>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon"
                  className="size-8"
                  variant={mode === "percent" ? "default" : "secondary"}
                  aria-label="Diskon persen"
                  aria-pressed={mode === "percent"}
                  onClick={() => setMode("percent")}
                >
                  <Percent className="size-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  className="size-8 text-xs font-semibold"
                  variant={mode === "amount" ? "default" : "secondary"}
                  aria-label="Diskon rupiah"
                  aria-pressed={mode === "amount"}
                  onClick={() => setMode("amount")}
                >
                  Rp
                </Button>
              </div>
              <Input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label={
                  mode === "percent"
                    ? "Nilai diskon persen"
                    : "Nilai diskon rupiah"
                }
                className="h-9 min-w-0 flex-1 tabular-nums"
              />
            </div>

            {trimmed && !discountValid && (
              <p className="pl-[76px] text-xs text-danger">
                {mode === "percent"
                  ? "Isi persentase 0–100, misalnya 7,5."
                  : "Isi angka rupiah tanpa titik, misalnya 15000."}
              </p>
            )}
            {own && trimmed === storedToInput(own) && (
              <p className="pl-[76px] text-xs text-muted">
                Terpotong {formatMoney(own.resolvedAmount)}. Kosongkan kotak
                untuk menghapus diskon.
              </p>
            )}
          </div>

          {/* ─── CATATAN — above the batches ─── */}
          <div className="space-y-2">
            <Label htmlFor="pos-line-note" className="text-sm font-semibold">
              Catatan
            </Label>
            <textarea
              id="pos-line-note"
              value={note}
              maxLength={NOTE_MAX_LENGTH}
              rows={2}
              placeholder="Catatan untuk baris ini"
              className="w-full rounded-lg border border-border bg-surface p-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          {/* ─── BATCH — no rows means automatic; "+ Tambah batch" starts them ─── */}
          {isProduct && lotsError && <Alert variant="error">{lotsError}</Alert>}

          {manual && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Batch</Label>
              <div className="space-y-2">
                {rows.map((row, index) => {
                  const lot = lotOf(row.batchId);
                  const held = lot ? Math.floor(Number(lot.qtyRemaining)) : 0;
                  const taken = new Set(
                    rows
                      .filter((_, i) => i !== index)
                      .map((other) => other.batchId),
                  );
                  /*
                          THE MOST THIS ROW CAN TAKE: what its lot holds, and
                          what is still unassigned on the line once the OTHER
                          rows are counted. The input clamps to it, so a figure
                          over either limit cannot be typed — and + goes grey at
                          it.
                        */
                  const most = Math.max(
                    Math.min(lot ? held : qty, qty - (total - row.qty)),
                    0,
                  );

                  return (
                    /*
                      ONE LINE PER LOT: the choice stretches, the quantity
                      controls (small, like Jumlah's) and the bin sit at its
                      end. The Select is the only part that gives, so the line
                      still fits a phone's dialog.
                    */
                    <div key={index} className="flex items-center gap-1.5">
                      <Select
                        value={row.batchId}
                        onValueChange={(value) => {
                          const next = lotOf(value);
                          const cap = next
                            ? Math.floor(Number(next.qtyRemaining))
                            : row.qty;
                          patchRow(index, {
                            batchId: value,
                            qty: Math.min(row.qty, cap),
                          });
                        }}
                      >
                        <SelectTrigger
                          className="h-9 min-w-0 flex-1"
                          aria-label={`Batch ${index + 1}`}
                        >
                          <SelectValue placeholder="Pilih batch" />
                        </SelectTrigger>
                        <SelectContent className="max-w-[calc(100vw-2rem)]">
                          {lotList
                            .filter((option) => !taken.has(option._id))
                            .map((option) => (
                              <SelectItem key={option._id} value={option._id}>
                                {`${option.supplierBatchCode ?? option.batchCode} · sisa ${Number(option.qtyRemaining)}`}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>

                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="size-7 shrink-0"
                        aria-label={`Kurangi jumlah batch ${index + 1}`}
                        disabled={row.qty <= 1}
                        onClick={() => patchRow(index, { qty: row.qty - 1 })}
                      >
                        <Minus className="size-3.5" />
                      </Button>
                      <Input
                        inputMode="numeric"
                        value={row.qty === 0 ? "" : String(row.qty)}
                        placeholder="0"
                        aria-label={`Jumlah batch ${index + 1}`}
                        className="h-8 w-11 shrink-0 px-1 text-center tabular-nums"
                        onChange={(event) => {
                          const digits = event.target.value.replace(/\D/g, "");
                          patchRow(index, {
                            qty: Math.min(Number(digits || 0), most),
                          });
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="size-7 shrink-0"
                        aria-label={`Tambah jumlah batch ${index + 1}`}
                        disabled={row.qty >= most}
                        onClick={() => patchRow(index, { qty: row.qty + 1 })}
                      >
                        <Plus className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-danger"
                        aria-label={`Hapus baris batch ${index + 1}`}
                        onClick={() =>
                          setRows((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {canAddBatch && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 px-2 text-primary"
              onClick={addBatch}
            >
              <Plus className="size-4" />
              Tambah batch
            </Button>
          )}
        </div>

        {submitError && <Alert variant="error">{submitError}</Alert>}

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
