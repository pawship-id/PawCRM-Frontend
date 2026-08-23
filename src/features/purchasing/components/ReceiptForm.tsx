"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Alert,
  Button,
  Card,
  FilterSelect,
  Spinner,
  TextField,
} from "@/components";
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
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { autoBatchCode } from "@/lib/batchCode";
import { ApiError } from "@/services/api-error";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import {
  formatMoney,
  formatQty,
  isDecimal,
  isPositive,
  multiplyDecimals,
  sumDecimals,
  trimQty,
} from "@/utils/decimal";
import type { CreateGoodsReceiptInput, PurchaseType } from "@/types/api";
import type { Product } from "@/types/inventory";
import { useStockCardLookups } from "@/features/inventory/hooks/useStockCardLookups";
import {
  useBranchScope,
  warehousesForBranch,
} from "@/features/inventory/hooks/useBranchScope";
import { useWarehouseBatches } from "@/features/inventory/hooks/useWarehouseBatches";

import { ReceiptAddProductsDialog } from "./ReceiptAddProductsDialog";
import { useReceiptPreview } from "../hooks/useReceiptPreview";
import { useSupplierOptions } from "../hooks/useSupplierOptions";

/**
 * The sentinel the batch picker uses for "buat lot baru" — the same one the
 * adjustment sheet uses, and it has to be a value the `<select>` can hold rather
 * than a second piece of state, so that "belum dipilih", "lot ini" and "lot baru"
 * are three answers to ONE question.
 */
const NEW_BATCH = "__new__";

interface LineDraft {
  productId: string;
  qty: string;
  costPerUnit: string;
  /**
   * WHICH LOT the goods join: "" = belum dipilih, a `productbatches` id, or
   * NEW_BATCH. Only asked for products that carry an expiry date — see
   * `picksLot`.
   */
  batchChoice: string;
  /** Typed only while `batchChoice` is NEW_BATCH; an existing lot has its own. */
  batchCode: string;
  expiryDate: string;
}

/** Today, as an `<input type="date">` holds it. Also the API's default. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Whether a line gets its own lot, and therefore carries a batch code.
 *
 * True when the goods expire — the promise `hasExpiry` makes — or whenever the
 * delivery is consigned, because consignment stock always gets its own lot: its
 * cost was entered by hand rather than derived from a purchase.
 *
 * The code itself is no longer the clerk's problem — see `autoBatchCode`. What
 * IS still theirs is the expiry date, which nothing can derive.
 *
 * MODULE-LEVEL, taking `consignment` as an argument rather than closing over it.
 * Defined inside the component it would be a new function every render, and the
 * payload memo that calls it would either rebuild on every keystroke or lie about
 * its dependencies.
 */
function needsLot(product: Product | undefined, consignment: boolean): boolean {
  return Boolean(product?.hasExpiry) || consignment;
}

/**
 * Whether the row must SAY WHICH LOT, rather than only describing one.
 *
 * ONLY GOODS THAT EXPIRE, which is narrower than `needsLot` on purpose. A lot
 * that carries a date is a thing on the shelf a second van can add to: the same
 * medicine, the same expiry, arriving twice. A consignment lot exists to carry a
 * hand-entered cost for one intake, so every consigned line still opens its own
 * — there is nothing to join.
 *
 * MODULE-LEVEL for the same reason `needsLot` is: a function rebuilt every render
 * would rebuild the payload memo with it.
 */
function picksLot(product: Product | undefined): boolean {
  return Boolean(product?.hasExpiry);
}

/**
 * What a line COSTS, which on a consignment is nothing.
 *
 * FORCED TO "0" RATHER THAN TYPED. Consigned goods are still the supplier's, so
 * this form no longer asks what they cost: the column is locked at zero and the
 * field below it is disabled.
 *
 * WHAT THAT MEANS DOWNSTREAM, recorded here because it is not visible from the
 * screen. `costPerUnit` is not merely a label on a receipt — it is the figure
 * `stockMovementService` feeds to `#weightedAverage`, and a `receipt` movement
 * is NOT journal-exempt, so a consignment intake moves `products.hppAvg` exactly
 * like a purchase does. Bringing goods in at zero therefore averages the
 * product's cost basis DOWN, tenant-wide, and every later sale of that product —
 * consigned or owned — books COGS against the diluted figure. A receipt cannot
 * be edited or deleted once saved.
 *
 * That trade was made deliberately and is the shop's to make; it is written down
 * so the next reader does not "fix" the zero, and so that the day the numbers
 * look wrong there is something to read.
 *
 * A TYPED VALUE IS NOT DESTROYED, only overridden — `line.costPerUnit` keeps
 * whatever was entered under `beli_putus`, so toggling back restores it.
 *
 * MODULE-LEVEL, taking `consignment` as an argument, for the same reason
 * `needsLot` is: a function defined in the body would be new every render and
 * the payload memo would rebuild on every keystroke.
 */
function costOf(line: LineDraft, consignment: boolean): string {
  return consignment ? "0" : line.costPerUnit;
}

/**
 * This form's own address, for one tab.
 *
 * ONE DEFINITION, shared by the tab buttons and by the stamp on first paint —
 * two would drift, and the drift shows up as a refresh landing on a different
 * tab from the one the user left.
 *
 * The supplier is CARRIED rather than rebuilt: this screen is reached from a
 * vendor's detail page as `?supplier=…`, and dropping it would empty that field
 * on the next refresh.
 */
function receiptUrl(
  supplierId: string | undefined,
  type: PurchaseType,
): string {
  const query = new URLSearchParams();
  if (supplierId) query.set("supplier", supplierId);
  query.set("type", type);

  return `/dashboard/purchasing/receipts/new?${query}`;
}

/**
 * The mark a required COLUMN carries, since a column header is the only place a
 * table can say "wajib" once for every row.
 *
 * `danger-ink` (6.37:1) rather than `danger`: a lone asterisk has no word beside
 * it to carry the meaning, so it has to clear the contrast floor on its own —
 * see ui-rules §13. Hidden from screen readers, which get `aria-required` off
 * each input and would otherwise hear a bare star per row.
 */
function Required() {
  return (
    <span aria-hidden className="text-xs font-bold text-danger-ink">
      {" "}
      *
    </span>
  );
}

/**
 * What to say when one product is on two rows.
 *
 * NAMES THE PRODUCT AND THE WAY OUT. The API's own refusal identifies it by
 * ObjectId, which tells a clerk nothing about which of their rows to touch — and
 * the fix is not obvious either, because two lines for one product is exactly how
 * somebody records "twenty at one price, ten at another".
 *
 * That case IS real, and the answer is TWO RECEIPTS: the delivery physically was
 * two purchases at two prices, and one line per product is what lets a purchase
 * return say which of them it is reversing.
 */
function duplicateMessage(name: string | undefined): string {
  return `${name ?? "Produk ini"} muncul di dua baris. Gabungkan menjadi satu baris — atau, kalau harga belinya memang berbeda, catat sebagai dua penerimaan terpisah.`;
}

