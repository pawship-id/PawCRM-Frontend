"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import {
  Alert,
  FilterSelect,
  Spinner,
  TextField,
  namedOptions,
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
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { petService } from "@/services/pet.service";
import { formatMoney, trimDecimal, trimQty } from "@/utils/decimal";
import { AXIS_LABEL, priceForPet } from "@/utils/serviceVariant";
import type {
  CustomerInvoiceDetail,
  InvoiceDiscountMode,
  Pet,
  UpdateCustomerInvoiceInput,
} from "@/types/api";

import { useInvoiceLookups } from "../hooks/useInvoiceLookups";
import { previewInvoice } from "../invoicePreview";

/** A line as the editor holds it. */
interface EditLine {
  /** Stable across re-renders — a row's index moves when one above is removed. */
  key: string;
  /** The stored line this continues, or null for a line added here. */
  fromIndex: number | null;
  kind: "product" | "service";
  refId: string;
  name: string;
  sku: string | null;
  unitPrice: string;
  qty: string;
  discountMode: InvoiceDiscountMode;
  discountValue: string;
  /** Set on a NEW service line; a kept line keeps the animal it was billed for. */
  petId: string;
  petName: string | null;
  /** Billed from a booking — one per animal, so the quantity is fixed at 1. */
  booked: boolean;
}

/** Nobody has a hundred animals; this is a ceiling, not a page size. */
const MAX_PETS = 100;

const toDateInput = (iso: string) => iso.slice(0, 10);

let lineSeq = 0;
const nextKey = () => `baru-${(lineSeq += 1)}`;

/**
 * EDITING AN UNPAID INVOICE, inside its own Rincian card — the mockup's inline
 * edit, opened by "Ubah rincian".
 *
 * WHAT SAVING DOES, said beside the button rather than discovered afterwards:
 * the server reverses the current version's two journal entries and its stock,
 * then issues these lines as a new version — the number and the date stay. A
 * shop owner seeing a reversal pair appear in the ledger should already know why.
 *
 * WHAT CAN MOVE: quantities, discounts, lines added and taken off, the invoice
 * discount and the due date. WHAT CANNOT: the customer, the branch and the
 * date, which the number and the credit check are bound to.
 *
 * PRICES ARE NOT EDITABLE, deliberately, though the mockup draws an input there.
 * A kept line keeps the price it was billed at and a new line takes the
 * catalogue's — on screen and again on the server. A price a client can type is
 * a discount nobody approved, and the discount column already exists for the
 * ones somebody did.
 *
 * LOOKUPS LOAD ONLY WHEN EDITING STARTS, which is why this is behind a button
 * rather than inputs drawn on every unpaid invoice: the catalogue, the tenant's
 * tax rule and the customer's animals are three requests nobody reading the
 * invoice needs.
 *
 * THE TOTAL IS A PREVIEW, computed by `invoicePreview.ts` in the server's order.
 * The server prices everything again and is the authority.
 */
