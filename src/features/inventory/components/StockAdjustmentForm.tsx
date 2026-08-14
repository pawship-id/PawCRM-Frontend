"use client";

import { useEffect, useMemo, useState } from "react";

import { Alert, Button, Card, Spinner, TextField } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { stockMovementService } from "@/services/stockMovement.service";
import { formatMoney, formatQty, isDecimal, isPositive } from "@/utils/decimal";

import { useMovementPreview } from "../hooks/useMovementPreview";
import { useProductStock } from "../hooks/useProductStock";
import { useStockCardLookups } from "../hooks/useStockCardLookups";
import { newIdempotencyKey } from "../utils/idempotency";
import { FefoPreview } from "./FefoPreview";
import { HppStrip } from "./HppStrip";
import { JournalPreview } from "./JournalPreview";
import { WarehouseProductPicker } from "./WarehouseProductPicker";

/**
 * Manual stock adjustment — and, on the way in, how a tenant enters its OPENING
 * STOCK before the purchasing module exists.
 *
 * ONE FORM, TWO DIRECTIONS, and the direction is a first-class control rather
 * than a minus sign the user has to remember to type. The API takes a signed
 * quantity (`"-3"` writes stock off), but asking a shop owner to type a negative
 * number to record breakage is how you get "-3" entered as "3" on a Monday
 * morning. The toggle owns the sign; the field only ever holds a magnitude.
 *
 * The two directions are genuinely different operations underneath, which is
 * why the form changes shape:
 *
 *   MASUK  — acquires stock, so it moves the weighted average and, for goods
 *            that expire, creates a lot. Shows the HPP strip and asks for the
 *            batch details the backend requires.
 *   KELUAR — draws from existing lots, so it moves no cost and creates nothing.
 *            Shows the FEFO allocation instead: which lots, and how many ledger
 *            rows the one request will actually write.
 *
 * THE PREVIEWS ARE FETCHED, NOT COMPUTED. `POST /stock-movements/preview` is the
 * posting path with the commit left off, so the FEFO split, the weighted average
 * and the journal on the right are the ones that will actually be written. The
 * browser used to reimplement all three, and a reimplementation does not fail
 * loudly when the server changes its mind — it renders a confident wrong number
 * that the user approves.
 *
 * WHAT THE SERVER STILL REFUSES is not duplicated in `validate` below. An
 * inactive warehouse, a product that cannot hold stock, a batch code the tenant
 * has already used — those come back as a 400 and are surfaced verbatim. Only
 * the rules a user can fix without a round trip are checked locally.
 */
