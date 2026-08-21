"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import {
  Alert,
  Button,
  Card,
  FilterSelect,
  namedOptions,
  Spinner,
  TextField,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button as UIButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { stockMovementService } from "@/services/stockMovement.service";
import type {
  Product,
  ProductBatch,
  TransferItemInput,
} from "@/types/inventory";
import {
  formatMoney,
  formatQty,
  isDecimal,
  isPositive,
  multiplyDecimals,
  sumDecimals,
  toMinor,
} from "@/utils/decimal";

import { useWarehouseBatches } from "../hooks/useWarehouseBatches";
import { useWarehouseOptions } from "../hooks/useWarehouseOptions";
import { newIdempotencyKey } from "../utils/idempotency";
import { qtyAtWarehouse } from "../utils/ledger";
import { TransferAddProductsDialog } from "./TransferAddProductsDialog";

/** One product line of the transfer, as the form holds it. */
interface LineDraft {
  productId: string;
  qty: string;
  /**
   * WHICH LOT LEAVES THE SHELF. "" = not chosen yet.
   *
   * Only asked for — and only required — where the product tracks lots
   * (`hasExpiry`). Everything else moves as a quantity and lets FEFO decide, as
   * the whole form used to.
   */
  batchId: string;
  /** This line's own reason. Optional — most lines need none. */
  notes: string;
}