export function InvoiceEditor({
  invoice,
  onCancel,
  onSaved,
}: {
  invoice: CustomerInvoiceDetail;
  onCancel: () => void;
  onSaved: (updated: CustomerInvoiceDetail) => void;
}) {
  const lookups = useInvoiceLookups();

  const initialLines = useMemo<EditLine[]>(
    () =>
      (invoice.items ?? []).map((item, index) => ({
        key: `simpan-${index}`,
        fromIndex: index,
        kind: item.kind,
        refId: item.refId,
        name: item.name,
        sku: item.sku,
        unitPrice: item.unitPrice,
        qty: trimQty(item.qty),
        discountMode: item.discount?.mode ?? "percent",
        discountValue: item.discount ? trimDecimal(item.discount.value) : "",
        petId: item.petId ?? "",
        petName: item.petName,
        booked: Boolean(item.bookingId),
      })),
    [invoice.items],
  );

  const [lines, setLines] = useState<EditLine[]>(initialLines);
  const [picked, setPicked] = useState("");
  const [dueDate, setDueDate] = useState(toDateInput(invoice.dueDate));
  const [warehouseId, setWarehouseId] = useState(invoice.warehouseId ?? "");
  const [invoiceDiscountMode, setInvoiceDiscountMode] =
    useState<InvoiceDiscountMode>(invoice.invoiceDiscount?.mode ?? "percent");
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState(
    invoice.invoiceDiscount ? trimDecimal(invoice.invoiceDiscount.value) : "",
  );
  const [saving, setSaving] = useState(false);

  /*
    THE CUSTOMER'S ANIMALS, for a service line added here. BEST EFFORT AND
    SILENT WHEN IT FAILS — reading /api/pets takes `pets:read`, and the create
    form makes the same trade: without it no service can be added, and the
    blocking reason below says why.
  */
  const [pets, setPets] = useState<Pet[]>([]);

  useEffect(() => {
    if (!invoice.customerId) return;

    let active = true;

    petService
      .list({ customerId: invoice.customerId, isActive: true, limit: MAX_PETS })
      .then((result) => {
        if (active) setPets(result.items);
      })
      .catch(() => {
        if (active) setPets([]);
      });

    return () => {
      active = false;
    };
  }, [invoice.customerId]);

  const petOptions = useMemo(
    () => pets.map((pet) => ({ value: pet._id, label: pet.name })),
    [pets],
  );

  const catalogue = useMemo(
    () => [
      ...lookups.products.map((product) => ({
        value: `product:${product._id}`,
        label: product.sku ? `${product.sku} — ${product.name}` : product.name,
      })),
      ...lookups.services.map((service) => ({
        value: `service:${service._id}`,
        label: `${service.name} (jasa)`,
      })),
    ],
    [lookups.products, lookups.services],
  );

  /* The shelves of the invoice's branch, plus every central one. */
  const warehousesHere = useMemo(
    () =>
      lookups.warehouses.filter(
        (warehouse) =>
          !warehouse.defaultBranchId ||
          String(warehouse.defaultBranchId) === invoice.branchId,
      ),
    [lookups.warehouses, invoice.branchId],
  );

  const hasProductLine = lines.some((line) => line.kind === "product");
  const hasServiceLine = lines.some((line) => line.kind === "service");
  /*
    ASKED ONLY WHEN THE INVOICE SHIPPED NOTHING BEFORE. One that already moved
    stock keeps its warehouse: the reversal has to put its goods back on the
    shelf they came off.
  */
  const needsWarehouse = hasProductLine && !invoice.warehouseId;

  const preview = useMemo(
    () =>
      previewInvoice(
        lines.map((line) => ({
          qty: line.qty,
          unitPrice: line.unitPrice,
          discount: line.discountValue
            ? { mode: line.discountMode, value: line.discountValue }
            : null,
        })),
        invoiceDiscountValue
          ? { mode: invoiceDiscountMode, value: invoiceDiscountValue }
          : null,
        lookups.tax,
      ),
    [lines, invoiceDiscountMode, invoiceDiscountValue, lookups.tax],
  );

  function payload(): UpdateCustomerInvoiceInput {
    return {
      items: lines.map((line) => ({
        kind: line.kind,
        refId: line.refId,
        qty: line.qty,
        discount: line.discountValue
          ? { mode: line.discountMode, value: line.discountValue }
          : null,
        ...(line.fromIndex !== null ? { fromIndex: line.fromIndex } : {}),
        // A kept line's animal is the one it was billed for; only a new one
        // names one, and the server refuses a pet on a product line.
        ...(line.fromIndex === null && line.petId ? { petId: line.petId } : {}),
      })),
      invoiceDiscount: invoiceDiscountValue
        ? { mode: invoiceDiscountMode, value: invoiceDiscountValue }
        : null,
      dueDate: new Date(dueDate).toISOString(),
      ...(needsWarehouse && warehouseId ? { warehouseId } : {}),
    };
  }

  /*
    WHAT "UNCHANGED" MEANS: the payload the editor would send is the one it would
    have sent before anything was touched. Saving that would still reverse and
    re-issue two entries for nothing, so it is refused here with a sentence.
  */
  const untouched = useMemo(
    () =>
      JSON.stringify({
        items: initialLines.map((line) => ({
          kind: line.kind,
          refId: line.refId,
          qty: line.qty,
          discount: line.discountValue
            ? { mode: line.discountMode, value: line.discountValue }
            : null,
          fromIndex: line.fromIndex,
        })),
        invoiceDiscount: invoice.invoiceDiscount
          ? {
              mode: invoice.invoiceDiscount.mode,
              value: trimDecimal(invoice.invoiceDiscount.value),
            }
          : null,
        dueDate: new Date(toDateInput(invoice.dueDate)).toISOString(),
      }),
    [initialLines, invoice.invoiceDiscount, invoice.dueDate],
  );

  const blocking = (() => {
    if (lookups.loading) return "Sedang memuat katalog.";
    if (lines.length === 0) return "Faktur butuh minimal satu baris.";
    if (lines.some((line) => !line.qty || Number(line.qty) <= 0))
      return "Ada baris yang jumlahnya belum diisi.";
    if (!dueDate) return "Isi tanggal jatuh tempo.";
    if (needsWarehouse && !warehouseId)
      return "Pilih gudang — ada barang yang harus dikeluarkan.";
    if (lines.some((line) => line.kind === "service" && !line.petId)) {
      return petOptions.length === 0
        ? "Pelanggan ini belum punya hewan — daftarkan dulu di Master Data."
        : "Ada baris jasa yang belum dipilih hewannya.";
    }

    const unpriced = lines.find(
      (line) =>
        line.fromIndex === null &&
        line.kind === "service" &&
        line.petId &&
        line.unitPrice === "0",
    );

    if (unpriced) {
      const pet = pets.find((one) => one._id === unpriced.petId);
      const missing = priceForPet(
        lookups.services.find((one) => one._id === unpriced.refId),
        pet,
      ).missingAxis;

      return missing
        ? `Lengkapi ${AXIS_LABEL[missing]} ${pet?.name ?? "hewannya"} dulu — harga '${unpriced.name}' ditentukan dari situ.`
        : `'${unpriced.name}' belum punya harga untuk ${pet?.name ?? "hewan ini"}.`;
    }

    return null;
  })();

  function priceOf(line: Pick<EditLine, "kind" | "refId" | "petId">) {
    if (line.kind === "product") {
      const product = lookups.products.find((one) => one._id === line.refId);
      return String(product?.sellPrice ?? "0");
    }

    const service = lookups.services.find((one) => one._id === line.refId);
    const pet = pets.find((one) => one._id === line.petId);
    return priceForPet(service, pet).price ?? "0";
  }

  function addLine() {
    if (!picked) return;

    const [kind, refId] = picked.split(":") as ["product" | "service", string];
    const found =
      kind === "product"
        ? lookups.products.find((product) => product._id === refId)
        : lookups.services.find((service) => service._id === refId);

    if (!found) return;

    setLines((current) => [
      ...current,
      {
        key: nextKey(),
        fromIndex: null,
        kind,
        refId,
        name: found.name,
        sku:
          kind === "product" ? ((found as { sku?: string }).sku ?? null) : null,
        unitPrice: priceOf({ kind, refId, petId: "" }),
        qty: "1",
        discountMode: "percent",
        discountValue: "",
        petId: "",
        petName: null,
        booked: false,
      },
    ]);
    setPicked("");
  }

  function patchLine(key: string, patch: Partial<EditLine>) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        // Re-priced when a NEW service's animal changes — for a variant
        // service that IS the price.
        return patch.petId === undefined || line.fromIndex !== null
          ? next
          : { ...next, unitPrice: priceOf(next) };
      }),
    );
  }

  async function save() {
    if (blocking) return;

    const body = payload();

    if (
      JSON.stringify({
        items: body.items.map((item) => ({
          kind: item.kind,
          refId: item.refId,
          qty: item.qty,
          discount: item.discount ?? null,
          fromIndex: item.fromIndex ?? null,
        })),
        invoiceDiscount: body.invoiceDiscount ?? null,
        dueDate: body.dueDate,
      }) === untouched
    ) {
      swalToast("Belum ada yang diubah.");
      return;
    }

    setSaving(true);

    try {
      const updated = await customerInvoiceService.update(invoice._id, body);
      setSaving(false);
      onSaved(updated);
      swalToast(`${invoice.invoiceNumber} diperbarui.`);
    } catch (error) {
      // Eight seconds: a short shelf or a payment that landed first is an
      // instruction, not an acknowledgement.
      swalToast(
        error instanceof ApiError
          ? error.fullMessage
          : "Perubahan gagal disimpan. Coba lagi.",
        "error",
        8000,
      );
      setSaving(false);
    }
  }

  if (lookups.loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted">
        <Spinner /> Memuat katalog…
      </div>
    );
  }

  if (lookups.error) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="error">{lookups.error}</Alert>
        <div>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Kembali
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Jatuh tempo"
          name="dueDate"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          disabled={saving}
          required
        />
        {needsWarehouse && (
          <FilterSelect
            layout="form"
            label="Gudang"
            ariaLabel="Gudang"
            value={warehouseId}
            options={namedOptions(warehousesHere)}
            active={false}
            required
            placeholder="Pilih gudang"
            disabled={saving}
            onChange={setWarehouseId}
          />
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              {hasServiceLine && <TableHead className="w-44">Hewan</TableHead>}
              <TableHead className="text-right">Harga</TableHead>
              <TableHead className="w-24">Jumlah</TableHead>
              <TableHead className="w-44">Diskon</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, index) => (
              <TableRow key={line.key}>
                <TableCell>
                  <span className="font-medium">{line.name}</span>
                  <span className="block text-xs text-muted tabular-nums">
                    {line.sku ?? "Jasa"}
                    {line.fromIndex === null && " · baru"}
                  </span>
                </TableCell>

                {hasServiceLine && (
                  <TableCell>
                    {line.kind !== "service" ? (
                      <span className="text-xs text-muted">—</span>
                    ) : line.fromIndex !== null ? (
                      /* The animal a kept line was billed for — changing it
                         is removing the line and adding another. */
                      <span className="text-sm">{line.petName ?? "—"}</span>
                    ) : (
                      <FilterSelect
                        layout="field"
                        label=""
                        ariaLabel={`Hewan untuk ${line.name}`}
                        value={line.petId}
                        options={petOptions}
                        placeholder={
                          petOptions.length === 0
                            ? "Belum ada hewan"
                            : "Pilih hewan"
                        }
                        active={false}
                        disabled={saving || petOptions.length === 0}
                        onChange={(value) =>
                          patchLine(line.key, { petId: value })
                        }
                      />
                    )}
                  </TableCell>
                )}

                <TableCell className="text-right tabular-nums">
                  {line.kind === "service" && line.unitPrice === "0" ? (
                    <span className="text-muted">—</span>
                  ) : (
                    formatMoney(line.unitPrice)
                  )}
                </TableCell>

                <TableCell>
                  <Input
                    aria-label={`Jumlah ${line.name}`}
                    value={line.qty}
                    inputMode="decimal"
                    onChange={(event) =>
                      patchLine(line.key, { qty: event.target.value })
                    }
                    // One per animal — see `booked`.
                    disabled={saving || line.booked}
                    title={
                      line.booked
                        ? "Ditagih dari booking — satu per hewan."
                        : undefined
                    }
                  />
                </TableCell>

                <TableCell>
                  <div className="flex gap-1">
                    <select
                      aria-label={`Jenis diskon ${line.name}`}
                      className="h-9 rounded-md border border-border bg-surface px-2 text-sm focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      value={line.discountMode}
                      onChange={(event) =>
                        patchLine(line.key, {
                          discountMode: event.target
                            .value as InvoiceDiscountMode,
                        })
                      }
                      disabled={saving}
                    >
                      <option value="percent">%</option>
                      <option value="amount">Rp</option>
                    </select>
                    <Input
                      aria-label={`Diskon ${line.name}`}
                      value={line.discountValue}
                      inputMode="decimal"
                      placeholder="0"
                      onChange={(event) =>
                        patchLine(line.key, {
                          discountValue: event.target.value,
                        })
                      }
                      disabled={saving}
                    />
                  </div>
                  {preview.lineDiscounts[index] !== "0.0000" && (
                    <span className="mt-1 block text-xs text-danger-ink tabular-nums">
                      −{formatMoney(preview.lineDiscounts[index])}
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-right font-semibold tabular-nums">
                  {formatMoney(preview.lineTotals[index])}
                </TableCell>

                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Hapus ${line.name}`}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((one) => one.key !== line.key),
                      )
                    }
                    disabled={saving}
                  >
                    <Trash2 className="size-4 text-danger" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <FilterSelect
            layout="form"
            label="Tambah barang atau jasa"
            ariaLabel="Tambah barang atau jasa"
            value={picked}
            options={catalogue}
            active={false}
            placeholder="Cari nama atau SKU"
            disabled={saving}
            onChange={setPicked}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={addLine}
          disabled={saving || !picked}
        >
          Tambah baris
        </Button>
      </div>

      <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
        <div>
          <span className="text-sm font-medium">Diskon faktur</span>
          <div className="mt-1.5 flex gap-1">
            <select
              aria-label="Jenis diskon faktur"
              className="h-11 rounded-md border border-border bg-surface px-2 text-sm focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              value={invoiceDiscountMode}
              onChange={(event) =>
                setInvoiceDiscountMode(event.target.value as InvoiceDiscountMode)
              }
              disabled={saving}
            >
              <option value="percent">%</option>
              <option value="amount">Rp</option>
            </select>
            <Input
              aria-label="Diskon faktur"
              className="h-11"
              value={invoiceDiscountValue}
              inputMode="decimal"
              placeholder="0"
              onChange={(event) => setInvoiceDiscountValue(event.target.value)}
              disabled={saving}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Dihitung dari subtotal <strong>setelah</strong> diskon item.
          </p>
        </div>

        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{formatMoney(preview.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Diskon item</dt>
            <dd className="tabular-nums">
              −{formatMoney(preview.itemDiscount)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Diskon faktur</dt>
            <dd className="tabular-nums">
              −{formatMoney(preview.invoiceDiscount)}
            </dd>
          </div>
          {preview.taxAdded !== "0.0000" && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted">{`PPN ${lookups.tax.taxRate}%`}</dt>
              <dd className="tabular-nums">{formatMoney(preview.taxAdded)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4 border-t-[1.5px] border-primary pt-2.5 text-base font-bold">
            <dt>Total tagihan</dt>
            <dd className="tabular-nums">{formatMoney(preview.grandTotal)}</dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-hover px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {blocking ??
            "Menyimpan membalik jurnal & stok versi sebelumnya lalu menerbitkan ulang baris ini. Nomor dan tanggal faktur tetap."}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Buang perubahan
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={saving || blocking !== null}
          >
            {saving ? "Menyimpan…" : "Simpan faktur"}
          </Button>
        </div>
      </div>
    </div>
  );
}
