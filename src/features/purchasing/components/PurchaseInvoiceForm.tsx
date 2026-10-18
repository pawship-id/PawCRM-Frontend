"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  Alert,
  Card,
  FilterSelect,
  FormActionBar,
  namedOptions,
  Spinner,
  TextareaField,
  TextField,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { goodsReceiptService } from "@/services/goodsReceipt.service";
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import {
  formatMoney,
  formatQty,
  isDecimal,
  isPositive,
  sumDecimals,
  trimQty,
} from "@/utils/decimal";
import type {
  CreatePurchaseInvoiceInput,
  GoodsReceiptDetail,
  InvoiceDiscountMode,
  ManualPurchaseInvoiceInput,
  PurchaseInvoiceChargeInput,
  PurchaseInvoiceDetail,
} from "@/types/api";
import type { Product } from "@/types/inventory";
import { SkuText } from "@/components/SkuText";
import { useStockCardLookups } from "@/features/inventory/hooks/useStockCardLookups";
import {
  useBranchScope,
  warehousesForBranch,
} from "@/features/inventory/hooks/useBranchScope";

import { useExpenseAccountOptions } from "../hooks/useExpenseAccountOptions";
import { useReceiptLots } from "../hooks/useReceiptLots";
import { useSupplierOptions } from "../hooks/useSupplierOptions";
import { useUninvoicedReceipts } from "../hooks/useUninvoicedReceipts";
import { mergeReceiptLines, pricePurchaseInvoice } from "../purchaseInvoicePricing";
import { accountLabel, InvoiceChargeRows, type ChargeDraft } from "./InvoiceChargeRows";
import { ReceiptAddProductsDialog } from "./ReceiptAddProductsDialog";
import {
  UninvoicedReceiptsDialog,
  type ReceiptChoice,
} from "./UninvoicedReceiptsDialog";
import { prefetchProductCandidates } from "@/features/inventory/hooks/useProductCandidates";

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

interface LineDraft {
  key: string;
  invoiceItemId?: string;
  productId: string;
  name: string;
  sku: string | null;
  unit: string | null;
  qty: string;
  /** The price per unit AS TYPED — before discounts and charges. */
  costPerUnit: string;
  /** This line's own discount, as typed (16 October 2026, BO). */
  discountMode: InvoiceDiscountMode;
  discountValue: string;
}

let lineSequence = 0;
const nextKey = () => `line-${(lineSequence += 1)}`;

/** A typed number, or "0" while it is not one yet — for the live totals. */
const numberOr0 = (value: string) => (isDecimal(value.trim()) ? value.trim() : "0");

/**
 * CATAT FAKTUR SUPPLIER — ONE FORM for both ways a bill arrives (16 October
 * 2026, BO; it replaced a manual form and a separate "faktur dari penerimaan"
 * form, two links apart):
 *
 *   MANUAL — the bill arrives before the goods. Supplier, gudang tujuan, the
 *   products with their quantity and price, PPN, discounts and "biaya lain".
 *   Nothing is owed yet: the payable is booked as goods are received, through
 *   a goods receipt made from this invoice. Editable until that receipt
 *   exists (pass `invoice`); then the server locks it.
 *
 *   FROM RECEIPTS — the goods already came. Picking the supplier looks up its
 *   deliveries still waiting for a bill and, when there are any, offers them
 *   in a modal; one or more of ONE cabang and ONE gudang are billed on one
 *   invoice, their lines merged per product. The lines and PPN are the
 *   receipts' and read-only here — the payable is already on the books at
 *   their numbers — so there is no invoice discount, and a "biaya lain" can
 *   only go to an expense account.
 *
 * `receiptId` (`?receipt=` from a receipt's "Catat faktur supplier") opens
 * the form on that receipt and its supplier, without forcing the modal open.
 *
 * "BIAYA LAIN" CHOOSE WHERE THEY GO (16 October 2026, BO): "Ke barang" folds
 * the charge into each line's HPP, as before; "Ke beban" posts it to an
 * expense account and adds it to the bill after PPN.
 */