/** The lot label a row shows: what is on the box, and how much of it is left. */
function lotLabel(lot: ProductBatch): string {
  const expiry = lot.expiryDate
    ? new Date(lot.expiryDate).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return [
    lot.batchCode,
    expiry && `exp ${expiry}`,
    `sisa ${formatQty(lot.qtyRemaining)}`,
  ]
    .filter(Boolean)
    .join(" · ");
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
  /**
   * Whether the BATCH COLUMN exists at all, which is a property of the whole
   * table rather than of this row: a column appears the moment ANY line tracks
   * lots, and every other row then owes it a cell.
   */
  showBatch: boolean;
  /** The lots of this product still holding something at the SOURCE warehouse. */
  lots: ProductBatch[];
  /**
   * Whether the lot list is still on its way.
   *
   * An empty list means two OPPOSITE things — "this shelf holds no lots, move
   * the stock as it is" and "nothing has come back yet" — and a row that acted
   * on the first while the second was true would open the quantity field, take
   * a number, and then close it again when the lots arrived.
   */
  lotsLoading: boolean;
  /** Decimal string: what this line may draw on — the lot, or the warehouse. */
  onHand: string | null;
  /** Set when the typed quantity exceeds `onHand` — shown in place of the hint. */
  shortage: string | undefined;
  /**
   * Whether to SAY the batch is missing on this row.
   *
   * Decided by the parent, because it is a fact about when — after a save was
   * attempted, not while the row is being filled in. A table that reddens every
   * lot-tracked line the moment it is added is a table nobody reads.
   */
  batchMissing: boolean;
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
  showBatch,
  lots,
  lotsLoading,
  onHand,
  shortage,
  batchMissing,
  onChange,
  onRemove,
}: LineRowProps) {
  /**
   * Whether this row must NAME a lot — which is a fact about the shelf, not
   * about the catalogue flag.
   *
   * `hasExpiry` can be switched on long after stock arrived, and those units
   * carry no lot: nothing retro-fits one. A row that demanded a batch there
   * would offer an empty dropdown and refuse to move goods that are physically
   * on the shelf, so with no lots to choose from it behaves like any unbatched
   * product — which is exactly what the API does with it.
   */
  const lotTracked = product?.hasExpiry === true;
  const mustName = lotTracked && (lotsLoading || lots.length > 0);

  return (
    <tr className="border-b border-border/60">
      <td className="px-2 py-2">
        <p className="font-medium">{product?.name ?? "—"}</p>
        <p className="tabular-nums text-xs text-muted">
          {product?.sku}
          {product?.unit && ` · ${product.unit}`}
        </p>
      </td>

      {showBatch && (
        <td className="px-2 py-2">
          {lotTracked && lotsLoading ? (
            <span className="text-xs text-muted">Memuat batch…</span>
          ) : mustName ? (
            <div className="min-w-52">
              <FilterSelect
                layout="field"
                label=""
                ariaLabel={`Batch ${product?.name ?? ""}`}
                value={line.batchId}
                active={line.batchId !== ""}
                placeholder="Pilih batch"
                invalid={batchMissing}
                options={lots.map((lot) => ({
                  value: lot._id,
                  label: lotLabel(lot),
                }))}
                // The quantity is cleared with the choice: it was typed
                // against a DIFFERENT lot's remaining, and a number that
                // silently changes meaning is worse than an empty field.
                onChange={(value) => onChange({ batchId: value, qty: "" })}
              />
              {batchMissing && (
                <p role="alert" className="mt-1 text-[11px] text-danger">
                  Pilih batch dulu.
                </p>
              )}
            </div>
          ) : lotTracked ? (
            // NO LOT TO NAME, and the row says why rather than showing an
            // empty dropdown that looks broken. Stock that was on the shelf
            // before `hasExpiry` was switched on carries no batch, and the
            // API moves it as it is — unbatched here, unbatched there.
            <span className="text-xs text-muted">
              Belum ada batch — dipindahkan tanpa batch
            </span>
          ) : (
            // Said rather than left blank: an empty cell under "Batch" reads
            // as one nobody filled in.
            <span className="text-muted">—</span>
          )}
        </td>
      )}

      <td className="px-2 py-2">
        <Input
          aria-label={`Jumlah ${product?.name ?? ""}`}
          inputMode="decimal"
          value={line.qty}
          // Nothing to type against until the lot is named: the ceiling this
          // row is checked against is that lot's remaining.
          disabled={mustName && line.batchId === ""}
          onChange={(event) =>
            onChange({ qty: sanitizeQty(event.target.value) })
          }
          aria-invalid={shortage ? true : undefined}
          className={cn(
            "max-w-24 tabular-nums",
            shortage && "border-danger focus-visible:ring-danger/40",
          )}
        />
        {shortage ? (
          <p role="alert" className="mt-1 text-[11px] text-danger">
            Melebihi stok — tersedia {formatQty(shortage)}
            {product?.unit && ` ${product.unit}`}
          </p>
        ) : onHand === null && mustName ? (
          // The availability of a lot-tracked line is the CHOSEN LOT's
          // remaining, so there is no number to print until one is chosen —
          // and "Tersedia 0" would read as an empty shelf rather than an
          // unanswered question.
          <p className="mt-1 text-[11px] text-muted">Pilih batch dulu</p>
        ) : (
          <p className="mt-1 text-[11px] text-muted">
            {line.batchId ? "Sisa batch " : "Tersedia "}
            {formatQty(onHand)}
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
        {/* The SAME control as the adjustment sheet's, down to the icon: both
            take a row off a document that has not been filed yet. Not red —
            danger colour is for what cannot be undone, and this deletes
            nothing but a line somebody can add straight back.

            The label NAMES THE PRODUCT for anyone reading by screen reader: a
            column of identical "Hapus" buttons says which row it belongs to
            only by where it sits, which is a fact only a sighted reader has. */}
        <UIButton
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Hapus ${product?.name ?? "produk"}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
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
 * A LOT IS NAMED, NEVER TYPED. Nobody writes a batch code here: the codes on the
 * dropdown are the lots the source warehouse actually holds, and each one's
 * code, expiry and cost travel to the destination untouched. Letting somebody
 * retype the code would be an invitation to move batch A and have it arrive
 * labelled batch B.
 *
 * WHICH LOT IS ASKED ONLY WHERE IT IS A REAL QUESTION — products with
 * `hasExpiry`. Those move as a box somebody is holding: the cartons are already
 * in the van, and FEFO's answer would write off a DIFFERENT carton still on the
 * shelf, re-create that one's expiry at the destination, and leave both
 * warehouses holding lots that do not match what is physically there. The API
 * refuses such a line without a lot, so the form asks before it is refused.
 * Everything else still moves as a quantity and lets FEFO decide.
 *
 * THE LOT BREAKDOWN IS NOT SHOWN. A per-lot panel used to sit beside the form,
 * fetched from `POST /stock-movements/preview`; it was taken out because it
 * halved the width of the two cards people actually type into for a list that
 * repeats what FEFO would do anyway. What the form still refuses to guess is the
 * allocation itself — the server decides which lots go, and the only thing
 * checked in the browser is the shortage per product, which is what stops a
 * transfer the source warehouse cannot cover.
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

  const router = useRouter();

  const [fromWarehouseId, setFrom] = useState("");
  const [toWarehouseId, setTo] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [notes, setNotes] = useState("");

  const [picking, setPicking] = useState(false);

  /**
   * Every lot still holding something at the SOURCE warehouse, grouped by
   * product — one request for the whole table, re-read when the source changes.
   *
   * A lot belongs to a LOCATION: the same product's lots at the destination are
   * different boxes, and offering them here would name a lot the source cannot
   * give up.
   */
  const lots = useWarehouseBatches(fromWarehouseId);

  /**
   * Whether a save has been ATTEMPTED, which is when a missing batch may be
   * said out loud. Before that the row simply asks; after it, the rows that
   * still have not answered are marked.
   */
  const [attempted, setAttempted] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /**
   * Minted once per INTENT, not per request: it survives a failed attempt, so a
   * retry of a save that may already have landed replays instead of moving the
   * stock twice.
   *
   * NO SETTER, because a success leaves this route (see `handleSubmit`) and the
   * next transfer starts on a fresh mount with a fresh key. While the form
   * cleared itself in place, one had to be minted by hand at that moment —
   * reusing the old key would have made the second transfer look like a replay
   * of the first and move nothing.
   */
  const [idempotencyKey] = useState(newIdempotencyKey);

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

  /**
   * Moving the SOURCE forgets every lot already chosen, and the quantities with
   * them.
   *
   * A lot id names a box at one warehouse. Left in place while the source
   * changed, the form would hold ids the new warehouse never had — a payload
   * the API refuses with "batch is not held at warehouse", after the user has
   * filled the whole table in. The quantities go too: each was typed against
   * that lot's remaining.
   */
  function changeFrom(warehouseId: string) {
    setFrom(warehouseId);
    setLines((prev) =>
      prev.map((line) =>
        productById.get(line.productId)?.hasExpiry
          ? { ...line, batchId: "", qty: "" }
          : line,
      ),
    );
  }

  /** The lots of one product at the source, newest question first: is there any. */
  function lotsOf(productId: string): ProductBatch[] {
    return lots.byProduct.get(productId) ?? [];
  }

  /**
   * Whether a line MUST name a lot — a question about the shelf, not the flag.
   *
   * `hasExpiry` can be switched on long after stock arrived, and those units
   * carry no lot; nothing retro-fits one. Demanding a batch there would strand
   * goods that physically exist behind an empty dropdown, so the form asks only
   * where there is something to answer with — which is the same rule the API
   * applies, and the two must not disagree.
   *
   * TRUE WHILE THE LOTS ARE STILL LOADING, deliberately: "none came back yet"
   * must not read as "this shelf has none", or the row would open its quantity
   * field and close it again a moment later.
   */
  function mustNameLot(productId: string): boolean {
    if (!productById.get(productId)?.hasExpiry) return false;
    return lots.loading || lotsOf(productId).length > 0;
  }

  /** The lot a line named, when it named one that is still on the shelf. */
  function namedLotOf(line: LineDraft): ProductBatch | null {
    if (line.batchId === "") return null;
    return (
      lotsOf(line.productId).find((lot) => lot._id === line.batchId) ?? null
    );
  }

  /**
   * What a LINE may draw on — which is not always what the warehouse holds.
   *
   * A lot-tracked line draws on the LOT it named, so its ceiling is that lot's
   * remaining; the warehouse total would let somebody move 12 out of a carton
   * holding 5 as long as another carton made up the difference, which is a
   * transfer of goods that are not in the van. Null while no lot is named:
   * the question has not been answered yet, and zero is a different answer.
   *
   * Everything else draws on the warehouse, exactly as before.
   */
  function onHandOf(line: LineDraft): string | null {
    const product = productById.get(line.productId);
    if (!product) return null;

    // A lot to name means the LOT is the ceiling. No lots on this shelf — stock
    // that predates `hasExpiry` — means the warehouse is, exactly as it is for
    // a product that never tracked lots at all.
    if (product.hasExpiry && mustNameLot(line.productId)) {
      return namedLotOf(line)?.qtyRemaining ?? null;
    }

    return qtyAtWarehouse(product.stockByWarehouse, fromWarehouseId);
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

      const available = onHandOf(line);
      if (available === null) continue;

      if ((toMinor(line.qty) ?? 0n) > (toMinor(available) ?? 0n)) {
        found.set(line.productId, available);
      }
    }

    return found;
    // `onHandOf` reads all of these, and is redefined every render by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, productById, fromWarehouseId, lots.byProduct]);

  /**
   * The lot-tracked lines that have not named a lot yet, by product id.
   *
   * The API refuses these — a product with `hasExpiry` moves as a named lot,
   * never as a quantity — so the save button is disabled while the set is not
   * empty, and the rows in it are marked once a save has been attempted.
   */
  const missingBatch = useMemo(() => {
    const found = new Set<string>();

    for (const line of lines) {
      if (mustNameLot(line.productId) && line.batchId === "") {
        found.add(line.productId);
      }
    }

    return found;
    // `mustNameLot` reads all of these, and is redefined every render by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, productById, lots.byProduct, lots.loading]);

  /** Whether ANY line tracks lots — which is what summons the batch column. */
  const anyLotTracked = useMemo(
    () =>
      lines.some((line) => productById.get(line.productId)?.hasExpiry === true),
    [lines, productById],
  );

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
            // Sent only when the row named one. An empty string would be an id
            // the API cannot resolve, and a product that tracks no lots must
            // keep reaching FEFO exactly as it always did.
            ...(line.batchId ? { batchId: line.batchId } : {}),
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
        batchId: "",
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
      const label =
        productById.get(line.productId)?.name ?? `Baris ${index + 1}`;

      if (missingBatch.has(line.productId)) {
        // Barang ber-expiry berpindah sebagai LOT, bukan sebagai jumlah: yang
        // dimuat ke mobil sudah dipilih orangnya, dan FEFO akan mengurangi
        // batch lain yang masih di rak.
        next.lines = lots.loading
          ? `${label}: daftar batch masih dimuat, tunggu sebentar.`
          : `${label}: pilih batch yang dipindahkan dulu.`;
      } else if (line.qty.trim() === "") {
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
        const lot = namedLotOf(line);
        next.lines = lot
          ? `${label}: batch ${lot.batchCode} hanya berisi ` +
            `${formatQty(shortages.get(line.productId))} di ${fromName}. ` +
            `Kurangi jumlahnya, atau pindahkan sisanya lewat transfer batch lain.`
          : `${label}: hanya tersedia ${formatQty(shortages.get(line.productId))} ` +
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
    setAttempted(true);
    if (!validate()) return;

    setSaving(true);
    try {
      // The payload built above, plus the retry token. Building a second one
      // here is how a form ends up saving something other than what it showed.
      const written = await stockMovementService.create({
        ...payload,
        idempotencyKey,
      });

      const productCount = payload.items.length;

      // The row count is the server's. It writes a pair per lot per product, so
      // an odd number here would itself be worth noticing — which is why the
      // message reports rows rather than deriving them from what was typed.
      swalToast(
        `Transfer tersimpan — ${productCount} produk, ${written.length} baris ditulis.`,
      );

      /**
       * BACK TO THE LIST, where the transfer just written is the top row.
       *
       * This form used to clear itself and stay put, which was the only thing it
       * could do while this route WAS the form: there was nowhere to go, and no
       * list that would have shown what had just been filed. A toast over an
       * empty form is a receipt that disappears in four seconds.
       *
       * `push`, not `replace`: Back should return to the form somebody may have
       * meant to fill in again, not to whatever they were looking at before it.
       * The state is left as it is — the component unmounts on navigation, and a
       * fresh mount starts fresh, including a new idempotency key.
       */
      router.push("/dashboard/inventory/transfers");
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
          fromWarehouseId={fromWarehouseId}
          onAdd={addLines}
          onClose={() => setPicking(false)}
        />
      )}

      <div className="flex flex-col gap-6">
        <Card title="Perpindahan">
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* The filter shell, like every other warehouse picker in the
                  module. `active={false}` because these are not filters —
                  nothing is narrowed by naming a warehouse, the transfer
                  simply has two ends. */}
              <FilterSelect
                layout="field"
                label="Dari gudang"
                ariaLabel="Dari gudang"
                value={fromWarehouseId}
                options={namedOptions(active)}
                active={false}
                placeholder="Pilih gudang"
                onChange={changeFrom}
              />

              <div className="flex flex-col gap-1.5">
                <FilterSelect
                  layout="field"
                  label="Ke gudang"
                  ariaLabel="Ke gudang"
                  value={toWarehouseId}
                  options={namedOptions(active)}
                  active={false}
                  placeholder="Pilih gudang"
                  // The one thing a filter never has to say: this choice can
                  // be wrong. Both ends the same warehouse is a move that
                  // moves nothing.
                  invalid={sameWarehouse}
                  onChange={setTo}
                />
                {/* Said as soon as it is true, not only after a submit
                    attempt. The red border used to be the whole signal until
                    somebody pressed Simpan — status by colour alone, which §1
                    forbids, and invisible to anyone who cannot see it. */}
                {(fieldErrors.toWarehouseId || sameWarehouse) && (
                  <p role="alert" className="text-xs text-danger">
                    {fieldErrors.toWarehouseId ??
                      "Gudang asal dan tujuan harus berbeda."}
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
                  <b className="tabular-nums">{formatMoney(movedValue)}</b>
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
                variant="secondary"
                onClick={() => setPicking(true)}
              >
                + Tambah produk
              </UIButton>

              <div>
                <p className="font-medium text-foreground">Belum ada produk</p>
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
                      {/* The lot sits BESIDE the product rather than under it:
                          a lot-tracked product has one balance per lot, and the
                          quantity to its right is checked against whichever is
                          named here. The column appears only when something in
                          the table actually tracks lots. */}
                      {anyLotTracked && (
                        <th className="px-2 py-2 text-left font-medium">
                          Batch <span className="text-danger">*</span>
                        </th>
                      )}
                      <th className="px-2 py-2 text-left font-medium">
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
                        showBatch={anyLotTracked}
                        lots={lotsOf(line.productId)}
                        lotsLoading={lots.loading}
                        onHand={onHandOf(line)}
                        shortage={shortages.get(line.productId)}
                        batchMissing={
                          attempted && missingBatch.has(line.productId)
                        }
                        onChange={(patch) => updateLine(index, patch)}
                        onRemove={() =>
                          setLines((prev) => prev.filter((_, i) => i !== index))
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 border-t border-border/60 pt-3">
                {/* Sized to its label, left-aligned, like the same button
                    under the opname sheet's table. Full width made one
                    control read as the section's own footer rather than as
                    the row-adder it is. */}
                <UIButton
                  type="button"
                  variant="secondary"
                  onClick={() => setPicking(true)}
                >
                  + Tambah produk
                </UIButton>
              </div>
            </>
          )}

          {lots.error && (
            <Alert variant="error" className="mt-3">
              {lots.error}
            </Alert>
          )}

          {fieldErrors.lines && (
            <p role="alert" className="mt-3 text-xs text-danger">
              {fieldErrors.lines}
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted">
            Semua produk di atas tersimpan sebagai <b>satu transfer</b>: kalau
            satu baris gagal, tidak ada satu pun yang berpindah. Setiap batch
            dibuat ulang di gudang tujuan dengan{" "}
            <b>kode, tanggal kedaluwarsa, dan harga beli yang sama</b>, jadi
            urutan FEFO di sana tetap utuh.
          </p>

          <p className="text-xs text-muted">
            Produk yang <b>punya tanggal kedaluwarsa</b> harus disebutkan
            batch-nya — yang berkurang di gudang asal persis batch yang Anda
            pilih. Satu baris mengambil dari <b>satu batch</b>; kalau barangnya
            diambil dari dua batch, buat satu transfer lagi untuk sisanya.
            Produk tanpa kedaluwarsa tetap dilayani otomatis dengan urutan FEFO.
            Kalau stok lamanya memang <b>belum punya batch</b> — misalnya
            kedaluwarsa baru dinyalakan belakangan — barangnya tetap bisa
            dipindahkan apa adanya, tanpa batch.
          </p>

          <p className="text-xs text-muted">
            Transfer TIDAK membuat jurnal. Barang masih milik tenant yang sama —
            hanya lokasinya yang berubah, jadi nilai persediaan sebelum dan
            sesudah sama persis. Bila kedua gudang berada di{" "}
            <b>cabang berbeda</b>, nilai persediaan sebenarnya berpindah antar
            dua pembukuan. Itu dicatat sebagai keputusan yang diketahui dan akan
            ditinjau ulang saat laporan keuangan per cabang dibangun.
          </p>

          <Button
            type="submit"
            className="sm:self-end"
            // A shortage disables it rather than failing on click: the API would
            // refuse the whole posting anyway, and the row already says which
            // product and how much it actually has.
            disabled={
              saving ||
              sameWarehouse ||
              shortages.size > 0 ||
              // The API refuses a lot-tracked product moved without a lot, and
              // the row already says which one is waiting for an answer.
              missingBatch.size > 0
            }
          >
            {saving ? "Menyimpan…" : "Simpan transfer"}
          </Button>
        </div>
      </div>
    </form>
  );
}