export function StockAdjustmentForm() {
  const lookups = useStockCardLookups();

  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [isConsignment, setIsConsignment] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Bumped after a successful post so the stock, lots and HPP are re-read. */
  const [refreshKey, setRefreshKey] = useState(0);
  /**
   * Minted once per INTENT, not per request: it survives a failed attempt — so a
   * retry of a save that may have landed replays instead of writing twice — and
   * is replaced only after one succeeds.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  // The first warehouse and product become the default once the lists arrive.
  // ACTIVE warehouses only, unlike the stock card: this form WRITES, and the API
  // refuses a movement at an inactive location — offering one would produce a
  // rejection after the user had filled the whole form.
  const writableWarehouses = useMemo(
    () => lookups.warehouses.filter((warehouse) => warehouse.isActive),
    [lookups.warehouses],
  );

  useEffect(() => {
    if (warehouseId || writableWarehouses.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWarehouseId(writableWarehouses[0]._id);
    setProductId((prev) => prev || (lookups.products[0]?._id ?? ""));
  }, [writableWarehouses, lookups.products, warehouseId]);

  const { product, qtyOnHand } = useProductStock(
    productId,
    warehouseId,
    refreshKey,
  );

  const inbound = direction === "in";

  /**
   * A lot is required when the goods expire — the promise `hasExpiry` makes and
   * the one the backend finally enforces — or when they arrive on consignment,
   * which carries its own hand-entered cost.
   */
  const needsBatch = inbound && Boolean(product?.hasExpiry || isConsignment);

  /**
   * The payload, built once and used for both the preview and the save.
   *
   * Identical on purpose: a preview of a DIFFERENT request is worse than no
   * preview, and this is the only place the two could diverge. `refreshKey` is
   * in the key so the panel is re-asked after a successful post, when the lots
   * and the average it described have moved.
   */
  const payload = useMemo(
    () => ({
      operation: "adjustment" as const,
      productId,
      warehouseId,
      // The toggle owns the sign — see the header.
      qty: inbound ? qty : `-${qty}`,
      batchCode: needsBatch && batchCode.trim() ? batchCode.trim() : undefined,
      expiryDate: inbound && expiryDate ? expiryDate : undefined,
      costPerUnit:
        inbound && costPerUnit.trim() !== "" ? costPerUnit : undefined,
      isConsignment: inbound ? isConsignment : undefined,
    }),
    [
      productId,
      warehouseId,
      inbound,
      qty,
      needsBatch,
      batchCode,
      expiryDate,
      costPerUnit,
      isConsignment,
    ],
  );

  /**
   * Asked only once the payload is plausible. The endpoint refuses what the
   * create refuses, so previewing an empty quantity would paint the panel red
   * while the user is still typing the first digit.
   */
  const preview = useMovementPreview(
    payload,
    Boolean(productId && warehouseId && isPositive(qty)),
    refreshKey,
  );

  /**
   * The weighted-average working, with one field the server does not send:
   * whether an average existed AT ALL. The API returns "0.0000" either way, and
   * "no HPP yet" reads very differently from "an HPP of zero" — the product
   * already says which, so the arithmetic comes from the server and the null
   * comes from here.
   */
  const hppPreview = useMemo(() => {
    const computed = preview.preview?.hppAvg[0];
    if (!computed || !product) return null;
    return { ...computed, before: product.hppAvg };
  }, [preview.preview, product]);

  /** Outbound rows only: an inbound adjustment draws from no lot. */
  const fefo = (preview.preview?.movements ?? []).filter((row) =>
    row.qty.startsWith("-"),
  );
  const journal = preview.preview?.journal ?? [];

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (qty.trim() === "") next.qty = "Jumlah wajib diisi.";
    else if (!isDecimal(qty)) next.qty = "Gunakan angka, maksimal 4 desimal.";
    else if (!isPositive(qty)) next.qty = "Jumlah harus lebih dari nol.";

    if (needsBatch && batchCode.trim() === "") {
      next.batchCode = "Produk ini melacak batch — kode batch wajib diisi.";
    }
    if (inbound && product?.hasExpiry && expiryDate === "") {
      next.expiryDate = "Produk ini punya masa kedaluwarsa — tanggal wajib diisi.";
    }
    if (costPerUnit.trim() !== "" && !isDecimal(costPerUnit)) {
      next.costPerUnit = "Gunakan angka, maksimal 4 desimal.";
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
      // The SAME payload the preview described, plus the retry token. Building
      // a second one here is how a form ends up saving something other than what
      // it showed.
      const written = await stockMovementService.create({
        ...payload,
        idempotencyKey,
      });

      setQty("");
      setBatchCode("");
      setExpiryDate("");
      setCostPerUnit("");
      setIsConsignment(false);
      setFieldErrors({});
      // A new intent needs a new token; reusing this one would make the next
      // adjustment look like a replay of this one and write nothing.
      setIdempotencyKey(newIdempotencyKey);
      // Re-read stock, lots and HPP: the next adjustment must be previewed
      // against what this one just left behind, not against what was on screen.
      setRefreshKey((key) => key + 1);

      // Reports what the SERVER wrote, not what the preview predicted. FEFO may
      // have split the withdrawal differently — over a lot the client's copy of
      // the ledger did not know about, for instance.
      swalToast(
        written.length === 1
          ? "Penyesuaian tersimpan — 1 baris ditulis ke kartu stok."
          : `Penyesuaian tersimpan — ${written.length} baris ditulis (FEFO memecah ke ${written.length} lot).`,
      );
    } catch (error) {
      // `fullMessage` carries the actionable half of a 400/409 — "Warehouse
      // 'Gudang Bazar' is not active and cannot accept movement" — which
      // `message` alone drops.
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
        <Spinner /> Memuat daftar produk dan gudang…
      </div>
    );
  }

  if (lookups.error) {
    return <Alert variant="error">{lookups.error}</Alert>;
  }

  if (!product) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface py-16 text-center">
        <p className="font-medium text-foreground">
          Pilih gudang dan produk dulu
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Penyesuaian selalu dicatat untuk satu produk di satu gudang.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* ---------------------------------------------------------- input */}
        <div className="flex flex-col gap-6">
          <Card title="Barang & lokasi">
            <div className="flex flex-col gap-4">
              <WarehouseProductPicker
                warehouses={writableWarehouses}
                products={lookups.products}
                warehouseId={warehouseId}
                productId={productId}
                onWarehouseChange={setWarehouseId}
                onProductChange={setProductId}
              />

              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent/60 px-3 py-2 text-sm">
                <span className="text-muted">Stok saat ini</span>
                <b className="tabular-nums">
                  {formatQty(qtyOnHand)} {product.unit}
                </b>
                <span className="text-muted">·</span>
                <span className="text-muted">HPP</span>
                <b className="tabular-nums">
                  {product.hppAvg
                    ? formatMoney(product.hppAvg)
                    : "belum terbentuk"}
                </b>
                {product.hasExpiry && (
                  <Badge
                    variant="outline"
                    className="ml-auto border-secondary text-secondary-foreground"
                  >
                    melacak kedaluwarsa
                  </Badge>
                )}
              </div>
            </div>
          </Card>

          <Card title="Penyesuaian">
            <div className="flex flex-col gap-4">
              <div>
                <Label className="mb-1.5 block">Arah penyesuaian</Label>
                <div className="inline-flex rounded-lg bg-accent p-1">
                  {(
                    [
                      ["in", "Barang masuk (+)"],
                      ["out", "Barang keluar (−)"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDirection(value)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition",
                        direction === value
                          ? "bg-surface text-foreground shadow-sm"
                          : "text-muted hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {inbound
                    ? "Menambah stok — juga dipakai untuk input stok awal saat pertama memakai PawCRM."
                    : "Mengurangi stok — barang rusak, hilang, atau terpakai sendiri."}
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label={`Jumlah (${product.unit})`}
                  name="qty"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  error={fieldErrors.qty}
                  hint="Isi angka positif. Arahnya ditentukan tombol di atas."
                  placeholder="mis. 12 atau 2,5 → tulis 2.5"
                  required
                />

                {inbound && (
                  <TextField
                    label="Harga beli per unit"
                    name="costPerUnit"
                    inputMode="decimal"
                    value={costPerUnit}
                    onChange={(e) => setCostPerUnit(e.target.value)}
                    error={fieldErrors.costPerUnit}
                    hint={
                      isConsignment
                        ? "Wajib untuk konsinyasi — tidak ada pembelian yang bisa jadi acuan."
                        : "Kosongkan bila barang masuk pada HPP rata-rata yang berlaku."
                    }
                    placeholder={
                      product.hppAvg ? formatMoney(product.hppAvg) : "mis. 118500"
                    }
                  />
                )}
              </div>

              {inbound && (
                <>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="isConsignment"
                      checked={isConsignment}
                      onCheckedChange={(checked) =>
                        setIsConsignment(checked === true)
                      }
                    />
                    <div>
                      <Label htmlFor="isConsignment">
                        Barang konsinyasi (titipan)
                      </Label>
                      <p className="text-xs text-muted">
                        Barang milik supplier sampai laku. Dibuatkan lot sendiri
                        supaya harga titipannya tidak tercampur.
                      </p>
                    </div>
                  </div>

                  {needsBatch && (
                    <div className="grid gap-4 rounded-lg border border-secondary/40 bg-secondary/10 p-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <p className="text-xs font-medium text-secondary-foreground">
                          {product.hasExpiry
                            ? "Produk ini punya masa kedaluwarsa — batch dan tanggal wajib diisi."
                            : "Konsinyasi selalu dibuatkan lot tersendiri."}
                        </p>
                      </div>
                      <TextField
                        label="Kode batch"
                        name="batchCode"
                        value={batchCode}
                        onChange={(e) => setBatchCode(e.target.value)}
                        error={fieldErrors.batchCode}
                        placeholder="mis. WSK-B26-0640"
                        required
                      />
                      <TextField
                        label="Tanggal kedaluwarsa"
                        name="expiryDate"
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        error={fieldErrors.expiryDate}
                        required={product.hasExpiry}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>

        {/* -------------------------------------------------------- preview */}
        <div className="flex flex-col gap-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            Yang akan terjadi
          </p>

          {inbound ? (
            <HppStrip preview={hppPreview} />
          ) : (
            <FefoPreview rows={fefo} />
          )}

          <JournalPreview
            lines={journal}
            emptyReason={
              isPositive(qty)
                ? "Barang ini belum punya HPP, jadi belum ada nilai untuk dijurnal. Yang berpindah baru kuantitasnya."
                : "Isi jumlah untuk melihat jurnal yang akan dibuat."
            }
          />

          {!inbound && fefo.length > 1 && (
            <div className="rounded-lg border border-border bg-accent/50 px-4 py-3 text-xs text-muted">
              Satu permintaan ini akan menulis <b>{fefo.length} baris</b> di kartu
              stok — satu per lot. Itu disengaja: enam bulan lagi, pertanyaan
              &ldquo;batch mana yang keluar&rdquo; masih bisa dijawab dari
              catatan, bukan dikira-kira.
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan penyesuaian"}
            </Button>
          </div>

          <p className="text-xs text-muted">
            Perkiraan di atas dihitung di browser dari lot dan HPP yang sedang
            berlaku. Hasil yang sebenarnya ditentukan server saat disimpan — dan
            itulah yang dilaporkan setelah tombol ditekan.
          </p>

          <p className="text-xs text-muted">
            Kartu stok bersifat <b>append-only</b>. Penyesuaian tidak mengubah
            baris lama — ia menambah baris baru, sehingga koreksi dan kesalahannya
            sama-sama tetap terlihat.
          </p>
        </div>
      </div>
    </form>
  );
}