export function PurchaseInvoiceForm({
  invoice,
  receiptId: openedFromId,
}: {
  invoice?: PurchaseInvoiceDetail;
  receiptId?: string;
}) {
  const router = useRouter();
  const editing = Boolean(invoice);

  /*
    OPENED FROM A RECEIPT'S PAGE: that receipt is read by id — it may sit
    beyond the first page of the supplier's list — and chosen, with its
    supplier.
  */
  const [openedFrom, setOpenedFrom] = useState<GoodsReceiptDetail | null>(null);
  const [openedFromError, setOpenedFromError] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState(invoice?.supplierId ?? "");
  const { suppliers, loading: suppliersLoading } = useSupplierOptions(
    invoice?.supplierId ?? openedFrom?.supplierId,
  );
  const lookups = useStockCardLookups();
  const scope = useBranchScope();
  const expenseAccounts = useExpenseAccountOptions();
  const uninvoiced = useUninvoicedReceipts(editing ? "" : supplierId);

  const [mode, setMode] = useState<"manual" | "receipts">("manual");
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([]);
  const [receiptDetails, setReceiptDetails] = useState<
    Record<string, GoodsReceiptDetail>
  >({});
  const [receiptDetailsError, setReceiptDetailsError] = useState<string | null>(
    null,
  );
  /** The supplier whose receipts were already offered — never offered twice. */
  const [promptedFor, setPromptedFor] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [pickedBranch, setPickedBranch] = useState(invoice?.branchId ?? "");
  const [warehouseId, setWarehouseId] = useState(invoice?.warehouseId ?? "");
  const [invoiceDate, setInvoiceDate] = useState(
    invoice ? invoice.invoiceDate.slice(0, 10) : today(),
  );
  // The VENDOR's number — optional. Ours is allocated by the server on save.
  const [invoiceNumber, setInvoiceNumber] = useState(
    invoice?.supplierInvoiceNumber ?? "",
  );
  const [taxAmount, setTaxAmount] = useState(
    invoice && invoice.taxAmount ? trimQty(invoice.taxAmount) : "",
  );
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() =>
    (invoice?.items ?? []).map((item) => ({
      key: nextKey(),
      invoiceItemId: item.invoiceItemId,
      productId: item.productId,
      name: item.productName ?? item.name,
      sku: item.productSku,
      unit: item.productUnit,
      qty: trimQty(item.qty),
      // The TYPED price — `costPerUnit` on the bill is the net unit cost.
      costPerUnit: trimQty(item.listPrice ?? item.costPerUnit),
      discountMode: item.discount?.mode ?? "percent",
      discountValue: item.discount ? trimQty(item.discount.value) : "",
    })),
  );
  const [invoiceDiscountMode, setInvoiceDiscountMode] =
    useState<InvoiceDiscountMode>(invoice?.invoiceDiscount?.mode ?? "percent");
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState(
    invoice?.invoiceDiscount ? trimQty(invoice.invoiceDiscount.value) : "",
  );
  const [charges, setCharges] = useState<ChargeDraft[]>(() =>
    (invoice?.otherCharges ?? []).map((charge) => ({
      key: nextKey(),
      label: charge.label,
      amount: trimQty(charge.amount),
      // Charges saved before the toggle existed went to the goods.
      allocation: charge.allocation ?? "goods",
      accountId: charge.accountId ?? "",
    })),
  );
  const [picking, setPicking] = useState(false);
  // Fetched as the form opens, so "+ Tambah produk" opens on a list that is
  // already here instead of a spinner — see prefetchProductCandidates.
  useEffect(() => {
    prefetchProductCandidates({ isConsignment: false });
  }, []);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!openedFromId) return;
    let active = true;
    goodsReceiptService
      .getById(openedFromId)
      .then((receipt) => {
        if (!active) return;
        setOpenedFrom(receipt);
        if (receipt.invoiceId || receipt.purchaseType === "konsinyasi") return;
        setSupplierId(receipt.supplierId);
        setSelectedReceiptIds([receipt._id]);
        setReceiptDetails((current) => ({ ...current, [receipt._id]: receipt }));
        setMode("receipts");
        // Chosen already — the modal stays shut until somebody asks for it.
        setPromptedFor(receipt.supplierId);
      })
      .catch((err) => {
        if (!active) return;
        setOpenedFromError(
          err instanceof ApiError ? err.fullMessage : "Penerimaan tidak dapat dimuat.",
        );
      });
    return () => {
      active = false;
    };
  }, [openedFromId]);

  /*
    THE CHOSEN RECEIPTS' LINES. The list rows carry none, so each chosen
    receipt is read by id once; the merge is drawn from what has arrived.
  */
  const missingKey = selectedReceiptIds
    .filter((id) => !receiptDetails[id])
    .join(",");
  useEffect(() => {
    if (!missingKey) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReceiptDetailsError(null);
    Promise.all(missingKey.split(",").map((id) => goodsReceiptService.getById(id)))
      .then((loaded) => {
        if (!active) return;
        setReceiptDetails((current) => {
          const next = { ...current };
          for (const receipt of loaded) next[receipt._id] = receipt;
          return next;
        });
      })
      .catch((err) => {
        if (!active) return;
        setReceiptDetailsError(
          err instanceof ApiError
            ? err.fullMessage
            : "Rincian penerimaan tidak dapat dimuat.",
        );
      });
    return () => {
      active = false;
    };
  }, [missingKey]);

  // Consignment is billed when it sells, never on a purchase invoice.
  const supplierOptions = useMemo(
    () =>
      namedOptions(
        suppliers.filter(
          (supplier) =>
            Boolean(supplier) &&
            supplier.type !== "konsinyasi" &&
            (supplier.isActive !== false || supplier._id === supplierId),
        ),
      ),
    [suppliers, supplierId],
  );

  /** What the modal offers — the supplier's list, plus the receipt opened from. */
  const receiptChoices = useMemo<ReceiptChoice[]>(() => {
    const listed: ReceiptChoice[] =
      uninvoiced.loadedFor === supplierId ? uninvoiced.receipts : [];
    if (
      openedFrom &&
      openedFrom.supplierId === supplierId &&
      !openedFrom.invoiceId &&
      !listed.some((row) => row._id === openedFrom._id)
    ) {
      return [openedFrom, ...listed];
    }
    return listed;
  }, [uninvoiced.loadedFor, uninvoiced.receipts, supplierId, openedFrom]);

  const fromReceipts = !editing && mode === "receipts";
  const hasReceiptsToOffer = !editing && receiptChoices.length > 0;
  // OFFERED ONCE PER SUPPLIER, as soon as its list answers with something.
  const showPicker =
    pickerOpen ||
    (hasReceiptsToOffer &&
      uninvoiced.loadedFor === supplierId &&
      promptedFor !== supplierId);

  function closePicker() {
    setPickerOpen(false);
    setPromptedFor(supplierId);
  }

  function chooseManual() {
    closePicker();
    setMode("manual");
    setSelectedReceiptIds([]);
  }

  function chooseReceipts(ids: string[]) {
    closePicker();
    setMode("receipts");
    setSelectedReceiptIds(ids);
    // From receipts a charge can only go to an expense account.
    setCharges((current) =>
      current.map((charge) => ({ ...charge, allocation: "expense" })),
    );
  }

  function pickSupplier(value: string) {
    if (value === supplierId) return;
    setSupplierId(value);
    // Another vendor's deliveries cannot be billed on this one's invoice.
    setSelectedReceiptIds([]);
    setMode("manual");
  }

  const selectedDetails = selectedReceiptIds
    .map((id) => receiptDetails[id])
    .filter((receipt): receipt is GoodsReceiptDetail => Boolean(receipt));
  const detailsLoading =
    fromReceipts &&
    selectedDetails.length < selectedReceiptIds.length &&
    !receiptDetailsError;
  const merged = mergeReceiptLines(selectedDetails);
  // The lots the merged lines name, for their codes.
  const lots = useReceiptLots(
    merged.lines
      .map((line) => line.batchId)
      .filter((id): id is string => id !== null),
  );
  // Cabang & gudang are the receipts' — all of them share one of each.
  const firstReceipt: ReceiptChoice | undefined =
    receiptChoices.find((row) => selectedReceiptIds.includes(row._id)) ??
    selectedDetails[0];

  const branchId = pickedBranch || scope.soleBranch;
  const scopedWarehouses = useMemo(
    () => warehousesForBranch(branchId, lookups.warehouses),
    [branchId, lookups.warehouses],
  );
  const effectiveWarehouseId =
    warehouseId ||
    (scopedWarehouses.length === 1 ? scopedWarehouses[0]._id : "");

  const pricing = pricePurchaseInvoice(
    fromReceipts
      ? []
      : lines.map((line) => ({
          qty: numberOr0(line.qty),
          price: numberOr0(line.costPerUnit),
          discount: { mode: line.discountMode, value: numberOr0(line.discountValue) },
        })),
    fromReceipts
      ? { mode: "amount", value: "0" }
      : { mode: invoiceDiscountMode, value: numberOr0(invoiceDiscountValue) },
    charges.map((charge) => ({
      amount: numberOr0(charge.amount),
      allocation: fromReceipts ? "expense" : charge.allocation,
    })),
    fromReceipts ? merged.taxAmount : numberOr0(taxAmount),
  );
  const subtotal = fromReceipts ? merged.subtotal : pricing.subtotal;
  const shownTax = fromReceipts ? merged.taxAmount : numberOr0(taxAmount);
  const total = fromReceipts
    ? sumDecimals([merged.subtotal, pricing.total])
    : pricing.total;
  const expenseRows = charges.filter(
    (charge) =>
      (fromReceipts || charge.allocation === "expense") &&
      isPositive(numberOr0(charge.amount)),
  );

  function patchCharge(key: string, patch: Partial<ChargeDraft>) {
    setCharges((current) =>
      current.map((charge) =>
        charge.key === key ? { ...charge, ...patch } : charge,
      ),
    );
  }

  function addProducts(products: Product[]) {
    setLines((current) => [
      ...current,
      ...products.map((product) => ({
        key: nextKey(),
        productId: product._id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        qty: "1",
        // Seeded with the current average cost — a starting point the clerk
        // overwrites with the price on the supplier's bill.
        costPerUnit: trimQty(product.hppAvg ?? "0"),
        discountMode: "percent" as const,
        discountValue: "",
      })),
    ]);
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  const blockedReason = !supplierId
    ? "supplier belum dipilih"
    : fromReceipts
      ? selectedReceiptIds.length === 0
        ? "penerimaan belum dipilih"
        : detailsLoading
          ? "rincian penerimaan masih dimuat"
          : null
      : !effectiveWarehouseId
        ? "gudang tujuan belum dipilih"
        : lines.length === 0
          ? "belum ada barang"
          : null;

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!fromReceipts) {
      for (const line of lines) {
        if (!isDecimal(line.qty) || !isPositive(line.qty)) {
          next[line.key] = "Qty harus lebih dari 0";
        } else if (
          !isDecimal(line.costPerUnit) ||
          line.costPerUnit.startsWith("-")
        ) {
          next[line.key] = "Harga harus angka, minimal 0";
        } else if (
          line.discountValue.trim() !== "" &&
          (!isDecimal(line.discountValue.trim()) ||
            line.discountValue.trim().startsWith("-"))
        ) {
          next[line.key] = "Diskon harus angka, minimal 0";
        } else if (
          line.discountMode === "percent" &&
          Number(line.discountValue || "0") > 100
        ) {
          next[line.key] = "Diskon tidak boleh lebih dari 100%";
        }
      }
      const billDiscount = invoiceDiscountValue.trim();
      if (
        billDiscount !== "" &&
        (!isDecimal(billDiscount) ||
          billDiscount.startsWith("-") ||
          (invoiceDiscountMode === "percent" && Number(billDiscount) > 100))
      ) {
        next.invoiceDiscount = "Diskon faktur harus angka 0–100% atau nominal minimal 0";
      }
      if (taxAmount !== "" && (!isDecimal(taxAmount) || taxAmount.startsWith("-"))) {
        next.taxAmount = "PPN harus angka, minimal 0";
      }
    }
    charges.forEach((charge, index) => {
      if (charge.label.trim() === "" || !isPositive(charge.amount || "0")) {
        next[charge.key] = `Biaya lain ${index + 1}: isi nama dan nominal lebih dari 0`;
      } else if (
        (fromReceipts || charge.allocation === "expense") &&
        !charge.accountId
      ) {
        next[charge.key] = `Biaya lain ${index + 1}: pilih akun bebannya`;
      }
    });
    return next;
  }

  function chargesPayload(): PurchaseInvoiceChargeInput[] {
    return charges.map((charge) => {
      const allocation = fromReceipts ? "expense" : charge.allocation;
      return {
        label: charge.label.trim(),
        amount: charge.amount,
        allocation,
        ...(allocation === "expense" ? { accountId: charge.accountId } : {}),
      };
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || blockedReason) return;

    const found = validate();
    setErrors(found);
    const count = Object.keys(found).length;
    if (count > 0) {
      swalToast(
        count === 1
          ? Object.values(found)[0]
          : `Ada ${count} isian yang belum benar — lihat tanda merah di formulir.`,
        "error",
        6000,
      );
      return;
    }

    setSaving(true);
    try {
      let saved: PurchaseInvoiceDetail;
      if (fromReceipts) {
        // No amounts and no lines: the server copies them from the receipts,
        // so the bill and the deliveries cannot disagree.
        const input: CreatePurchaseInvoiceInput = {
          supplierId,
          goodsReceiptIds: selectedReceiptIds,
          ...(invoiceNumber.trim()
            ? { supplierInvoiceNumber: invoiceNumber.trim() }
            : {}),
          invoiceDate,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(charges.length > 0 ? { otherCharges: chargesPayload() } : {}),
        };
        saved = await purchaseInvoiceService.create(input);
      } else {
        const input: ManualPurchaseInvoiceInput = {
          supplierId,
          warehouseId: effectiveWarehouseId,
          supplierInvoiceNumber: invoiceNumber.trim(),
          invoiceDate,
          taxAmount: taxAmount === "" ? "0" : taxAmount,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          // Null clears a discount on an edit; an empty list clears the charges.
          invoiceDiscount:
            invoiceDiscountValue.trim() && isPositive(invoiceDiscountValue.trim())
              ? { mode: invoiceDiscountMode, value: invoiceDiscountValue.trim() }
              : null,
          otherCharges: chargesPayload(),
          items: lines.map((line) => ({
            ...(line.invoiceItemId ? { invoiceItemId: line.invoiceItemId } : {}),
            productId: line.productId,
            qty: line.qty,
            costPerUnit: line.costPerUnit,
            discount:
              line.discountValue.trim() && isPositive(line.discountValue.trim())
                ? { mode: line.discountMode, value: line.discountValue.trim() }
                : null,
          })),
        };
        saved = invoice
          ? await purchaseInvoiceService.update(invoice._id, input)
          : await purchaseInvoiceService.create(input);
      }
      swalToast(
        editing
          ? `Faktur ${saved.invoiceNumber} diperbarui.`
          : fromReceipts
            ? `Faktur ${saved.invoiceNumber} dicatat.`
            : `Faktur ${saved.invoiceNumber} dicatat. Buat penerimaan barang dari faktur ini saat barangnya datang.`,
      );
      router.replace(`/dashboard/purchasing/payables/${saved._id}`);
    } catch (err) {
      swalToast(
        err instanceof ApiError ? err.fullMessage : "Terjadi kesalahan. Coba lagi.",
        "error",
        6000,
      );
      setSaving(false);
    }
  }

  if (openedFromId && openedFromError) {
    return <Alert variant="error">{openedFromError}</Alert>;
  }
  if (openedFromId && !openedFrom) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat penerimaan…
      </div>
    );
  }
  if (
    openedFrom &&
    (openedFrom.invoiceId || openedFrom.purchaseType === "konsinyasi")
  ) {
    return (
      <Alert variant="info">
        {openedFrom.invoiceId
          ? `Penerimaan ${openedFrom.receiptNumber} sudah punya faktur.`
          : `Penerimaan ${openedFrom.receiptNumber} adalah konsinyasi — ditagih saat barang terjual, bukan lewat faktur.`}{" "}
        <Link
          href={
            openedFrom.invoiceId
              ? `/dashboard/purchasing/payables/${openedFrom.invoiceId}`
              : `/dashboard/purchasing/receipts/${openedFrom._id}`
          }
          className="font-semibold underline"
        >
          {openedFrom.invoiceId ? "Lihat faktur" : "Kembali ke penerimaan"}
        </Link>
      </Alert>
    );
  }

  const pickReceiptsButton = (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={saving}
      onClick={() => setPickerOpen(true)}
    >
      Pilih penerimaan
    </Button>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {picking && (
        <ReceiptAddProductsDialog
          existingProductIds={lines.map((line) => line.productId)}
          consignment={false}
          onAdd={addProducts}
          onClose={() => setPicking(false)}
        />
      )}
      {showPicker && (
        <UninvoicedReceiptsDialog
          receipts={receiptChoices}
          initialSelected={selectedReceiptIds}
          loading={uninvoiced.loading}
          truncated={uninvoiced.truncated}
          onManual={chooseManual}
          onConfirm={chooseReceipts}
          onClose={closePicker}
        />
      )}

      <FormActionBar
        title={
          editing
            ? "Ubah faktur"
            : fromReceipts
              ? "Faktur dari penerimaan"
              : "Faktur pembelian"
        }
        meta={
          editing ? (
            <span className="tabular-nums">{invoice?.invoiceNumber}</span>
          ) : (
            "No. otomatis"
          )
        }
        submitLabel="Simpan faktur"
        submitting={saving}
        disabled={Boolean(blockedReason)}
        blockedReason={blockedReason}
        cancelHref={
          invoice
            ? `/dashboard/purchasing/payables/${invoice._id}`
            : "/dashboard/purchasing/payables"
        }
      />

      <Card>
        {/* ROW BY ROW (16 October 2026, on request): Tanggal faktur ·
            Supplier, then Cabang · Gudang, then the vendor's number, then
            the note. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Tanggal faktur"
            name="invoiceDate"
            type="date"
            value={invoiceDate}
            onChange={(event) => setInvoiceDate(event.target.value)}
            disabled={saving}
            required
            hint="Jatuh tempo dihitung dari tanggal ini + termin supplier."
          />
          <FilterSelect
            layout="form"
            label="Supplier"
            ariaLabel="Supplier"
            value={supplierId}
            options={supplierOptions}
            active={false}
            required
            searchable
            placeholder={suppliersLoading ? "Memuat supplier…" : "Pilih supplier"}
            disabled={saving}
            onChange={pickSupplier}
          />
          {/* The way back to the modal while the supplier stays the same. */}
          {!fromReceipts && hasReceiptsToOffer && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-tint-info px-3 py-2 text-sm sm:col-span-2">
              <span>
                Supplier ini punya{" "}
                <span className="tabular-nums">{receiptChoices.length}</span>{" "}
                penerimaan yang belum ada fakturnya.
              </span>
              {pickReceiptsButton}
            </div>
          )}

          {fromReceipts ? (
            <>
              <TextField
                label="Cabang"
                name="receiptBranch"
                value={firstReceipt?.branchName ?? "—"}
                readOnly
              />
              <TextField
                label="Gudang"
                name="receiptWarehouse"
                value={firstReceipt?.warehouseName ?? "—"}
                readOnly
                hint="Mengikuti penerimaan yang dipilih."
              />
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-sm font-medium">Penerimaan</span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {selectedReceiptIds.map((id) => {
                    const row =
                      receiptChoices.find((one) => one._id === id) ??
                      receiptDetails[id];
                    return (
                      <Link
                        key={id}
                        href={`/dashboard/purchasing/receipts/${id}`}
                        className="text-sm font-semibold text-primary tabular-nums underline-offset-2 hover:underline"
                      >
                        {row?.receiptNumber ?? id}
                      </Link>
                    );
                  })}
                  {pickReceiptsButton}
                </div>
              </div>
            </>
          ) : (
            <>
              <FilterSelect
                layout="form"
                label="Cabang"
                ariaLabel="Cabang"
                value={branchId}
                options={namedOptions(scope.branches)}
                active={false}
                required
                placeholder={scope.loading ? "Memuat…" : "Pilih cabang"}
                disabled={saving}
                onChange={(value) => {
                  if (value === branchId) return;
                  setPickedBranch(value);
                  // The warehouse belongs to the old branch.
                  setWarehouseId("");
                }}
              />
              <FilterSelect
                layout="form"
                label="Gudang tujuan"
                ariaLabel="Gudang tujuan"
                value={effectiveWarehouseId}
                options={namedOptions(scopedWarehouses)}
                active={false}
                required
                placeholder={branchId === "" ? "Pilih cabang dulu" : "Pilih gudang"}
                disabled={saving || branchId === ""}
                onChange={setWarehouseId}
              />
            </>
          )}

          {/* Its own row — the other column left empty on purpose. */}
          <div className="sm:col-span-2 sm:grid sm:grid-cols-2 sm:gap-4">
            <TextField
              label="No. faktur supplier"
              name="invoiceNumber"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              disabled={saving}
              placeholder="opsional"
              hint="Nomor faktur dibuat otomatis oleh sistem. Isi nomor dari dokumen supplier kalau ada."
            />
          </div>
          <div className="sm:col-span-2">
            <TextareaField
              label="Keterangan"
              name="notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={saving}
            />
          </div>
        </div>
      </Card>

      <Card
        title="Barang"
        description={
          fromReceipts
            ? "Disalin dari penerimaan yang dipilih, digabung per produk. Tidak bisa diubah di sini."
            : "Satu produk satu baris. Setelah penerimaan barang dibuat dari faktur ini, daftar barang tidak bisa diubah lagi."
        }
        action={
          fromReceipts ? undefined : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPicking(true)}
              disabled={saving}
            >
              <Plus className="size-4" /> Tambah produk
            </Button>
          )
        }
      >
        {fromReceipts ? (
          receiptDetailsError ? (
            <Alert variant="error">{receiptDetailsError}</Alert>
          ) : detailsLoading ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted">
              <Spinner /> Memuat rincian barang…
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Harga beli</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merged.lines.map((line) => (
                    <TableRow key={`${line.productId}:${line.batchId ?? "-"}`}>
                      <TableCell>
                        <p className="text-sm font-medium">{line.name}</p>
                        <p className="text-xs text-muted tabular-nums">
                          <SkuText value={line.sku} fallback="—" />
                          {line.batchId && lots[line.batchId] && (
                            <>
                              {" · batch "}
                              {lots[line.batchId].batchCode}
                            </>
                          )}
                        </p>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatQty(line.qty)}
                        {line.unit && (
                          <span className="ml-1 text-muted">{line.unit}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatMoney(line.costPerUnit)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatMoney(line.subtotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )
        ) : lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Belum ada barang di faktur ini.{" "}
            <button
              type="button"
              className="font-semibold text-primary underline-offset-2 hover:underline"
              onClick={() => setPicking(true)}
            >
              Tambah yang pertama →
            </button>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produk</TableHead>
                  <TableHead className="w-32 text-right">Qty</TableHead>
                  <TableHead className="w-40 text-right">Harga beli</TableHead>
                  <TableHead className="w-48">Diskon</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Hapus</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => {
                  const error = errors[line.key];
                  const lineDiscount = pricing.lines[index]?.discount ?? "0";
                  const lineTotal = pricing.lines[index]?.net ?? "0";

                  return (
                    <TableRow
                      key={line.key}
                      className={cn(error && "bg-tint-danger/40")}
                    >
                      <TableCell>
                        <p className="text-sm font-medium">{line.name}</p>
                        <p className="text-xs text-muted tabular-nums">
                          <SkuText value={line.sku} fallback="—" />
                          {line.unit ? ` · ${line.unit}` : ""}
                        </p>
                        {error && (
                          <p className="mt-1 text-xs font-semibold text-danger">
                            {error}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="decimal"
                          aria-label={`Qty ${line.name}`}
                          value={line.qty}
                          disabled={saving}
                          onChange={(event) =>
                            updateLine(line.key, { qty: event.target.value.trim() })
                          }
                          className="h-9 text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          inputMode="decimal"
                          aria-label={`Harga beli ${line.name}`}
                          value={line.costPerUnit}
                          disabled={saving}
                          onChange={(event) =>
                            updateLine(line.key, {
                              costPerUnit: event.target.value.trim(),
                            })
                          }
                          className="h-9 text-right tabular-nums"
                        />
                      </TableCell>
                      <TableCell>
                        {/* PERCENT OR RUPIAH, as on the till and the sales
                            invoice — measured against qty × harga. */}
                        <div className="flex gap-1">
                          <select
                            aria-label={`Jenis diskon ${line.name}`}
                            className="h-9 w-16 shrink-0 rounded-md border border-border bg-surface px-2 text-sm"
                            value={line.discountMode}
                            disabled={saving}
                            onChange={(event) =>
                              updateLine(line.key, {
                                discountMode: event.target
                                  .value as InvoiceDiscountMode,
                              })
                            }
                          >
                            <option value="percent">%</option>
                            <option value="amount">Rp</option>
                          </select>
                          <Input
                            inputMode="decimal"
                            aria-label={`Diskon ${line.name}`}
                            placeholder="0"
                            value={line.discountValue}
                            disabled={saving}
                            onChange={(event) =>
                              updateLine(line.key, {
                                discountValue: event.target.value.trim(),
                              })
                            }
                            className="h-9 text-right tabular-nums"
                          />
                        </div>
                        {lineDiscount !== "0.0000" && (
                          <span className="mt-1 block text-xs text-success tabular-nums">
                            −{formatMoney(lineDiscount)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatMoney(lineTotal)}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9"
                          aria-label={`Hapus ${line.name}`}
                          disabled={saving}
                          onClick={() =>
                            setLines((current) =>
                              current.filter((item) => item.key !== line.key),
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {fromReceipts ? (
            <p className="text-sm text-muted">
              Nilai barang dan PPN mengikuti penerimaannya — utangnya sudah
              tercatat saat barang diterima. Kalau tagihan supplier berbeda,
              selesaikan lewat retur pembelian.
            </p>
          ) : (
            <TextField
              label="PPN masukan"
              name="taxAmount"
              inputMode="decimal"
              value={taxAmount}
              onChange={(event) => setTaxAmount(event.target.value.trim())}
              error={errors.taxAmount}
              disabled={saving}
              placeholder="0"
              hint="Dicatat ke akun PPN masukan sebanding barang yang diterima."
            />
          )}
          <dl className="flex flex-col justify-end gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">
                {fromReceipts ? "Subtotal barang" : "Subtotal"}
              </dt>
              <dd className="tabular-nums">
                {formatMoney(
                  fromReceipts
                    ? merged.subtotal
                    : sumDecimals(pricing.lines.map((line) => line.net)),
                )}
              </dd>
            </div>
            {!fromReceipts && (
              /* THE BILL'S DISCOUNT, against the lines after their own. */
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted">Diskon faktur</dt>
                <dd className="flex flex-col items-end gap-1">
                  <div className="flex gap-1">
                    <select
                      aria-label="Jenis diskon faktur"
                      className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                      value={invoiceDiscountMode}
                      disabled={saving}
                      onChange={(event) =>
                        setInvoiceDiscountMode(
                          event.target.value as InvoiceDiscountMode,
                        )
                      }
                    >
                      <option value="percent">%</option>
                      <option value="amount">Rp</option>
                    </select>
                    <Input
                      aria-label="Diskon faktur"
                      className="h-9 w-28 text-right tabular-nums"
                      inputMode="decimal"
                      placeholder="0"
                      value={invoiceDiscountValue}
                      disabled={saving}
                      onChange={(event) =>
                        setInvoiceDiscountValue(event.target.value.trim())
                      }
                    />
                  </div>
                  {pricing.invoiceDiscount !== "0.0000" && (
                    <span className="text-xs text-success tabular-nums">
                      −{formatMoney(pricing.invoiceDiscount)}
                    </span>
                  )}
                  {errors.invoiceDiscount && (
                    <span className="text-xs font-semibold text-danger">
                      {errors.invoiceDiscount}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {/* "BIAYA LAIN" — one row each, as on the till, each saying
                where it goes. */}
            <InvoiceChargeRows
              charges={charges}
              onAdd={(fields) =>
                setCharges((current) => [
                  ...current,
                  { key: nextKey(), ...fields },
                ])
              }
              onPatch={patchCharge}
              onRemove={(key) =>
                setCharges((current) => current.filter((one) => one.key !== key))
              }
              expenseOnly={fromReceipts}
              accounts={expenseAccounts.accounts}
              accountsLoading={expenseAccounts.loading}
              errors={errors}
              disabled={saving}
            />
            {!fromReceipts && (
              <div className="flex justify-between border-t border-border pt-2">
                <dt className="text-muted">Total sebelum PPN</dt>
                <dd className="tabular-nums">{formatMoney(subtotal)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted">PPN</dt>
              <dd className="tabular-nums">{formatMoney(shownTax)}</dd>
            </div>
            {/* EXPENSE CHARGES COME AFTER PPN — they are not the goods. */}
            {expenseRows.map((charge) => (
              <div key={charge.key} className="flex justify-between gap-4">
                <dt className="text-muted">
                  {charge.label.trim() || "Biaya lain"} · beban{" "}
                  {accountLabel(charge.accountId, expenseAccounts.accounts) ??
                    "(akun belum dipilih)"}
                </dt>
                <dd className="tabular-nums">{formatMoney(charge.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>Total tagihan</dt>
              <dd className="tabular-nums">{formatMoney(total)}</dd>
            </div>
          </dl>
        </div>
      </Card>
    </form>
  );
}