/**
 * Record goods arriving from a supplier.
 *
 * THIS FORM IS WHERE HPP IS BORN. Every other screen reads the weighted average;
 * this is the one that moves it. The place it is checked is the `Harga beli`
 * column itself, seeded with the current average so a price CHANGE shows up as a
 * change against the invoice in the clerk's hand.
 *
 * THE NUMBERS ARE FETCHED, NOT COMPUTED. This form used to run its own sequential
 * weighted-average simulation across the lines, reimplemented from the service.
 * That is gone. `POST /goods-receipts/preview` is the posting path with the
 * commit left off, so the totals, the lots and the receipt number shown here are
 * the ones that will actually be written. A reimplementation does not fail loudly
 * when the server changes its mind — it renders a confident wrong number that the
 * user approves, and here that number is permanent.
 *
 * WHAT THE PREVIEW RETURNS IS NOT ALL SHOWN. The per-product weighted-average
 * arithmetic and the journal it would post are still fetched — the totals below
 * come from the same response — but no longer rendered on this screen; the saved
 * receipt's detail page carries the journal. The preview is therefore still the
 * authority on every number here, whether or not its workings are on display.
 *
 * BELI PUTUS vs KONSINYASI changes what the form even means. Outright, the goods
 * become the tenant's, the ledger is posted and `2101 Utang Supplier` is
 * credited. Consigned, they sit in the warehouse still belonging to the supplier
 * — stock rises, but nothing is owed and nothing is journalled, because nothing
 * has been bought. `taxAmount` is not merely hidden for consignment, it is
 * omitted from the payload: the API REFUSES the field there rather than ignoring
 * it, on the grounds that a clerk who typed one has misunderstood which kind of
 * delivery they are recording.
 *
 * WHAT THE SERVER REFUSES IS NOT DUPLICATED IN `validate`. A supplier whose terms
 * do not permit this purchase type, an inactive warehouse, a product that holds
 * no stock, a batch code already used — those come back as a 400 and are surfaced
 * verbatim, naming every offending SKU at once so a forty-line delivery is fixed
 * in one pass. Only the rules a user can fix without a round trip are checked
 * locally.
 *
 * SUBMITTING TWICE CREATES TWO DELIVERIES. `POST /goods-receipts` is not
 * idempotent and has no `idempotencyKey` to send — a receipt IS the upstream
 * document, so a retried submit is indistinguishable from a second van arriving
 * with the same goods. The button is therefore locked for the whole flight and
 * the handler refuses re-entry; the preview panel is the other half of the
 * mitigation.
 */
