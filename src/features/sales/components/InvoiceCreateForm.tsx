"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import {
  Alert,
  Card,
  FilterSelect,
  FormActionBar,
  Spinner,
  TextField,
  TextareaField,
  namedOptions,
} from "@/components";
import { Button as UIButton } from "@/components/ui/button";
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
import { formatMoney } from "@/utils/decimal";
import type {
  Booking,
  CreateInvoiceItemInput,
  InvoiceChannel,
  InvoiceDiscountMode,
} from "@/types/api";

import { useInvoiceLookups } from "../hooks/useInvoiceLookups";
import { previewInvoice } from "../invoicePreview";
import { InvoiceBookingPanel } from "./InvoiceBookingPanel";

/**
 * RAISE AN INVOICE — PCR-030's form.
 *
 * A **FORM TRANSAKSI** by §16's one test: it has a table of rows underneath it.
 * So the header is a two-column grid collapsing to one on a phone, the rows sit
 * below it, and Keterangan closes the header rather than the page.
 *
 * FIELD ORDER IS §16's, and it is the same order every other transaction module
 * asks in — Kapan, Di mana, Dengan siapa, klasifikasi, catatan — so nobody
 * re-scans a screen they have not opened this week.
 *
 * THE TOTAL IS COMPUTED IN THE BROWSER, by `invoicePreview.ts`, which mirrors the
 * server's order of operations. The server recomputes everything and is the
 * authority; nothing here is ever SENT as a total. A form that asked somebody to
 * approve a bill without showing them the bill would not be a form.
 *
 * PRICES ARE NOT EDITABLE, and that is a rule rather than an omission: a price a
 * client can set is a discount nobody approved. What this form decides is which
 * item, how many, and what discount — the price comes from the catalogue, on
 * screen and again on the server.
 *
 * ERRORS GO TO A TOAST. A departure from `docs/ui-rules.md` §9, matching the
 * branch forms and asked for directly: this form is long, and the refusals that
 * matter most here — the branch has no code, the shelf is short — arrive while
 * the cursor is somewhere in a table halfway down the page.
 */
const LIST_PATH = "/dashboard/sales";

/**
 * The two the PRD names. `manual` is every invoice anybody types here; the other
 * is for orders that arrived from a marketplace once that sync exists.
 */
const CHANNEL_LABEL: Record<InvoiceChannel, string> = {
  manual: "Diinput manual",
  marketplace: "Marketplace",
};

const CHANNEL_OPTIONS = (Object.keys(CHANNEL_LABEL) as InvoiceChannel[]).map(
  (value) => ({ value, label: CHANNEL_LABEL[value] }),
);

/** A row as the form holds it — the catalogue's price kept beside the ids. */
interface DraftLine {
  kind: "product" | "service";
  refId: string;
  name: string;
  sku: string | null;
  unitPrice: string;
  qty: string;
  discountMode: InvoiceDiscountMode;
  discountValue: string;
}

const todayValue = () => new Date().toISOString().slice(0, 10);

