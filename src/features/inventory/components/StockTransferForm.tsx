"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, Card, Spinner, TextField } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button as UIButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { stockMovementService } from "@/services/stockMovement.service";
import type {
  PreviewMovementRow,
  Product,
  TransferItemInput,
} from "@/types/inventory";
import {
  absDecimal,
  formatMoney,
  formatQty,
  isDecimal,
  isPositive,
  multiplyDecimals,
  sumDecimals,
  toMinor,
} from "@/utils/decimal";

import { useMovementPreview } from "../hooks/useMovementPreview";
import { useWarehouseOptions } from "../hooks/useWarehouseOptions";
import { newIdempotencyKey } from "../utils/idempotency";
import { qtyAtWarehouse } from "../utils/ledger";
import { ExpiryBadge } from "./ExpiryBadge";
import { JournalPreview } from "./JournalPreview";
import { TransferAddProductsDialog } from "./TransferAddProductsDialog";

/** One product line of the transfer, as the form holds it. */
interface LineDraft {
  productId: string;
  qty: string;
  /** This line's own reason. Optional — most lines need none. */
  notes: string;
}

/**
 * A quantity, as the field is allowed to hold it: digits and at most one decimal
 * point.
 *
 * A MINUS SIGN NEVER GETS IN, which is why this filters as it types rather than
 * complaining afterwards. "Pindahkan -5 dari A ke B" is a transfer in the OTHER
 * direction written so that every report reads backwards, and the direction here
 * comes from the two warehouse ids — so a minus is never a thing the user meant,
 * and the kindest moment to say so is before the character appears.
 *
 * DECIMALS SURVIVE, deliberately. `products.unit` is free text and admits "kg"
 * and "liter"; a field that only accepted whole numbers would refuse to move
 * half a sack, which is a real thing people do.
 */
function sanitizeQty(value: string): string {
  const [head, ...rest] = value.replace(/[^\d.]/g, "").split(".");
  return rest.length > 0 ? `${head}.${rest.join("")}` : head;
}

interface LineRowProps {
  line: LineDraft;
  /** From the picker's own result — name, SKU, unit and what the source holds. */
  product: Product | undefined;
  /** Decimal string: what the SOURCE warehouse holds of this product. */
  onHand: string | null;
  /** Set when the typed quantity exceeds `onHand` — shown in place of the hint. */
  shortage: string | undefined;
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
}

/**
 * One row of the transfer.
 *
 * The available quantity comes from the PARENT rather than a fetch of its own,
 * and that is what lets the parent refuse a transfer larger than the shelf: a
 * number only the row could see is a number only the row could check, and the
 * submit button lives up there.
 */