export function ReceiptForm({
  supplierId,
  initialPurchaseType = "beli_putus",
}: {
  supplierId?: string;
  /**
   * Which tab to open on, read off `?type=` by the page.
   *
   * A PROP RATHER THAN `useSearchParams()` HERE, so the tab is decided during
   * the server render and the first paint is already the right one. Reading it
   * in the client would paint *Beli putus* and then swap, and the swap is
   * visible on the picker: a refresh mid-receipt would flash the wrong
   * catalogue.
   */
  initialPurchaseType?: PurchaseType;
}) {
  const router = useRouter();

  const { suppliers, loading: suppliersLoading } =
    useSupplierOptions(supplierId);
  const lookups = useStockCardLookups();

  const [supplier, setSupplier] = useState(supplierId ?? "");
  const [pickedBranch, setPickedBranch] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [purchaseType, setPurchaseType] = useState<PurchaseType>(
    initialPurchaseType,
  );
  const [receiptDate, setReceiptDate] = useState(today);
  const [taxAmount, setTaxAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);
  /**
   * The products the rows are ABOUT, kept here rather than looked up in a
   * catalogue held in memory.
   *
   * The picker searches on the server and hands back whole products, so this
   * grows one pick at a time and never needs the other five thousand. Nothing is
   * ever removed from it: a row deleted and its product picked again would
   * otherwise re-fetch what is already known, and a stale entry costs a few
   * bytes and nothing else.
   */
  const [productById, setProductById] = useState<Map<string, Product>>(
    new Map(),
  );
  const [picking, setPicking] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const consignment = purchaseType === "konsinyasi";

  /**
   * Switches the tab AND puts it in the address bar, so a refresh comes back to
   * the same one.
   *
   * `replace`, not `push`: the tab is a mode this form is in, not a place the
   * user navigated to. With `push`, Back would walk through every tab click
   * before leaving the screen — and each of those entries restores a form the
   * browser has already discarded the state of.
   *
   * `scroll: false` because the tabs sit at the top of a long form and Next
   * would otherwise jump there from wherever the user was reading.
   *
   * The supplier is CARRIED, not rebuilt: this screen is reached from a
   * supplier's detail page as `?supplier=…`, and dropping it on the first tab
   * click would empty that field on the next refresh.
   */
  function pickPurchaseType(next: PurchaseType) {
    setPurchaseType(next);
    // The lots on offer are the ones whose ownership matches the tab — see
    // `lotsFor`. A choice made on the other tab names a lot this one would not
    // have offered.
    clearBatchChoices();

    router.replace(receiptUrl(supplierId, next), { scroll: false });
  }

  /**
   * SAYS WHICH TAB IS OPEN FROM THE FIRST PAINT, rather than only after one is
   * clicked.
   *
   * `?type=` is how this screen remembers its tab across a refresh — but it was
   * written only by `pickPurchaseType`, so a form opened and never toggled had a
   * bare URL that MEANT *Beli putus* without saying so. Three things fall out of
   * that, and each is a real receipt going wrong:
   *
   *   A LINK SHARED FROM THIS SCREEN reproduced the tab only by coincidence —
   *   it happened to be the default. The day the default moves, every such link
   *   opens the other kind of delivery.
   *
   *   A MISSPELT PARAM STAYED ON SCREEN. `?type=bananas` renders *Beli putus*
   *   and the address bar keeps claiming otherwise; stamping the RESOLVED value
   *   makes the URL agree with the form.
   *
   *   THE BACK BUTTON. Toggling to *Konsinyasi* and back used to leave one
   *   history entry with no `type` and one with it, so Back walked between two
   *   URLs that render identically.
   *
   * `replace`, never `push`: opening a page must not cost a history entry the
   * user has to press Back through to leave.
   *
   * ONCE, AND THE REF IS WHAT SAYS SO rather than an empty dependency list that
   * lies about what the effect reads. `useRouter()` is documented as stable, but
   * an effect whose only guard is that promise re-runs on every render the day it
   * is not — and this one navigates, so the failure would be a form that drags
   * the address bar back to the tab it opened on while somebody is using it.
   *
   * It is also what makes React's development double-invoke write one URL rather
   * than two.
   */
  const stampedUrl = useRef(false);
  useEffect(() => {
    if (stampedUrl.current) return;
    stampedUrl.current = true;

    router.replace(receiptUrl(supplierId, initialPurchaseType), {
      scroll: false,
    });
  }, [router, supplierId, initialPurchaseType]);

  /**
   * LOCATION FIRST, THEN THE SHELF — the order every hand-typed stock form in
   * this app asks its two scoping questions in, and the same hook behind it.
   *
   * THE BRANCH IS NOT IN THE PAYLOAD, and that is the one way this differs from
   * the adjustment form. `POST /goods-receipts` takes no `branchId`: the service
   * resolves it from the warehouse (`warehouse.defaultBranchId`, then the
   * session's branch). So this picker SCOPES THE FIELD BELOW rather than
   * deciding the books — which is exactly what it is for, since offering a
   * warehouse pinned to another branch could only produce a refusal after the
   * whole delivery had been typed.
   */
  const scope = useBranchScope();
  /**
   * ONE BRANCH IS NOT A CHOICE — a tenant with a single shop reaches the
   * warehouse without opening a dropdown that has one option in it. Derived
   * rather than pushed into state by an effect, which would render once with the
   * empty value and leave the warehouse list needlessly empty in between.
   */
  const branchId = pickedBranch || scope.soleBranch;

  /**
   * ACTIVE warehouses only — this form WRITES, and the API refuses a delivery at
   * an inactive location — and only the ones THIS BRANCH may post at: its own,
   * plus the shared central warehouse, which belongs to no branch and serves all
   * of them. Empty until a branch is named, so a warehouse cannot be chosen and
   * then silently invalidated by a branch picked after it.
   */
  const scopedWarehouses = useMemo(
    () => warehousesForBranch(branchId, lookups.warehouses),
    [branchId, lookups.warehouses],
  );

  /**
   * THE CATALOGUE IS NO LONGER HELD HERE. It used to be `lookups.products`,
   * filtered to the active ones and poured into a per-row `<Select>`; the picker
   * dialog now asks the SERVER for the matches to one search — active products
   * that hold stock, which is exactly what a receipt line may name — so a tenant
   * with five thousand SKUs pays for the fifty they looked at. `lookups` stays
   * for the warehouses, which are a short list nobody searches.
   */

  /**
   * Filled in only when the branch has exactly ONE warehouse to offer — the same
   * rule `soleBranch` applies one field up: one option is not a choice, and two
   * are. This used to take the first of the whole list, which under a branch
   * that owns a warehouse AND reaches the shared one would silently pick between
   * two real answers.
   *
   * Kept out of an effect: a value derived from state does not need to round-trip
   * through one, and `warehouseId` staying "" until a branch is named is a
   * legitimate intermediate.
   */
  const effectiveWarehouseId =
    warehouseId || (scopedWarehouses.length === 1 ? scopedWarehouses[0]._id : "");

  /**
   * The lots already on the shelf AT THIS WAREHOUSE, so a second delivery of a
   * batch that is already there joins it instead of minting a duplicate row.
   *
   * ONE REQUEST FOR THE WHOLE DELIVERY, keyed on the warehouse — a lot belongs to
   * a location, and the same product's lots elsewhere are different boxes. Empty
   * until a warehouse is named, which is why the picker below only offers
   * "+ Batch baru" then: there is nothing to add to yet.
   */
  const lots = useWarehouseBatches(effectiveWarehouseId);

  /**
   * WHY PRODUCTS CANNOT BE PICKED YET, or null once they can.
   *
   * THE HEADER IS ANSWERED BEFORE THE LINES, and on this form that is not merely
   * tidiness. A row for goods that expire has to say WHICH LOT it lands in, and
   * the lots on offer are the ones held at the destination warehouse — which is
   * decided by the branch, which is asked after the supplier. Opening the picker
   * with any of the three unanswered produces rows whose batch column can only
   * offer "+ Batch baru", so a delivery of goods already on the shelf would mint
   * a duplicate lot with nothing on screen suggesting otherwise.
   *
   * ONE REASON, NAMING THE FIRST UNANSWERED QUESTION rather than listing all
   * three. They are answered top to bottom and each one narrows the next — a
   * warehouse cannot be chosen before its branch — so the first is the only one
   * the reader can act on.
   */
  const pickerBlocker = !supplier
    ? "Pilih supplier dulu — satu penerimaan adalah satu kiriman dari satu supplier."
    : !branchId
      ? "Pilih cabang dulu — gudang tujuan diambil dari cabang itu."
      : !effectiveWarehouseId
        ? "Pilih gudang tujuan dulu — batch yang sudah ada di gudang itulah yang ditawarkan per baris."
        : null;

  /**
   * The lots THIS row may join.
   *
   * FILTERED BY OWNERSHIP, which the adjustment sheet has no need to do. A
   * consignment lot holds goods that are still the supplier's and carries its own
   * hand-entered cost; an owned lot holds goods that were bought. Pouring one
   * kind into the other would leave a single lot whose stock is half titipan and
   * half milik toko, with one `isConsignment` flag to describe both — and a
   * consignment settlement reading that flag would bill the shop for its own
   * goods, or fail to bill for the supplier's.
   */
  function lotsFor(productId: string) {
    return (lots.byProduct.get(productId) ?? []).filter(
      (lot) => lot.isConsignment === consignment,
    );
  }

  /**
   * The payload, built once and used for BOTH the preview and the save.
   *
   * Identical on purpose: a preview of a DIFFERENT request is worse than no
   * preview, and this is the only place the two could diverge.
   */
  const payload = useMemo<CreateGoodsReceiptInput>(() => {
    const trimmedTax = taxAmount.trim();

    return {
      supplierId: supplier,
      warehouseId: effectiveWarehouseId,
      receiptDate,
      purchaseType,
      // Omitted entirely on consignment — the API forbids the key, it does not
      // ignore it. Omitted when blank so an untouched field is not "0".
      ...(consignment || trimmedTax === "" ? {} : { taxAmount: trimmedTax }),
      ...(notes.trim() === "" ? {} : { notes: notes.trim() }),
      items: lines.map((line) => {
        const product = productById.get(line.productId);
        /**
         * NAMING A LOT AND DESCRIBING ONE ARE DIFFERENT REQUESTS, and the API
         * refuses the pair rather than preferring one — so the code and the date
         * are omitted entirely for a row that names an existing lot. That lot
         * already has both, and sending a second answer could only contradict it.
         */
        const joiningLot =
          picksLot(product) &&
          line.batchChoice !== "" &&
          line.batchChoice !== NEW_BATCH;

        if (joiningLot) {
          return {
            productId: line.productId,
            qty: line.qty.trim(),
            costPerUnit: costOf(line, consignment).trim(),
            batchId: line.batchChoice,
          };
        }

        return {
          productId: line.productId,
          qty: line.qty.trim(),
          costPerUnit: costOf(line, consignment).trim(),
          // Filled in for the clerk when they left it blank. Done HERE rather
          // than in the field itself so the row keeps showing what the supplier
          // actually printed — nothing — while the preview and the save both
          // carry the code that will really be written.
          ...(needsLot(product, consignment)
            ? {
                batchCode:
                  line.batchCode.trim() ||
                  autoBatchCode(product?.sku, line.expiryDate, receiptDate),
              }
            : {}),
          ...(needsLot(product, consignment) && line.expiryDate !== ""
            ? { expiryDate: line.expiryDate }
            : {}),
        };
      }),
    };
    // `needsLot` closes over `consignment`, which `purchaseType` already covers.
  }, [
    supplier,
    effectiveWarehouseId,
    receiptDate,
    purchaseType,
    consignment,
    taxAmount,
    notes,
    lines,
    productById,
  ]);

  /**
   * The product on two rows at once, if there is one.
   *
   * THE API REFUSES THIS, and its message names the offending product by
   * ObjectId — correct for a machine, useless to a clerk staring at two rows that
   * look perfectly reasonable side by side. Detected here so the form can say
   * WHICH product, by name, before the request is sent.
   *
   * The picker below already excludes what is on the form, so this is reachable
   * only by a line whose product was removed from the catalogue mid-edit. It
   * stays because "unreachable" and "unreachable today" are different claims, and
   * the failure mode is a raw id in a red box.
   */
  /**
   * Rows whose product does not belong on the tab the form is now on.
   *
   * ONLY REACHABLE BY SWITCHING TABS after picking — the picker cannot produce
   * one. Rather than police the switch, the form reports it: the rows were added
   * deliberately, and a tab click that silently deleted somebody's typed
   * quantities is a worse outcome than the receipt this warns about.
   *
   * NOT A SUBMIT BLOCKER either, and that is a judgement rather than an
   * oversight. The API takes `purchaseType` and the product's flag independently
   * and has no rule connecting them, so refusing here would invent one in the
   * browser — and there are real receipts on the wrong side of it, like the
   * first delivery of goods a vendor has just agreed to convert to titipan. It
   * is named, and the clerk decides.
   *
   * A product missing from `productById` is skipped rather than flagged: that is
   * a row whose product was removed from the catalogue mid-edit, which
   * `duplicateProductId` below already explains and which this cannot diagnose.
   */
  const mismatchedLines = useMemo(
    () =>
      lines
        .map((line) => productById.get(line.productId))
        .filter(
          (product): product is Product =>
            product !== undefined &&
            product.isConsignment !== consignment,
        ),
    [lines, productById, consignment],
  );

  const duplicateProductId = useMemo(() => {
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.productId)) return line.productId;
      seen.add(line.productId);
    }
    return null;
  }, [lines]);

  /**
   * The gate on asking the server. The endpoint refuses exactly what the create
   * refuses, so asking it about a half-typed line would paint the panel red while
   * the user is still working. Everything checked here is something the user can
   * see and fix in the form; the server has the final word on the rest.
   */
  const previewEnabled =
    Boolean(supplier) &&
    Boolean(effectiveWarehouseId) &&
    lines.length > 0 &&
    // Asking about a payload we KNOW will be refused buys nothing but a red
    // panel quoting an ObjectId.
    duplicateProductId === null &&
    lines.every((line) => {
      const product = productById.get(line.productId);
      if (!isPositive(line.qty)) return false;
      if (!isDecimal(costOf(line, consignment))) return false;
      // WHICH LOT comes first: until it is answered the server cannot be told
      // whether this line joins one or opens one, and the two are different
      // requests.
      if (picksLot(product) && line.batchChoice === "") return false;
      // No batch-code gate: a blank one is filled by `autoBatchCode`. The
      // expiry date is not derivable and still blocks the preview — but only for
      // a lot being CREATED. One being joined already has a date of its own.
      if (
        product?.hasExpiry &&
        line.batchChoice === NEW_BATCH &&
        line.expiryDate === ""
      )
        return false;
      return true;
    }) &&
    (consignment || taxAmount.trim() === "" || isDecimal(taxAmount.trim()));

  const {
    preview,
    loading: previewLoading,
    error: previewError,
  } = useReceiptPreview(payload, previewEnabled);

  /**
   * The lots this delivery TOUCHES — the ones it would open, and the ones
   * already on the shelf it would add to.
   *
   * AS THE SERVER DECIDED THEM: `isNewBatch`, `batchId` and `batchCode` all come
   * back from `/goods-receipts/preview` rather than from anything computed here.
   * Empty until the preview has run, which is what the card's empty state says.
   *
   * BOTH, because the card below is the answer to "where do these goods land",
   * and a delivery that joins an existing lot creates nothing. Listing only the
   * new ones left that receipt reading "tidak ada batch baru", which is true and
   * says nothing about what is about to happen. `isNewBatch` separates the two
   * for the label; `batchId` is what a joined row carries instead.
   */
  const lotMovements = useMemo(
    () =>
      (preview?.movements ?? []).filter(
        (movement) => movement.isNewBatch || movement.batchId !== null,
      ),
    [preview],
  );

  /**
   * Whether the lot COLUMN is worth its width — true as soon as one row is about
   * goods that expire. A delivery of nothing but non-perishables never sees it.
   */
  const anyLotPicked = useMemo(
    () => lines.some((line) => picksLot(productById.get(line.productId))),
    [lines, productById],
  );

  /**
   * Whether anything on the sheet is OPENING a lot, which is the only case where
   * an expiry date has to be typed. An asterisk over a column of disabled boxes
   * marks as required a field nobody can fill, which is how the mark stops
   * meaning anything.
   */
  const anyNewLot = useMemo(
    () => lines.some((line) => line.batchChoice === NEW_BATCH),
    [lines],
  );

  /** Line subtotals are plain multiplication — no server rule is involved. */
  const localSubtotal = sumDecimals(
    lines.map((line) => {
      const cost = costOf(line, consignment);
      return isDecimal(line.qty) && isDecimal(cost)
        ? multiplyDecimals(line.qty, cost)
        : "0";
    }),
  );

  /**
   * Forgets which lot every row named, WITHOUT touching anything else on it.
   *
   * Called when the warehouse or the purchase type changes, because a lot id is
   * only meaningful against one of each: the lots on offer belong to a location,
   * and they are filtered by whether the goods are the shop's — see `lotsFor`.
   * Left alone, a stale id would post the delivery into a lot at the warehouse
   * the clerk has just navigated away from, or be refused by the server naming a
   * code nobody can see on screen any more.
   *
   * THE ROWS THEMSELVES SURVIVE, unlike the adjustment sheet, which empties on
   * the same event. There, every row's system quantity was read from the old
   * warehouse and means nothing at the new one. Here a row is a product, a
   * quantity and a price off the invoice in the clerk's hand — none of which the
   * warehouse decides — so throwing away a forty-line delivery because somebody
   * corrected the destination would be the worse trade.
   */
  function clearBatchChoices() {
    setLines((prev) =>
      prev.map((line) =>
        line.batchChoice === "" ? line : { ...line, batchChoice: "" },
      ),
    );
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  /**
   * SEVERAL AT ONCE, because a van carries several. The old picker added one row
   * per trip through a dropdown; the dialog hands back everything that was
   * ticked, across however many searches it took to find them.
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
        qty: "1",
        // Seeded with the current average so a re-order at the same price is one
        // keystroke, and a price CHANGE is visible as a change.
        //
        // TRIMMED, because the seed lands in an INPUT. The API stores money at
        // four decimals, which is right for a ledger and noise in a box somebody
        // is about to type over: `4000.0000` reads as a number the form did
        // something to, and it is the fixed zeros — not the value — that say so.
        // `trimQty` is the shared "stored decimal → editable string" shortener
        // (its name is about where it was first needed, not what it does); it
        // leaves a real fraction alone, so `12500.5000` still seeds `12500.5`.
        costPerUnit: trimQty(product.hppAvg),
        // Left unanswered rather than defaulted to "+ Batch baru": the whole
        // point of the picker is that a delivery of goods already on the shelf
        // should join them, and a default would quietly opt every row out of it.
        batchChoice: "",
        batchCode: "",
        expiryDate: "",
      })),
    ]);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!supplier) next.supplier = "Pilih supplier.";
    // Named before the warehouse, because the warehouse cannot be answered until
    // it is — a bare "Pilih gudang tujuan." over a disabled picker says nothing
    // about what to do next.
    if (!branchId) next.branch = "Pilih cabang dulu.";
    else if (!effectiveWarehouseId) next.warehouse = "Pilih gudang tujuan.";
    if (lines.length === 0) next.lines = "Tambahkan minimal satu barang.";

    if (duplicateProductId !== null) {
      next.lines = duplicateMessage(productById.get(duplicateProductId)?.name);
    }

    if (!next.lines) {
      for (const [index, line] of lines.entries()) {
        const product = productById.get(line.productId);
        const label = product?.name ?? `Baris ${index + 1}`;

        if (!isPositive(line.qty)) {
          next.lines = `${label}: qty harus lebih dari nol.`;
          break;
        }
        // Never reachable on a consignment, where the cost is the constant
        // "0" — kept unconditional anyway, because a rule that is only true
        // while a neighbouring branch holds is a rule that breaks quietly when
        // that branch changes.
        if (!isDecimal(costOf(line, consignment))) {
          next.lines = `${label}: harga beli wajib diisi.`;
          break;
        }
        if (picksLot(product) && line.batchChoice === "") {
          next.lines = `${label}: pilih batch dulu — lot yang sudah ada, atau batch baru.`;
          break;
        }
        // Kode batch is NOT checked: blank means "supplier tidak memberi nomor",
        // and the payload derives one. The expiry date has no such fallback —
        // it is the thing the code is derived FROM, and FEFO is wrong without it.
        // Asked only of a lot being CREATED: one being joined carries the date it
        // was created with, and the form shows it rather than asking again.
        if (
          product?.hasExpiry &&
          line.batchChoice === NEW_BATCH &&
          line.expiryDate === ""
        ) {
          next.lines = `${label}: tanggal kedaluwarsa wajib diisi.`;
          break;
        }
      }
    }

    if (
      !consignment &&
      taxAmount.trim() !== "" &&
      !isDecimal(taxAmount.trim())
    ) {
      next.taxAmount = "Gunakan angka, maksimal 4 desimal.";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Re-entry guard. `disabled` on the button covers the pointer; this covers
    // a second submit event from the keyboard while the first is still in
    // flight — which, without an idempotency key, would be a second delivery.
    if (saving) return;

    setFormError(null);
    if (!validate()) return;

    setSaving(true);
    try {
      const receipt = await goodsReceiptService.create(payload);

      swalToast(
        consignment
          ? `${receipt.receiptNumber} tersimpan — stok naik, belum ada utang.`
          : `${receipt.receiptNumber} tersimpan — HPP dan utang diperbarui.`,
      );
      // `replace`, not `push`: the create form must not be reachable by going
      // back, because going back to it and submitting again receives the goods
      // a second time.
      router.replace(`/dashboard/purchasing/receipts/${receipt._id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.fullMessage);
        setFieldErrors(error.fieldErrors);
      } else {
        setFormError("Terjadi kesalahan. Coba lagi.");
      }
      setSaving(false);
    }
  }

  return (
    <>
      {picking && (
        <ReceiptAddProductsDialog
          existingProductIds={lines.map((line) => line.productId)}
          consignment={consignment}
          onAdd={addLines}
          onClose={() => setPicking(false)}
        />
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {formError && <Alert variant="error">{formError}</Alert>}
        {lookups.error && <Alert variant="error">{lookups.error}</Alert>}

        <div>
          <div className="inline-flex rounded-lg bg-accent p-1">
            {(
              [
                ["beli_putus", "Beli putus"],
                ["konsinyasi", "Konsinyasi (titipan)"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => pickPurchaseType(value)}
                className={cn(
                  "rounded-md px-3.5 py-2 text-sm font-medium transition",
                  purchaseType === value
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {consignment
              ? "Barang masuk gudang tapi masih milik supplier — tidak ada utang dan tidak ada jurnal, dan harga belinya nol karena belum ada yang dibeli. Setiap baris punya lot sendiri — kode batch terisi otomatis kalau dikosongkan."
              : "Barang jadi milik toko saat diterima — utang ke supplier langsung tercatat dan jurnal diposting."}
          </p>
        </div>

        <Card title="Dokumen">
          {/* TWO COLUMNS, THREE ROWS, and the rows are the order the questions
              are actually answered in: WHO delivered and WHEN, then WHERE it
              landed — cabang before gudang, since the second is a list the first
              decides — and only then the tax on the invoice. A three-column grid
              put the branch and the warehouse on different lines at some widths,
              which is the one pairing that has to stay together. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supplier">Supplier</Label>
              <Select value={supplier} onValueChange={setSupplier}>
                {/* `w-full` at the CALL SITE. `ui/select`'s trigger is `w-fit`
                    by default, which sizes it to the longest supplier's name and
                    leaves the three pickers in this card three different widths
                    beside a full-width date field. The vendored file stays
                    re-syncable from the shadcn CLI — ui-rules §14 — so the
                    override lives here. */}
                <SelectTrigger
                  id="supplier"
                  aria-label="Supplier"
                  className="w-full"
                >
                  <SelectValue
                    placeholder={
                      suppliersLoading ? "Memuat supplier…" : "Pilih supplier…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((item) => (
                    <SelectItem key={item._id} value={item._id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.supplier && (
                <p role="alert" className="text-xs text-danger">
                  {fieldErrors.supplier}
                </p>
              )}
            </div>

            <TextField
              label="Tanggal terima"
              name="receiptDate"
              type="date"
              value={receiptDate}
              onChange={(event) => setReceiptDate(event.target.value)}
              hint="Tanggal barang tiba, bukan tanggal input."
            />

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="branch">Cabang</Label>
              {/* ONLY THE BRANCHES THIS USER HOLDS. `useBranchScope` narrows the
                  list with `accessibleBranches`, because the server answers 403
                  for any other — offering one could only produce a refusal after
                  the delivery was typed. */}
              <Select
                value={branchId}
                onValueChange={(value) => {
                  if (value === branchId) return;
                  setPickedBranch(value);
                  // The warehouse below belongs to the OLD branch and may not
                  // exist under the new one. The lines stay: a product is not
                  // scoped to a location, and its cost seed is the tenant-wide
                  // average. Their LOTS do not — see `clearBatchChoices`.
                  setWarehouseId("");
                  clearBatchChoices();
                }}
              >
                <SelectTrigger id="branch" aria-label="Cabang" className="w-full">
                  <SelectValue
                    placeholder={
                      scope.loading ? "Memuat cabang…" : "Pilih cabang…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {scope.branches.map((branch) => (
                    <SelectItem key={branch._id} value={branch._id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.branch && (
                <p role="alert" className="text-xs text-danger">
                  {fieldErrors.branch}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="warehouse">Masuk ke gudang</Label>
              <Select
                value={effectiveWarehouseId}
                onValueChange={(value) => {
                  if (value === effectiveWarehouseId) return;
                  setWarehouseId(value);
                  // Every lot named on a row is held at the OLD warehouse.
                  clearBatchChoices();
                }}
                // Nothing to offer until a branch is named: the list IS that
                // branch's warehouses, so an enabled empty picker would read as
                // "cabang ini tidak punya gudang".
                disabled={branchId === ""}
              >
                <SelectTrigger
                  id="warehouse"
                  aria-label="Masuk ke gudang"
                  className="w-full"
                >
                  <SelectValue
                    placeholder={
                      branchId === ""
                        ? "Pilih cabang dulu…"
                        : "Pilih gudang…"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {scopedWarehouses.map((warehouse) => (
                    <SelectItem key={warehouse._id} value={warehouse._id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.warehouse && (
                <p role="alert" className="text-xs text-danger">
                  {fieldErrors.warehouse}
                </p>
              )}
            </div>

            {/* PPN belongs to a purchase. There is none on a consignment, and the
                API refuses the field there outright. */}
            {!consignment && (
              <TextField
                label="PPN masukan"
                name="taxAmount"
                inputMode="decimal"
                value={taxAmount}
                onChange={(event) => setTaxAmount(event.target.value)}
                error={fieldErrors.taxAmount}
                hint="Masuk ke akun 1301, bukan ke nilai persediaan."
                placeholder="0"
              />
            )}
          </div>
        </Card>

        <Card
          title={
            <span className="flex flex-wrap items-center gap-2">
              Barang diterima
              {lines.length > 0 && (
                <Badge variant="outline">{lines.length} baris</Badge>
              )}
            </span>
          }
        >
          {/**
           * THE BUTTON FOLLOWS THE LIST, above it while it is empty and below it
           * once it is not — the same arrangement the transfer form, the opname
           * sheet, the opening stock document and the adjustment use. On an empty
           * card it is the only thing to do, so it goes where the eye lands first;
           * once rows exist the list grows downwards, so the place a reader ends
           * is the place the next row comes from.
           */}
          {mismatchedLines.length > 0 && (
            <Alert variant="warning" className="mb-4">
              {consignment
                ? "Baris ini bukan produk konsinyasi: "
                : "Baris ini ditandai konsinyasi (titipan): "}
              <b>
                {mismatchedLines.map((product) => product.name).join(", ")}
              </b>
              .{" "}
              {consignment
                ? "Kalau memang bukan titipan, hapus barisnya atau pindah ke tab Beli putus."
                : "Kalau memang titipan, hapus barisnya atau pindah ke tab Konsinyasi."}
            </Alert>
          )}

          {lines.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <UIButton
                type="button"
                variant="secondary"
                onClick={() => setPicking(true)}
                disabled={saving || pickerBlocker !== null}
              >
                + Tambah produk
              </UIButton>

              <div>
                <p className="font-medium text-foreground">Belum ada barang</p>
                {/* The greyed button says NOTHING on its own, and a control that
                    cannot be pressed with no explanation reads as a bug. This
                    paragraph is where the empty state already talks, so the
                    reason goes here rather than into a second banner. */}
                <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                  {pickerBlocker ??
                    "Cari dan centang beberapa produk sekaligus — semuanya tercatat sebagai satu penerimaan dari supplier ini."}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* The lots failed to load, so every picker below offers only
                  "+ Batch baru" — which would silently mint a duplicate of a lot
                  that IS on the shelf. Said out loud rather than left to look
                  like "gudang ini belum punya batch". */}
              {anyLotPicked && lots.error && (
                <Alert variant="error" className="mb-4">
                  {lots.error}
                </Alert>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[10px] tracking-widest text-muted uppercase">
                      <th className="px-2 py-2 text-left font-medium">Produk</th>
                      {/* LEFT, not right, though both columns hold numbers.
                          What sits under them is an INPUT BOX of a fixed width,
                          not a figure — the box starts at the left edge of the
                          cell, so a right-aligned label floats away from the
                          control it names. Subtotal keeps `text-right`, because
                          that column really is a number. */}
                      <th className="px-2 py-2 text-left font-medium">Qty</th>
                      {/* ONE NAME, BOTH WAYS ROUND — "HPP manual" was the
                          consignment version, and it named an accounting
                          concept at somebody reading a surat jalan. WAJIB only
                          on beli putus: the figure is on the supplier's invoice
                          and cannot be derived from the running average, since a
                          receipt that fell back to it could never move HPP. A
                          consignment asks nothing — see `costOf`. */}
                      <th className="px-2 py-2 text-left font-medium">
                        Harga beli
                        {!consignment && <Required />}
                      </th>
                      {/* WHICH LOT, asked before what it is called — a delivery
                          of goods that expire either joins a batch already on the
                          shelf or opens one, and the two columns to its right are
                          read-only or typed depending on the answer. */}
                      {anyLotPicked && (
                        <th className="px-2 py-2 text-left font-medium">
                          Batch
                          <Required />
                        </th>
                      )}
                      <th className="px-2 py-2 text-left font-medium">
                        Kode batch
                      </th>
                      <th className="px-2 py-2 text-left font-medium">
                        {/* The column, not the cell, carries the mark: a date
                            input cannot hold a placeholder, so an empty one
                            looks finished and needs saying somewhere. Only while
                            something is being TYPED, though — a lot being joined
                            brings its own date, and the box showing it is
                            disabled. */}
                        Expired
                        {anyNewLot && <Required />}
                      </th>
                      <th className="px-2 py-2 text-right font-medium">Subtotal</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const product = productById.get(line.productId);
                      const lotTracked = needsLot(product, consignment);
                      const expiryRequired = Boolean(product?.hasExpiry);
                      const choosesLot = picksLot(product);
                      /**
                       * The lot this row JOINS, when it names one that already
                       * exists. Its code and date are shown beside it read-only:
                       * they describe goods on the shelf, and nothing typed on a
                       * receipt may rewrite them.
                       */
                      const namedLot =
                        choosesLot &&
                        line.batchChoice !== "" &&
                        line.batchChoice !== NEW_BATCH
                          ? (lotsFor(line.productId).find(
                              (lot) => lot._id === line.batchChoice,
                            ) ?? null)
                          : null;
                      /**
                       * Whether the row DESCRIBES a lot — types a code, and a
                       * date if the goods carry one — rather than naming one or
                       * saying nothing yet.
                       *
                       * Goods that expire describe one only once "+ Batch baru"
                       * has been chosen: before that the answer is still open,
                       * and offering the boxes would invite somebody to type a
                       * code the very next click discards. Consigned goods that
                       * never expire have no picker at all — every consignment
                       * intake opens its own lot — so their code box is simply
                       * always there.
                       */
                      const describingLot = choosesLot
                        ? line.batchChoice === NEW_BATCH
                        : lotTracked;
                      // Shown as the batch field's placeholder, so the clerk can see
                      // the code they are about to accept rather than discovering it
                      // on the receipt afterwards. Withheld until the expiry date is
                      // in, because until then it would be derived from the wrong
                      // date and change under them the moment they type one.
                      const autoCode =
                        expiryRequired && line.expiryDate === ""
                          ? null
                          : autoBatchCode(
                              product?.sku,
                              line.expiryDate,
                              receiptDate,
                            );

                      return (
                        <tr
                          key={`${line.productId}-${index}`}
                          className="border-b border-border/60"
                        >
                          <td className="px-2 py-2">
                            <p className="font-medium">{product?.name ?? "—"}</p>
                            <p className="tabular-nums text-xs text-muted">
                              {product?.sku}
                              {product?.unit && ` · ${product.unit}`}
                            </p>
                          </td>

                          <td className="px-2 py-2">
                            <Input
                              aria-label={`Qty ${product?.name ?? ""}`}
                              inputMode="decimal"
                              value={line.qty}
                              onChange={(event) =>
                                updateLine(index, { qty: event.target.value })
                              }
                              className="max-w-20 text-right tabular-nums"
                            />
                          </td>

                          <td className="px-2 py-2">
                            <Input
                              aria-label={`Harga ${product?.name ?? ""}`}
                              inputMode="decimal"
                              // Locked at nothing on a consignment: the goods
                              // are still the supplier's, so there is no price
                              // to type. `disabled` rather than readOnly so it
                              // is skipped by the keyboard too — there is
                              // nothing to do in it.
                              required={!consignment}
                              aria-required={!consignment}
                              disabled={consignment}
                              value={costOf(line, consignment)}
                              onChange={(event) =>
                                updateLine(index, {
                                  costPerUnit: event.target.value,
                                })
                              }
                              className="max-w-28 text-right tabular-nums"
                            />
                          </td>

                          {anyLotPicked && (
                            <td className="px-2 py-2">
                              {choosesLot ? (
                                <FilterSelect
                                  layout="field"
                                  label=""
                                  ariaLabel={`Batch ${product?.name ?? ""}`}
                                  value={line.batchChoice}
                                  active={line.batchChoice !== ""}
                                  placeholder="Pilih batch"
                                  /* No warehouse, no lots — the list would
                                     offer "+ Batch baru" as if it were the only
                                     answer, and minting a duplicate of a lot
                                     that IS on the shelf is exactly what this
                                     picker exists to prevent. Reachable only by
                                     changing the branch under rows that were
                                     added before. */
                                  disabled={
                                    saving || effectiveWarehouseId === ""
                                  }
                                  disabledHint="Pilih gudang tujuan dulu."
                                  className="max-w-56"
                                  options={[
                                    ...lotsFor(line.productId).map((lot) => ({
                                      value: lot._id,
                                      label: `${lot.batchCode} · sisa ${formatQty(lot.qtyRemaining)}`,
                                    })),
                                    {
                                      value: NEW_BATCH,
                                      label: "+ Batch baru…",
                                    },
                                  ]}
                                  onChange={(value) =>
                                    updateLine(index, { batchChoice: value })
                                  }
                                />
                              ) : (
                                // Said rather than left blank: an empty cell
                                // under "Batch" reads as one nobody filled in.
                                <span className="text-xs text-muted">—</span>
                              )}
                            </td>
                          )}

                          <td className="px-2 py-2">
                            {namedLot ? (
                              /* DISABLED, NOT PLAIN TEXT: it stays in the same
                                 box in the same column as the row above that is
                                 typing one, so the eye reads a column of codes
                                 rather than a column of two different things.
                                 The grey is what says it cannot be changed. */
                              <Input
                                aria-label={`Kode batch ${product?.name ?? ""}`}
                                value={namedLot.batchCode}
                                disabled
                                className="max-w-40 tabular-nums text-xs"
                              />
                            ) : describingLot ? (
                              <Input
                                aria-label={`Kode batch ${product?.name ?? ""}`}
                                value={line.batchCode}
                                onChange={(event) =>
                                  updateLine(index, {
                                    batchCode: event.target.value,
                                  })
                                }
                                // "opsional" rather than the code itself. The
                                // placeholder used to preview what would be
                                // generated, which read as a value already in
                                // the box — and the one thing a clerk needs to
                                // know here is that leaving it empty is fine.
                                // The code is still on the tooltip.
                                placeholder="opsional"
                                title={
                                  autoCode
                                    ? `Kosongkan untuk memakai ${autoCode}`
                                    : "Kosongkan untuk kode otomatis dari SKU dan tanggal expired"
                                }
                                className="max-w-40 tabular-nums text-xs"
                              />
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>

                          <td className="px-2 py-2">
                            {namedLot ? (
                              namedLot.expiryDate ? (
                                <Input
                                  aria-label={`Expired ${product?.name ?? ""}`}
                                  type="date"
                                  value={namedLot.expiryDate.slice(0, 10)}
                                  disabled
                                  className="max-w-36 text-xs"
                                />
                              ) : (
                                <span className="text-xs text-muted">—</span>
                              )
                            ) : describingLot && expiryRequired ? (
                              <Input
                                aria-label={`Expired ${product?.name ?? ""}`}
                                type="date"
                                required
                                aria-required
                                value={line.expiryDate}
                                onChange={(event) =>
                                  updateLine(index, {
                                    expiryDate: event.target.value,
                                  })
                                }
                                // No red border while it is merely empty: a row
                                // that has just been added has not been got
                                // wrong yet. The asterisk on the column header
                                // says it is required, the note under the table
                                // says why, and `validate` names the row by
                                // product if a save is attempted without it.
                                className="max-w-36 text-xs"
                              />
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>

                          <td className="px-2 py-2 text-right tabular-nums text-xs">
                            {isDecimal(line.qty) &&
                            isDecimal(costOf(line, consignment))
                              ? formatMoney(
                                  multiplyDecimals(
                                    line.qty,
                                    costOf(line, consignment),
                                  ),
                                )
                              : "—"}
                          </td>

                          <td className="px-2 py-2 text-right">
                            <UIButton
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-danger"
                              onClick={() =>
                                setLines((prev) =>
                                  prev.filter((_, i) => i !== index),
                                )
                              }
                            >
                              Hapus
                            </UIButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Sized to its label, left-aligned, like the same button under the
                  transfer form's, the opname sheet's and the opening stock
                  document's tables. */}
              <div className="mt-4 border-t border-border/60 pt-3">
                <UIButton
                  type="button"
                  variant="secondary"
                  onClick={() => setPicking(true)}
                  disabled={saving || pickerBlocker !== null}
                >
                  + Tambah produk
                </UIButton>
                {/* Reachable with rows already on the form: changing the branch
                    clears the warehouse under them. The rows survive that — see
                    `clearBatchChoices` — but nothing more may be added until a
                    destination is named again. */}
                {pickerBlocker && (
                  <p className="mt-2 text-xs text-muted">{pickerBlocker}</p>
                )}
              </div>
            </>
          )}

          {/* Says the rule ONCE, above the row-level marks, because the two fields
              changed places: the code used to be mandatory and the date easy to
              miss, and a clerk who learned the old form would otherwise read the
              empty batch box as the thing blocking them. */}
          {lines.some((line) =>
            needsLot(productById.get(line.productId), consignment),
          ) && (
            <p className="mt-3 text-xs text-muted">
              {anyLotPicked && (
                <>
                  Kalau barang ini <b>batch-nya sudah ada</b> di gudang tujuan,
                  pilih batch itu — stoknya bertambah di lot yang sama, bukan
                  bikin lot kembar. Kalau memang kiriman baru, pilih{" "}
                  <b>+ Batch baru</b>.{" "}
                </>
              )}
              Batch baru untuk produk berkedaluwarsa <b>wajib</b> punya tanggal
              expired — FEFO menjual lot terdekat lebih dulu, dan tanpa tanggal
              urutannya tidak ada. <b>Kode batch boleh kosong</b>: kalau
              supplier tidak mencetak nomor lot, sistem memakai{" "}
              <span className="tabular-nums">SKU:tanggal-expired</span>.
            </p>
          )}

          {/* A duplicate is reported the moment it exists, not on submit: it blocks
              the preview too, so waiting for a save attempt would leave the panels
              silently empty with nothing on screen explaining why. */}
          {duplicateProductId !== null ? (
            <p role="alert" className="mt-3 text-xs text-danger">
              {duplicateMessage(productById.get(duplicateProductId)?.name)}
            </p>
          ) : (
            fieldErrors.lines && (
              <p role="alert" className="mt-3 text-xs text-danger">
                {fieldErrors.lines}
              </p>
            )
          )}
        </Card>

        {/* --------------------------------------------------- what will happen */}
        {previewError && <Alert variant="error">{previewError}</Alert>}

        {previewEnabled && previewLoading && !preview && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Menghitung dampak penerimaan…
          </div>
        )}

        {/* THE TWO PANELS THAT USED TO SIT HERE ARE GONE — the weighted-average
            arithmetic (`HppStrip`, one strip per product) and the automatic
            journal (`JournalPreview`). Both are still computed by
            `/goods-receipts/preview`, which is what the totals below are read
            from, so nothing about WHAT is posted changed: only what this screen
            shows while it is being typed. The receipt's own detail page still
            carries the journal after it is saved. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          {/* A LOT IS A BATCH in the shop's language, so the card says batch —
              `isNewBatch` and `batchCode` are the API's words for the same
              thing, and the screen should use the counter's.

              IT NAMES BOTH OUTCOMES, because a delivery may now join a lot
              instead of opening one, and "dibuat" alone would leave the joined
              rows with nowhere to be listed — the panel would say "tidak ada
              batch baru" over a receipt that is about to move stock into three
              of them. */}
          <Card title="Batch yang akan dibuat / ditambah">
            {lotMovements.length > 0 ? (
              <ul className="flex flex-col gap-1 text-sm">
                {lotMovements.map((movement, index) => (
                  <li key={index} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {productById.get(movement.productId)?.name ??
                        movement.productId}
                    </span>
                    <span className="tabular-nums text-xs text-muted">
                      {movement.batchCode ?? "—"}
                      {movement.batchExpiryDate &&
                        ` · exp ${movement.batchExpiryDate.slice(0, 10)}`}
                    </span>
                    {/* WHICH OF THE TWO, said per row rather than by splitting
                        the card in half: the rows are read as one list of "where
                        the goods land", and two short lists under two headings
                        make the reader do the merging. */}
                    <Badge variant="outline" className="text-[10px]">
                      {movement.isNewBatch ? "baru" : "gabung"}
                    </Badge>
                    <span className="ml-auto tabular-nums text-xs">
                      {formatQty(movement.qty)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              // Says WHY it is empty, like JournalPreview's `emptyReason` did:
              // an empty panel beside a filled-in form otherwise reads as
              // something still loading.
              <p className="py-2 text-sm text-muted">
                {preview
                  ? "Tidak ada batch. Batch hanya dipakai untuk produk yang melacak kedaluwarsa, dan untuk setiap baris konsinyasi."
                  : "Lengkapi barang yang diterima untuk melihat batch yang akan dibuat."}
              </p>
            )}
          </Card>

          <Card title="Ringkasan">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <b className="tabular-nums">
                  {formatMoney(preview?.total ?? localSubtotal)}
                </b>
              </div>
              {!consignment && (
                <div className="flex justify-between">
                  <span className="text-muted">PPN</span>
                  <b className="tabular-nums">
                    {formatMoney(
                      preview?.taxAmount ??
                        (isDecimal(taxAmount.trim()) ? taxAmount.trim() : "0"),
                    )}
                  </b>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-border pt-2">
                <b>Total</b>
                <b className="tabular-nums text-base">
                  {formatMoney(preview?.grandTotal ?? localSubtotal)}
                </b>
              </div>
              {preview ? (
                <p className="mt-1 text-xs text-muted">
                  Nomor sementara{" "}
                  <span className="tabular-nums">{preview.receiptNumber}</span> —
                  masih bisa berubah kalau ada penerimaan lain lebih dulu.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  Angka sementara, dihitung di browser. Yang mengikat adalah hasil
                  dari server setelah semua baris lengkap.
                </p>
              )}
              {consignment && (
                <p className="text-xs text-muted">
                  Nilai titipan — belum menjadi utang.
                </p>
              )}
            </div>
          </Card>
        </div>

        <TextField
          label="Catatan"
          name="notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="opsional"
          className="max-w-xl"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={saving || lines.length === 0}>
            {saving ? "Menyimpan…" : "Simpan & terima barang"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => router.push("/dashboard/purchasing/receipts")}
          >
            Batal
          </Button>
          <p className="text-xs text-muted">
            Sekali disimpan, penerimaan tidak bisa diedit atau dihapus.
          </p>
          </div>
      </form>
    </>
  );
}