export function InvoiceCreateForm() {
  const router = useRouter();
  const lookups = useInvoiceLookups();

  const [customerId, setCustomerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayValue());
  const [termDays, setTermDays] = useState("30");
  const [channel, setChannel] = useState<InvoiceChannel>("manual");
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [picked, setPicked] = useState("");
  /*
    BOOKINGS ARE SENT AS IDS, not as lines. The server reads each booking's own
    frozen prices, its animal and its groomer — a client that could send those
    could bill a grooming at a price nobody quoted, against somebody else's pet.
    Which means the form cannot preview their total either; see the note by the
    recap.
  */
  const [pulledBookings, setPulledBookings] = useState<Booking[]>([]);
  const bookingIds = pulledBookings.map((booking) => booking._id);

  /*
    BOOKING LINES JOIN THE PREVIEW, even though they are SENT as ids.

    The server prices them identically to typed lines — the invoice discount
    applies across both — so leaving them out of the preview made the recap read
    Rp 0 with two groomings ticked, and would have understated every invoice
    discount that touched them.

    The prices here are the bridge's, which are the same frozen figures the
    server will read from the bookings themselves.
  */
  const bookingLines = pulledBookings.flatMap((booking) =>
    booking.items.map((item) => ({ qty: "1", unitPrice: item.price })),
  );
  const [invoiceDiscountMode, setInvoiceDiscountMode] =
    useState<InvoiceDiscountMode>("percent");
  const [invoiceDiscountValue, setInvoiceDiscountValue] = useState("");

  const [saving, setSaving] = useState(false);

  /**
   * Everything sellable, in one picker.
   *
   * ONE LIST RATHER THAN TWO PICKERS, because the question somebody is answering
   * is "what am I billing for", not "am I billing for a product or a service".
   * The kind is carried on the option so the row knows which it is.
   */
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

  /**
   * The warehouses of the chosen branch, plus every CENTRAL one.
   *
   * A warehouse with no `defaultBranchId` belongs to nobody and serves everyone —
   * the one shape a same-value filter would have wrongly excluded, and the same
   * rule the server enforces when it pairs the two.
   */
  const warehousesHere = useMemo(
    () =>
      lookups.warehouses.filter(
        (warehouse) =>
          !warehouse.defaultBranchId ||
          String(warehouse.defaultBranchId) === branchId,
      ),
    [lookups.warehouses, branchId],
  );

  const hasProductLine = lines.some((line) => line.kind === "product");

  const preview = useMemo(
    () =>
      previewInvoice(
        [
          // Bookings first, matching the order the server assembles them in.
          ...bookingLines,
          ...lines.map((line) => ({
            qty: line.qty,
            unitPrice: line.unitPrice,
            discount: line.discountValue
              ? { mode: line.discountMode, value: line.discountValue }
              : null,
          })),
        ],
        invoiceDiscountValue
          ? { mode: invoiceDiscountMode, value: invoiceDiscountValue }
          : null,
        lookups.tax,
      ),
    [lines, bookingLines, invoiceDiscountMode, invoiceDiscountValue, lookups.tax],
  );

  /**
   * Why Simpan is disabled, in the words of the thing that is missing.
   *
   * ONE REASON AT A TIME, and the FIRST unanswered question rather than a list:
   * somebody filling in a form top to bottom wants to know what to do next, not
   * an inventory of everything they have not reached yet.
   */
  const blocking = (() => {
    if (lookups.loading) return "Sedang memuat data.";
    if (!customerId) return "Pilih pelanggan dulu.";
    if (!branchId) return "Pilih cabang dulu.";
    if (lines.length === 0 && bookingIds.length === 0)
      return "Tambah minimal satu baris atau pilih booking.";
    if (hasProductLine && !warehouseId)
      return "Pilih gudang — ada barang yang harus dikeluarkan.";
    if (lines.some((line) => !line.qty || Number(line.qty) <= 0))
      return "Ada baris yang jumlahnya belum diisi.";
    return null;
  })();

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
        kind,
        refId,
        name: found.name,
        sku: kind === "product" ? ((found as { sku?: string }).sku ?? null) : null,
        // Read from the catalogue and shown read-only — the same figure the
        // server will read again when it prices the invoice.
        unitPrice:
          kind === "product"
            ? String((found as { sellPrice?: string }).sellPrice ?? "0")
            : String((found as { price?: string }).price ?? "0"),
        qty: "1",
        discountMode: "percent",
        discountValue: "",
      },
    ]);
    setPicked("");
  }

  function patchLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line, at) => (at === index ? { ...line, ...patch } : line)),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (blocking) return;

    setSaving(true);

    try {
      const items: CreateInvoiceItemInput[] = lines.map((line) => ({
        kind: line.kind,
        refId: line.refId,
        qty: line.qty,
        discount: line.discountValue
          ? { mode: line.discountMode, value: line.discountValue }
          : null,
      }));

      const created = await customerInvoiceService.create({
        customerId,
        branchId,
        // Left out entirely when nothing ships: the server refuses a product
        // line with no warehouse, and sending one for a grooming bill would
        // claim goods left a shelf that nothing came off.
        ...(hasProductLine ? { warehouseId } : {}),
        items,
        ...(bookingIds.length > 0 ? { bookingIds } : {}),
        ...(invoiceDiscountValue
          ? {
              invoiceDiscount: {
                mode: invoiceDiscountMode,
                value: invoiceDiscountValue,
              },
            }
          : {}),
        invoiceDate: new Date(invoiceDate).toISOString(),
        termDays: Number(termDays),
        channel,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });

      // Released before navigating: a partial failure leaves this form mounted,
      // and a button locked forever is worse than the error that locked it.
      setSaving(false);
      router.push(`${LIST_PATH}/${created._id}`);
      swalToast(`Faktur ${created.invoiceNumber} diterbitkan.`);
    } catch (error) {
      // 8 seconds, not the default 3 — every refusal here carries an
      // instruction: which branch has no code, which product is short.
      swalToast(
        error instanceof ApiError
          ? error.message
          : "Terjadi kesalahan. Coba lagi.",
        "error",
        8000,
      );
      setSaving(false);
    }
  }

  if (lookups.loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (lookups.error) {
    return <Alert variant="error">{lookups.error}</Alert>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {/* `No. [auto]` sits in the bar, not the grid: the server allocates it on
          save, so it is not a field anybody fills in — and the first row of a
          form belongs to what actually needs attention. */}
      <FormActionBar
        title="Faktur baru"
        meta={`No. [auto] · ${lines.length} baris`}
        submitLabel="Terbitkan faktur"
        submitting={saving}
        disabled={blocking !== null}
        blockedReason={blocking ?? undefined}
        cancelHref={LIST_PATH}
      />

      <Card
        title="Keterangan faktur"
        description="Siapa yang ditagih, dari cabang mana, dan kapan jatuh temponya."
      >
        <div className="flex flex-col gap-4">
          {/* KAPAN then DI MANA on the first row — §16's order, the same one
              every transaction module opens with. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Tanggal faktur"
              name="invoiceDate"
              type="date"
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
              hint="Tanggal tagihannya, bukan tanggal form ini dibuka."
              disabled={saving}
              required
            />

            <FilterSelect
              layout="form"
              label="Cabang"
              ariaLabel="Cabang"
              value={branchId}
              options={namedOptions(lookups.branches)}
              active={false}
              required
              placeholder="Pilih cabang"
              disabled={saving}
              onChange={(value) => {
                if (value === branchId) return;
                setBranchId(value);
                // Every warehouse on offer belonged to the old branch. Keeping
                // one would name a shelf these books never held.
                setWarehouseId("");
              }}
            />
          </div>

          {/* DENGAN SIAPA, full width on its own — customer names run long. */}
          <FilterSelect
            layout="form"
            label="Pelanggan"
            ariaLabel="Pelanggan"
            value={customerId}
            options={namedOptions(lookups.customers)}
            active={false}
            required
            placeholder="Pilih pelanggan"
            disabled={saving}
            onChange={(value) => {
              if (value === customerId) return;
              setCustomerId(value);
              // Every booking on offer belonged to the previous customer.
              // Keeping one would bill this person for somebody else's grooming
              // — which the server refuses, but only after the form was filled
              // in.
              setPulledBookings([]);
            }}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <FilterSelect
                layout="form"
                label="Gudang"
                ariaLabel="Gudang"
                value={warehouseId}
                options={namedOptions(warehousesHere)}
                active={false}
                placeholder={
                  branchId === "" ? "Pilih cabang dulu" : "Pilih gudang"
                }
                // Nothing to offer until a branch is named: the list IS that
                // branch's shelves plus the central ones.
                disabled={saving || branchId === ""}
                onChange={setWarehouseId}
              />
              {!hasProductLine && (
                <p className="mt-1.5 text-xs text-muted">
                  Belum perlu — belum ada baris barang.
                </p>
              )}
            </div>

            <TextField
              label="Jatuh tempo"
              name="termDays"
              type="number"
              min={0}
              value={termDays}
              onChange={(event) => setTermDays(event.target.value)}
              hint="Hari sejak tanggal faktur. 0 berarti jatuh tempo hari ini."
              disabled={saving}
            />

            <FilterSelect
              layout="form"
              label="Channel"
              ariaLabel="Channel"
              value={channel}
              options={CHANNEL_OPTIONS}
              active={false}
              disabled={saving}
              onChange={(value) => setChannel(value as InvoiceChannel)}
            />
          </div>

          {/* CATATAN CLOSES THE HEADER, above the rows — §16. */}
          <TextareaField
            label="Keterangan"
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            hint="Opsional. Yang perlu diingat soal tagihan ini."
            disabled={saving}
          />
        </div>
      </Card>

      {/*
        BOOKINGS BEFORE THE TYPED LINES, which is the order somebody fills this
        in: pull what has already happened, then add anything else onto the same
        bill. Hidden entirely until a customer is chosen — "which bookings" has
        no meaning until "whose" is answered.
      */}
      {customerId && (
        <Card
          title="Hewan & booking pelanggan ini"
          description="Booking yang sudah dikonfirmasi dan belum ditagih. Harganya mengikuti yang dikutip saat booking dibuat."
        >
          <InvoiceBookingPanel
            /* A different customer is a different panel — see its own note. */
            key={customerId}
            customerId={customerId}
            selected={bookingIds}
            onChange={setPulledBookings}
            disabled={saving}
          />
        </Card>
      )}

      <Card
        title="Baris faktur"
        description="Harga diambil dari katalog dan tidak bisa diubah di sini."
      >
        <div className="flex flex-col gap-4">
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
            <UIButton
              type="button"
              size="lg"
              onClick={addLine}
              disabled={saving || !picked}
            >
              Tambah baris
            </UIButton>
          </div>

          {lines.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
              Belum ada baris. Pilih barang atau jasa di atas untuk menambah yang
              pertama.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Harga</TableHead>
                    <TableHead className="w-28">Jumlah</TableHead>
                    <TableHead className="w-44">Diskon</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={`${line.refId}-${index}`}>
                      <TableCell>
                        <span className="font-medium">{line.name}</span>
                        <span className="block text-xs text-muted">
                          {line.sku ?? "Jasa"}
                        </span>
                      </TableCell>

                      {/* READ-ONLY, and it is a rule: a price a client can set is
                          a discount nobody approved. */}
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(line.unitPrice)}
                      </TableCell>

                      <TableCell>
                        <Input
                          aria-label={`Jumlah ${line.name}`}
                          value={line.qty}
                          inputMode="decimal"
                          onChange={(event) =>
                            patchLine(index, { qty: event.target.value })
                          }
                          disabled={saving}
                        />
                      </TableCell>

                      <TableCell>
                        <div className="flex gap-1">
                          <select
                            aria-label={`Jenis diskon ${line.name}`}
                            className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                            value={line.discountMode}
                            onChange={(event) =>
                              patchLine(index, {
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
                              patchLine(index, {
                                discountValue: event.target.value,
                              })
                            }
                            disabled={saving}
                          />
                        </div>
                        {preview.lineDiscounts[index] !== "0.0000" && (
                          <span className="mt-1 block text-xs text-success">
                            −{formatMoney(preview.lineDiscounts[index])}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-right tabular-nums">
                        {formatMoney(preview.lineTotals[index])}
                      </TableCell>

                      <TableCell>
                        <UIButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Hapus ${line.name}`}
                          onClick={() =>
                            setLines((current) =>
                              current.filter((_, at) => at !== index),
                            )
                          }
                          disabled={saving}
                        >
                          <Trash2 className="size-4 text-danger" />
                        </UIButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Card>

      <Card
        title="Rekap"
        description="Dihitung di layar dengan urutan yang sama seperti di server. Angka finalnya ditetapkan saat faktur terbit."
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="text-sm font-medium">Diskon faktur</span>
              <div className="mt-1.5 flex gap-1">
                <select
                  aria-label="Jenis diskon faktur"
                  className="h-11 rounded-md border border-border bg-surface px-2 text-sm"
                  value={invoiceDiscountMode}
                  onChange={(event) =>
                    setInvoiceDiscountMode(
                      event.target.value as InvoiceDiscountMode,
                    )
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
                  onChange={(event) =>
                    setInvoiceDiscountValue(event.target.value)
                  }
                  disabled={saving}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Dihitung dari subtotal <strong>setelah</strong> diskon baris.
              </p>
            </div>

            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(preview.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Diskon baris</dt>
                <dd className="tabular-nums">
                  −{formatMoney(preview.itemDiscount)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Diskon faktur</dt>
                <dd className="tabular-nums">
                  −{formatMoney(preview.invoiceDiscount)}
                </dd>
              </div>
              {/*
                THE ROW THAT MAKES THE LIST ADD UP. Without it the recap ran
                Subtotal Rp 100.000 → Total Rp 111.000 with nothing between them,
                and the sentence underneath was the only clue where the
                difference came from — a caption is not an explanation of an
                arithmetic a person is checking line by line.

                SHOWN ONLY WHERE TAX IS ADDED ON TOP. On inclusive pricing the tax
                is already inside the subtotal; a row reading "PPN Rp 0" there
                would deny a tax that was charged.
              */}
              {preview.taxAdded !== "0.0000" && (
                <div className="flex justify-between">
                  {/* One template string, not `PPN {rate}%` — interpolation
                      splits it into three text nodes, which a screen reader
                      announces in pieces and a query cannot match as a label. */}
                  <dt className="text-muted">{`PPN ${lookups.tax.taxRate}%`}</dt>
                  <dd className="tabular-nums">
                    {formatMoney(preview.taxAdded)}
                  </dd>
                </div>
              )}

              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <dt>Total tagihan</dt>
                <dd className="tabular-nums">
                  {formatMoney(preview.grandTotal)}
                </dd>
              </div>
            </dl>
          </div>

          <p className="text-xs text-muted">
            {lookups.tax.priceIncludesTax
              ? "Harga katalog sudah termasuk PPN — rincian DPP dan PPN muncul di faktur setelah terbit."
              : "Rincian DPP-nya muncul di faktur setelah terbit."}
          </p>
        </div>
      </Card>
    </form>
  );
}
