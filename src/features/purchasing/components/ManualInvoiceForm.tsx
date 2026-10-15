"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  Alert,
  Card,
  FilterSelect,
  FormActionBar,
  namedOptions,
  TextareaField,
  TextField,
} from "@/components";
import { SkuText } from "@/components/SkuText";
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
import { purchaseInvoiceService } from "@/services/purchaseInvoice.service";
import {
  formatMoney,
  isDecimal,
  isPositive,
  multiplyDecimals,
  sumDecimals,
  trimQty,
} from "@/utils/decimal";
import type {
  ManualPurchaseInvoiceInput,
  PurchaseInvoiceDetail,
} from "@/types/api";
import type { Product } from "@/types/inventory";
import { useStockCardLookups } from "@/features/inventory/hooks/useStockCardLookups";
import {
  useBranchScope,
  warehousesForBranch,
} from "@/features/inventory/hooks/useBranchScope";

import { useSupplierOptions } from "../hooks/useSupplierOptions";
import { ReceiptAddProductsDialog } from "./ReceiptAddProductsDialog";

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
  costPerUnit: string;
}

let lineSequence = 0;
const nextKey = () => `line-${(lineSequence += 1)}`;

/**
 * FAKTUR PEMBELIAN MANUAL — the supplier's bill typed in BEFORE any goods
 * arrive (14 October 2026, BO). Supplier, gudang tujuan, the products with
 * their quantity and price, PPN.
 *
 * NOTHING IS OWED YET. The payable is booked as goods are received, so this
 * invoice can be paid only once a goods receipt — made from it, on the
 * Penerimaan tab, copying these lines — has received something.
 *
 * EDITABLE UNTIL THAT RECEIPT EXISTS. Pass `invoice` to edit; once a receipt
 * is made from it the server locks the invoice, because its lines become the
 * receipt's.
 */
export function ManualInvoiceForm({
  invoice,
}: {
  invoice?: PurchaseInvoiceDetail;
}) {
  const router = useRouter();
  const editing = Boolean(invoice);

  const { suppliers, loading: suppliersLoading } = useSupplierOptions(
    invoice?.supplierId,
  );
  const lookups = useStockCardLookups();
  const scope = useBranchScope();

  const [supplierId, setSupplierId] = useState(invoice?.supplierId ?? "");
  const [pickedBranch, setPickedBranch] = useState(invoice?.branchId ?? "");
  const [warehouseId, setWarehouseId] = useState(invoice?.warehouseId ?? "");
  const [invoiceDate, setInvoiceDate] = useState(
    invoice ? invoice.invoiceDate.slice(0, 10) : today(),
  );
  const [invoiceNumber, setInvoiceNumber] = useState(
    invoice?.invoiceNumber ?? "",
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
      costPerUnit: trimQty(item.costPerUnit),
    })),
  );
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  const branchId = pickedBranch || scope.soleBranch;
  const scopedWarehouses = useMemo(
    () => warehousesForBranch(branchId, lookups.warehouses),
    [branchId, lookups.warehouses],
  );
  const effectiveWarehouseId =
    warehouseId ||
    (scopedWarehouses.length === 1 ? scopedWarehouses[0]._id : "");

  const subtotal = sumDecimals(
    lines.map((line) =>
      isDecimal(line.qty) && isDecimal(line.costPerUnit)
        ? multiplyDecimals(line.qty, line.costPerUnit)
        : "0",
    ),
  );
  const total = sumDecimals([
    subtotal,
    isDecimal(taxAmount) ? taxAmount : "0",
  ]);

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
    : !effectiveWarehouseId
      ? "gudang tujuan belum dipilih"
      : invoiceNumber.trim() === ""
        ? "nomor faktur belum diisi"
        : lines.length === 0
          ? "belum ada barang"
          : null;

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    for (const line of lines) {
      if (!isDecimal(line.qty) || !isPositive(line.qty)) {
        next[line.key] = "Qty harus lebih dari 0";
      } else if (
        !isDecimal(line.costPerUnit) ||
        line.costPerUnit.startsWith("-")
      ) {
        next[line.key] = "Harga harus angka, minimal 0";
      }
    }
    if (taxAmount !== "" && (!isDecimal(taxAmount) || taxAmount.startsWith("-"))) {
      next.taxAmount = "PPN harus angka, minimal 0";
    }
    return next;
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

    const input: ManualPurchaseInvoiceInput = {
      supplierId,
      warehouseId: effectiveWarehouseId,
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate,
      taxAmount: taxAmount === "" ? "0" : taxAmount,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      items: lines.map((line) => ({
        ...(line.invoiceItemId ? { invoiceItemId: line.invoiceItemId } : {}),
        productId: line.productId,
        qty: line.qty,
        costPerUnit: line.costPerUnit,
      })),
    };

    setSaving(true);
    try {
      const saved = invoice
        ? await purchaseInvoiceService.update(invoice._id, input)
        : await purchaseInvoiceService.create(input);
      swalToast(
        editing
          ? `Faktur ${saved.invoiceNumber} diperbarui.`
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

      <FormActionBar
        title={editing ? "Ubah faktur" : "Faktur pembelian"}
        meta={
          editing ? (
            <span className="tabular-nums">{invoice?.invoiceNumber}</span>
          ) : (
            "Manual — sebelum barang datang"
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
          <div className="sm:col-span-2">
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
              onChange={setSupplierId}
            />
          </div>
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
          <TextField
            label="No. faktur supplier"
            name="invoiceNumber"
            value={invoiceNumber}
            onChange={(event) => setInvoiceNumber(event.target.value)}
            disabled={saving}
            required
            placeholder="Sesuai dokumen dari supplier"
          />
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
        description="Satu produk satu baris. Setelah penerimaan barang dibuat dari faktur ini, daftar barang tidak bisa diubah lagi."
        action={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPicking(true)}
            disabled={saving}
          >
            <Plus className="size-4" /> Tambah produk
          </Button>
        }
      >
        {lines.length === 0 ? (
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
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Hapus</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => {
                  const error = errors[line.key];
                  const lineTotal =
                    isDecimal(line.qty) && isDecimal(line.costPerUnit)
                      ? multiplyDecimals(line.qty, line.costPerUnit)
                      : "0";

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
          <dl className="flex flex-col justify-end gap-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">PPN</dt>
              <dd className="tabular-nums">
                {formatMoney(isDecimal(taxAmount) ? taxAmount : "0")}
              </dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Total faktur</dt>
              <dd className="tabular-nums">{formatMoney(total)}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <Alert variant="info">
        Faktur ini belum menimbulkan utang. Utang ke supplier tercatat saat barang
        diterima — buat penerimaan barang dari faktur ini lewat tombol &quot;Buat
        penerimaan barang&quot; di halaman faktur.
      </Alert>
    </form>
  );
}