function TransferLineRow({
  line,
  product,
  onHand,
  shortage,
  onChange,
  onRemove,
}: LineRowProps) {
  return (
    <tr className="border-b border-border/60">
      <td className="px-2 py-2">
        <p className="font-medium">{product?.name ?? "—"}</p>
        <p className="tabular-nums text-xs text-muted">
          {product?.sku}
          {product?.unit && ` · ${product.unit}`}
        </p>
      </td>

      <td className="px-2 py-2">
        <Input
          aria-label={`Jumlah ${product?.name ?? ""}`}
          inputMode="decimal"
          value={line.qty}
          onChange={(event) => onChange({ qty: sanitizeQty(event.target.value) })}
          aria-invalid={shortage ? true : undefined}
          className={cn(
            "ml-auto max-w-24 text-right tabular-nums",
            shortage && "border-danger focus-visible:ring-danger/40",
          )}
        />
        {shortage ? (
          <p role="alert" className="mt-1 text-right text-[11px] text-danger">
            Melebihi stok — tersedia {formatQty(shortage)}
            {product?.unit && ` ${product.unit}`}
          </p>
        ) : (
          <p className="mt-1 text-right text-[11px] text-muted">
            Tersedia {formatQty(onHand)}
            {product?.unit && ` ${product.unit}`}
          </p>
        )}
      </td>

      <td className="px-2 py-2">
        <Input
          aria-label={`Catatan ${product?.name ?? ""}`}
          value={line.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          maxLength={500}
          placeholder="opsional"
          className="max-w-48 text-xs"
        />
      </td>

      <td className="px-2 py-2 text-right">
        <UIButton
          type="button"
          variant="ghost"
          size="sm"
          className="text-danger"
          onClick={onRemove}
        >
          Hapus
        </UIButton>
      </td>
    </tr>
  );
}

/**
 * Move stock between warehouses — the "siapkan barang untuk bazar" flow.
 *
 * WHAT THIS FORM HAS TO EXPLAIN, and why it is the most preview-heavy of the
 * three: a transfer looks like the simplest operation on the module and is
 * quietly the most surprising one underneath.
 *
 *   1. ONE REQUEST, MANY ROWS. The user types one quantity per product. FEFO
 *      decides which lots supply each, and every lot produces a PAIR of ledger
 *      rows — one out at the source, one in at the destination. "Pindahkan 10"
 *      of one product can be four rows; three products can be a dozen.
 *   2. LOTS TRAVEL. Each destination row re-creates the source lot with the same
 *      code, expiry and cost. Without that, transferring goods that expire would
 *      strip their expiry, and the receiving warehouse would hold stock FEFO
 *      could never order and the expiry report could never see.
 *   3. NO JOURNAL. Total inventory value does not change, so double-entry has
 *      nothing to record. Users who have just learned that every stock action
 *      posts to the books need to be told this one does not, or they go looking
 *      for the missing entry.
 *
 * WHY SEVERAL PRODUCTS IN ONE TRANSFER RATHER THAN ONE FORM FILLED REPEATEDLY.
 * Preparing a bazaar is a dozen products leaving one warehouse at one moment.
 * Filed one at a time they become a dozen unrelated postings, each with its own
 * `reference.id` — so nothing can answer "what went to the bazaar", and an error
 * partway through leaves half the goods moved with no document to unwind. One
 * request is one transaction and one correlation id: all of it lands, or none.
 *
 * The user never types a batch code here, deliberately: they move a QUANTITY and
 * the system decides which lots. Letting them retype the code would be an
 * invitation to move batch A and have it arrive labelled batch B.
 *
 * THE LOT PREVIEW IS FETCHED, NOT COMPUTED. `POST /stock-movements/preview` is
 * the posting path with the commit left off, so the pairs listed on the right
 * are the rows that will be written — including which lot each one carries. The
 * browser used to reimplement FEFO to draw this, which was a copy of a rule that
 * could go quietly out of date.
 */
export function StockTransferForm() {
  /**
   * WAREHOUSES ONLY, not the stock card's fuller lookup. That one also pages the
   * whole stock-holding catalogue to fill a dropdown — which this form no longer
   * has: products arrive from the picker, which searches on the server as it is
   * typed into. Loading five hundred products to render two selects would be a
   * request nobody reads.
   */
  const lookups = useWarehouseOptions();

  const [fromWarehouseId, setFrom] = useState("");
  const [toWarehouseId, setTo] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [notes, setNotes] = useState("");

  const [picking, setPicking] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  /**
   * Minted once per INTENT, not per request: it survives a failed attempt — so a
   * retry of a save that may have landed replays instead of moving the stock
   * twice — and is replaced only after one succeeds.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  // ACTIVE only, both ends. The API refuses a movement at an inactive warehouse,
  // so offering one would produce a rejection after the form was filled in.
  const active = useMemo(
    () => lookups.warehouses.filter((warehouse) => warehouse.isActive),
    [lookups.warehouses],
  );

  useEffect(() => {
    if (fromWarehouseId || active.length === 0) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setFrom(active[0]._id);
    // The second warehouse, when there is one: defaulting both ends to the same
    // location would open the form in a state it refuses to submit.
    setTo(active[1]?._id ?? active[0]._id);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [active, fromWarehouseId]);

  /**
   * The products on the form, by id — for the name, SKU and unit beside each
   * row.
   *
   * Seeded from the PICKER'S own results rather than looked up in a catalogue
   * list: the picker searches the server, so it can return a product no
   * page-load lookup ever held.
   */
  const [productById, setProductById] = useState<Map<string, Product>>(
    new Map(),
  );

  const sameWarehouse = Boolean(
    fromWarehouseId && fromWarehouseId === toWarehouseId,
  );

  /** What the SOURCE warehouse holds of a product, as the picker reported it. */
  function onHandOf(productId: string): string | null {
    const product = productById.get(productId);
    return product
      ? qtyAtWarehouse(product.stockByWarehouse, fromWarehouseId)
      : null;
  }

  /**
   * The lines asking for more than the source warehouse has, by product id, with
   * what it actually holds.
   *
   * WHY THIS IS CHECKED AT ALL, when a sale of the same shortfall is recorded
   * without complaint: nothing has left a shelf yet. A transfer is the request
   * that MOVES the goods, so "pindahkan 11" out of a warehouse holding 10 is a
   * typo — and posting it would drive the source negative while inventing a unit
   * at the destination, so the tenant's total stock would rise because somebody
   * mistyped. The API refuses it for exactly this reason; this is the same
   * refusal said earlier, in the row that caused it, in Indonesian.
   *
   * The numbers come from the picker's own result — chosen seconds ago in this
   * session — so this is a fast local check, never the authority. The server
   * re-reads the balance inside the posting, which is the only place a check can
   * be free of a race.
   */
  const shortages = useMemo(() => {
    const found = new Map<string, string>();

    for (const line of lines) {
      if (!isPositive(line.qty)) continue;

      const available = onHandOf(line.productId);
      if (available === null) continue;

      if ((toMinor(line.qty) ?? 0n) > (toMinor(available) ?? 0n)) {
        found.set(line.productId, available);
      }
    }

    return found;
    // `onHandOf` reads both, and is redefined every render by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, productById, fromWarehouseId]);

  /**
   * The lines that are complete enough to ask the server about, in the payload's
   * own shape. A half-typed row is left out rather than sent: the preview
   * endpoint refuses exactly what the create refuses, so an empty quantity would
   * paint the panel red while the user is still typing the first digit.
   */
  const items = useMemo<TransferItemInput[]>(
    () =>
      lines
        .filter((line) => line.productId && isPositive(line.qty))
        .map((line) => {
          const trimmed = line.notes.trim();
          return {
            productId: line.productId,
            qty: line.qty.trim(),
            ...(trimmed ? { notes: trimmed } : {}),
          };
        }),
    [lines],
  );

  /**
   * The payload, built once and used for both the preview and the save.
   *
   * Identical on purpose: a preview of a DIFFERENT request is worse than no
   * preview, and this is the only place the two could diverge.
   */
  const payload = useMemo(() => {
    const trimmed = notes.trim();
    return {
      operation: "transfer" as const,
      fromWarehouseId,
      toWarehouseId,
      items,
      ...(trimmed ? { notes: trimmed } : {}),
    };
  }, [fromWarehouseId, toWarehouseId, items, notes]);

  const preview = useMovementPreview(
    payload,
    // A short line is not asked about: the API refuses the whole payload, so the
    // request could only ever come back as an error, and the panel would go
    // blank while the row that caused it already says why.
    items.length > 0 && !sameWarehouse && shortages.size === 0,
    refreshKey,
  );

  /**
   * The outbound half of each pair, grouped by product — which is what the list
   * is about: one entry per lot that leaves the source warehouse, under the
   * product it belongs to. The matching `transfer_in` is rendered beside it, not
   * as its own row.
   *
   * `productName` comes from the server with the row. Matching the id against
   * the picker's list instead would render a blank heading over real rows for
   * any product added since the page loaded.
   */
  const groups = useMemo(() => {
    const byProduct = new Map<
      string,
      { productId: string; productName: string; rows: PreviewMovementRow[] }
    >();

    for (const row of preview.preview?.movements ?? []) {
      if (row.movementType !== "transfer_out") continue;

      const group = byProduct.get(row.productId) ?? {
        productId: row.productId,
        productName: row.productName,
        rows: [],
      };
      group.rows.push(row);
      byProduct.set(row.productId, group);
    }

    return [...byProduct.values()];
  }, [preview.preview]);

  const movementRows = groups.reduce(
    (total, group) => total + group.rows.length * 2,
    0,
  );

  const fromName =
    lookups.warehouses.find((w) => w._id === fromWarehouseId)?.name ?? "";
  const toName =
    lookups.warehouses.find((w) => w._id === toWarehouseId)?.name ?? "";

  /**
   * What the whole transfer is worth, summed across its lines.
   *
   * Plain multiplication against each product's current average — no server rule
   * is involved, and it moves no value anyway (see the journal note below). It
   * is here to answer "how much am I sending over there", which is the question
   * someone loading a van actually has.
   */
  const movedValue = sumDecimals(
    lines.map((line) => {
      const hppAvg = productById.get(line.productId)?.hppAvg;
      return hppAvg && isPositive(line.qty)
        ? multiplyDecimals(line.qty, hppAvg)
        : "0";
    }),
  );

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  /**
   * Several at once, from the picker. The products themselves are kept beside
   * the lines: a line holds an id, and the row next to it has to print a name.
   */
  function addLines(products: Product[]) {
    setProductById((prev) => {
      const next = new Map(prev);
      for (const product of products) next.set(product._id, product);
      return next;
    });
    setLines((prev) => [
      ...prev,
      ...products.map((product) => ({
        productId: product._id,
        qty: "",
        notes: "",
      })),
    ]);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (sameWarehouse) {
      next.toWarehouseId = "Gudang asal dan tujuan harus berbeda.";
    }
    if (lines.length === 0) {
      next.lines = "Tambahkan minimal satu produk.";
    }

    for (const [index, line] of lines.entries()) {
      const label = productById.get(line.productId)?.name ?? `Baris ${index + 1}`;

      if (line.qty.trim() === "") {
        next.lines = `${label}: jumlah wajib diisi.`;
      } else if (!isDecimal(line.qty)) {
        next.lines = `${label}: gunakan angka, maksimal 4 desimal.`;
      } else if (!isPositive(line.qty)) {
        // Nol maupun minus. Arah transfer datang dari dua gudangnya, bukan dari
        // tanda — "pindahkan -5 dari A ke B" adalah transfer arah sebaliknya
        // yang ditulis supaya setiap laporan terbaca terbalik.
        next.lines = `${label}: jumlah harus lebih dari nol — arah ditentukan gudang asal dan tujuan.`;
      } else if (shortages.has(line.productId)) {
        // Barangnya belum pindah ke mana-mana: permintaan inilah yang
        // memindahkannya, jadi ini salah ketik yang dikoreksi, bukan fakta yang
        // dicatat. Kalau raknya memang berisi lebih banyak, jalurnya penyesuaian
        // stok — bukan transfer yang membuat gudang asal minus.
        next.lines =
          `${label}: hanya tersedia ${formatQty(shortages.get(line.productId))} ` +
          `di ${fromName}. Kurangi jumlahnya, atau catat penyesuaian stok dulu.`;
      }

      if (next.lines) break;
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSaving(true);
    try {
      // The SAME payload the preview described, plus the retry token. Building a
      // second one here is how a form ends up saving something other than what
      // it showed.
      const written = await stockMovementService.create({
        ...payload,
        idempotencyKey,
      });

      const productCount = payload.items.length;

      setLines([]);
      setNotes("");
      setFieldErrors({});
      setRefreshKey((key) => key + 1);
      // A new intent needs a new token; reusing this one would make the next
      // transfer look like a replay of this one and move nothing.
      setIdempotencyKey(newIdempotencyKey);

      // The row count is the server's. It writes a pair per lot per product, so
      // an odd number here would itself be worth noticing — which is why the
      // message reports rows rather than deriving them from what was typed.
      swalToast(
        `Transfer tersimpan — ${productCount} produk, ${written.length} baris ditulis.`,
      );
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.fullMessage
          : "Terjadi kesalahan. Coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (lookups.loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat daftar gudang…
      </div>
    );
  }

  if (lookups.error) {
    return <Alert variant="error">{lookups.error}</Alert>;
  }

  if (active.length < 2) {
    return (
      <Alert variant="info">
        Transfer butuh <b>dua gudang aktif</b>. Tenant ini baru punya{" "}
        {active.length}. Tambahkan gudang lain di Master Data → Warehouse dulu.
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      {picking && (
        <TransferAddProductsDialog
          existingProductIds={lines.map((line) => line.productId)}
          onAdd={addLines}
          onClose={() => setPicking(false)}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="flex flex-col gap-6">
          <Card title="Perpindahan">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="from">Dari gudang</Label>
                  <Select value={fromWarehouseId} onValueChange={setFrom}>
                    <SelectTrigger id="from" aria-label="Dari gudang">
                      <SelectValue />
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

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="to">Ke gudang</Label>
                  <Select value={toWarehouseId} onValueChange={setTo}>
                    <SelectTrigger
                      id="to"
                      aria-label="Ke gudang"
                      aria-invalid={sameWarehouse || undefined}
                      className={sameWarehouse ? "border-danger" : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {active.map((warehouse) => (
                        <SelectItem key={warehouse._id} value={warehouse._id}>
                          {warehouse.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldErrors.toWarehouseId && (
                    <p role="alert" className="text-xs text-danger">
                      {fieldErrors.toWarehouseId}
                    </p>
                  )}
                </div>
              </div>

              {/* The reason for the WHOLE transfer, stamped on every row it
                  writes. Without it a stock card can only ever say "10 keluar ke
                  Gudang Bazar" — which is what happened, never why. */}
              <TextField
                label="Catatan transfer"
                name="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="mis. persiapan bazar Sabtu"
                maxLength={500}
                hint="Ikut tersimpan di setiap baris kartu stok yang dibuat transfer ini."
              />

              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent/60 px-3 py-2 text-sm">
                <span className="font-medium">{fromName}</span>
                <span className="text-primary">→</span>
                <span className="font-medium">{toName}</span>
                {isPositive(movedValue) && (
                  <>
                    <span className="text-muted">·</span>
                    <span className="text-muted">nilai berpindah</span>
                    <b className="tabular-nums">
                      {formatMoney(movedValue)}
                    </b>
                  </>
                )}
              </div>
            </div>
          </Card>

          <Card
            title={
              <span className="flex flex-wrap items-center gap-2">
                Produk yang dipindahkan
                <Badge variant="outline">{lines.length} baris</Badge>
              </span>
            }
          >
            {/**
             * THE BUTTON FOLLOWS THE LIST, above it while it is empty and below
             * it once it is not.
             *
             * On an empty card it is the only thing to do, so it goes where the
             * eye lands first and the explanation reads as a caption under it.
             * Once rows exist the list grows downwards, so the place a reader
             * ends is the place the next row comes from — after adding three
             * products the button is still under the third, rather than back up
             * past the rows just added.
             */}
            {lines.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-8 text-center">
                <UIButton
                  type="button"
                  variant="outline"
                  onClick={() => setPicking(true)}
                  className="border-dashed"
                >
                  + Tambah produk
                </UIButton>

                <div>
                  <p className="font-medium text-foreground">
                    Belum ada produk
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                    Satu transfer boleh membawa beberapa produk sekaligus —
                    semuanya tersimpan sebagai satu perpindahan.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
                        <th className="px-2 py-2 text-left font-medium">
                          Produk
                        </th>
                        <th className="px-2 py-2 text-right font-medium">
                          Jumlah
                        </th>
                        <th className="px-2 py-2 text-left font-medium">
                          Catatan baris
                        </th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => (
                        <TransferLineRow
                          // Keyed on the product, not the index: a product
                          // appears at most once, and removing a middle row
                          // under an index key would leave React reusing the
                          // wrong row's input.
                          key={line.productId}
                          line={line}
                          product={productById.get(line.productId)}
                          onHand={onHandOf(line.productId)}
                          shortage={shortages.get(line.productId)}
                          onChange={(patch) => updateLine(index, patch)}
                          onRemove={() =>
                            setLines((prev) =>
                              prev.filter((_, i) => i !== index),
                            )
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 border-t border-border/60 pt-3">
                  <UIButton
                    type="button"
                    variant="outline"
                    onClick={() => setPicking(true)}
                    className="w-full border-dashed"
                  >
                    + Tambah produk
                  </UIButton>
                </div>
              </>
            )}

            {fieldErrors.lines && (
              <p role="alert" className="mt-3 text-xs text-danger">
                {fieldErrors.lines}
              </p>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            Yang akan terjadi
          </p>

          {groups.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                  Batch yang berpindah
                </p>
                <Badge variant="outline" className="ml-auto">
                  {movementRows} baris movement
                </Badge>
              </div>

              {groups.map((group) => (
                <div key={group.productId}>
                  <p className="border-b border-border/60 bg-accent/40 px-4 py-1.5 text-xs font-medium">
                    {group.productName}
                  </p>

                  <ul className="divide-y divide-border/60">
                    {group.rows.map((allocation, index) => {
                      // The API signs its quantities; both halves of the pair are
                      // drawn from the magnitude.
                      const moved = absDecimal(allocation.qty);

                      return (
                        <li
                          key={allocation.batchId ?? index}
                          className="px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="tabular-nums text-xs">
                              {allocation.batchCode ?? "tanpa kode batch"}
                            </span>
                            {allocation.batchExpiryDate && (
                              <ExpiryBadge date={allocation.batchExpiryDate} />
                            )}
                            <span className="ml-auto tabular-nums text-sm font-semibold">
                              {formatQty(moved)}
                            </span>
                          </div>

                          {/* The pair. Showing both halves is the point: the lot
                              is not moved, it is closed here and re-opened
                              there. */}
                          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]">
                            <div className="rounded-md bg-danger/8 px-2 py-1.5">
                              <p className="tabular-nums text-danger">
                                −{formatQty(moved)}
                              </p>
                              <p className="truncate text-muted">{fromName}</p>
                            </div>
                            <span className="text-muted">→</span>
                            <div className="rounded-md bg-success/10 px-2 py-1.5">
                              <p className="tabular-nums text-success">
                                +{formatQty(moved)}
                              </p>
                              <p className="truncate text-muted">{toName}</p>
                            </div>
                          </div>

                          {allocation.lineNotes && (
                            <p className="mt-2 text-[11px] text-muted">
                              “{allocation.lineNotes}”
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
                Setiap batch dibuat ulang di gudang tujuan dengan <b>kode, tanggal
                kedaluwarsa, dan harga beli yang sama</b>. Tanpa itu, memindahkan
                barang berkedaluwarsa akan menghapus tanggalnya — dan gudang
                tujuan menyimpan stok yang tidak bisa diurutkan FEFO.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs text-muted">
              Tambahkan produk dan isi jumlahnya untuk melihat lot mana yang akan
              dipindahkan.
            </div>
          )}

          <JournalPreview
            lines={[]}
            emptyReason="Transfer TIDAK membuat jurnal. Barang masih milik tenant yang sama — hanya lokasinya yang berubah, jadi nilai persediaan sebelum dan sesudah sama persis."
          />

          <Button
            type="submit"
            // A shortage disables it rather than failing on click: the API would
            // refuse the whole posting anyway, and the row already says which
            // product and how much it actually has.
            disabled={saving || sameWarehouse || shortages.size > 0}
          >
            {saving ? "Menyimpan…" : "Simpan transfer"}
          </Button>

          <p className="text-xs text-muted">
            Daftar lot di atas datang dari server — pembagian yang sama persis
            yang akan ditulis saat disimpan. Semua produk di atas tersimpan
            sebagai <b>satu transfer</b>: kalau satu baris gagal, tidak ada satu
            pun yang berpindah.
          </p>

          <p className="text-xs text-muted">
            Catatan desain: bila kedua gudang berada di <b>cabang berbeda</b>,
            nilai persediaan sebenarnya berpindah antar dua pembukuan. Itu dicatat
            sebagai keputusan yang diketahui dan akan ditinjau ulang saat laporan
            keuangan per cabang dibangun.
          </p>
        </div>
      </div>
    </form>
  );
}
