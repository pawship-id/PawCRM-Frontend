"use client";

import { useMemo, useState } from "react";

import {
  Alert,
  Button,
  Card,
  FilterSelect,
  Spinner,
  TextField,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { stockMovementService } from "@/services/stockMovement.service";
import {
  formatMoney,
  formatQty,
  isDecimal,
  isPositive,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";

import { useMovementPreview } from "../hooks/useMovementPreview";
import { useProductBatches } from "../hooks/useProductBatches";
import { useProductStock } from "../hooks/useProductStock";
import { useStockCardLookups } from "../hooks/useStockCardLookups";
import { newIdempotencyKey } from "../utils/idempotency";
import { FefoPreview } from "./FefoPreview";
import { JournalPreview } from "./JournalPreview";
import { WarehouseProductPicker } from "./WarehouseProductPicker";

/**
 * Manual stock adjustment — and, on the way in, how a tenant enters its OPENING
 * STOCK before the purchasing module exists.
 *
 * NOBODY PICKS A DIRECTION. The form asks for the quantity that is really on
 * the shelf and derives the rest: `selisih = stok baru − stok sistem`, and the
 * sign falls out of the subtraction. "Barang masuk / barang keluar" was the
 * shop's language for a warehouse door, not for a correction — and the pair of
 * buttons asked somebody to classify their own arithmetic before doing it.
 *
 * IT ALSO MAKES NEGATIVE STOCK UNWRITEABLE. While the field held "how much to
 * remove", entering more than the shelf had was one keystroke; now the field
 * holds "how much is there", and a count is never below nothing. The API
 * refuses it too (per-operation — a SALE may still go negative, because those
 * goods really did leave), but the rule is the form's shape rather than a
 * message somebody meets after typing.
 *
 * A PRODUCT THAT TRACKS LOTS IS ADJUSTED ONE LOT AT A TIME. Such a product has
 * no single balance to correct — it has one per lot, and the person counting is
 * holding a particular box. The lot is CHOSEN from the ones at that warehouse
 * rather than typed, so a slip of the keyboard cannot mint a second lot for
 * goods that already have one; "+ Batch baru" is the deliberate way to make one.
 *
 * COST IS ASKED ONLY WHEN STOCK ARRIVES, and it is where OPENING STOCK enters:
 * a tenant's first count is simply an adjustment against a system balance of
 * zero, and there the cost is required because no average exists yet to fall
 * back on. Consignment never asks — the price that applies is the one at
 * billing, not the one when the goods turned up.
 *
 * THE HPP WORKING IS NOT SHOWN. The weighted average is the system's own
 * arithmetic over every movement; a strip explaining it invited a decision on a
 * screen that has none to make.
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
/** The sentinel the batch picker uses for "make a new one". */
const NEW_BATCH = "__new__";

/**
 * Whether the "Yang akan terjadi" panel (FEFO split + jurnal) is rendered.
 *
 * Off: the form is one full-width column, and the outcome is reported after
 * saving instead of before. The preview is still fetched, so flipping this back
 * to `true` restores the panel without any other change.
 */
const SHOW_OUTCOME_PREVIEW: boolean = false;

export function StockAdjustmentForm() {
  const lookups = useStockCardLookups();

  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  /** "" = none chosen yet · a lot id · NEW_BATCH to create one. */
  const [batchChoice, setBatchChoice] = useState("");
  const [newQty, setNewQty] = useState("");
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

  /*
    NOTHING IS CHOSEN FOR THE USER. This used to open on the first warehouse and
    the first product, which made the form look ready when it was really
    describing goods nobody had picked — and on a screen that writes stock, a
    default is a suggestion somebody can save without reading.

    The pickers therefore start on "Pilih gudang" / "Pilih produk", and the rest
    of the form waits for both.
  */

  const { product, qtyOnHand } = useProductStock(
    productId,
    warehouseId,
    refreshKey,
  );

  /**
   * The lots this product has at this warehouse — the list the picker offers.
   *
   * The same hook the stock card's lot tab uses, so "which lots are here" has
   * one answer on both screens.
   */
  const lots = useProductBatches(productId, warehouseId, refreshKey);

  /**
   * Whether this product is adjusted lot by lot.
   *
   * `hasExpiry` is the flag the backend enforces, so it is the one the form
   * follows. A product without it has a single balance per warehouse and is
   * adjusted as one.
   */
  const tracksBatches = Boolean(product?.hasExpiry);
  const makingBatch = tracksBatches && batchChoice === NEW_BATCH;
  const chosenLot =
    tracksBatches && batchChoice && batchChoice !== NEW_BATCH
      ? lots.batches.find((lot) => lot._id === batchChoice)
      : undefined;

  /**
   * What the system currently believes — the left half of the subtraction.
   *
   * Per LOT when the product tracks them, because that is the balance being
   * corrected; a new lot starts at nothing. Per warehouse otherwise.
   */
  const systemQty = tracksBatches
    ? makingBatch
      ? "0"
      : (chosenLot?.qtyRemaining ?? null)
    : qtyOnHand;

  /**
   * The adjustment itself, as the ledger wants it: signed, and derived.
   *
   * Null while either side is unknown or unusable, so nothing is previewed
   * against a half-typed number. Zero is a real answer and deliberately NOT
   * null — it means the count agreed, and the form says so rather than
   * pretending it is still waiting.
   */
  const delta = useMemo(() => {
    if (systemQty === null || newQty.trim() === "" || !isDecimal(newQty)) {
      return null;
    }
    const target = toMinor(newQty);
    const current = toMinor(systemQty);
    if (target === null || current === null || target < 0n) return null;
    return toDecimalString(target - current);
  }, [systemQty, newQty]);

  const increasing = delta !== null && isPositive(delta);
  const unchanged = delta !== null && toMinor(delta) === 0n;

  /** A brand-new lot is described here; an existing one is named by id. */
  const needsBatch = makingBatch;

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
      // Derived, never typed: the subtraction owns the sign.
      qty: delta ?? "0",
      // Naming a lot and creating one are mutually exclusive — the API refuses
      // the pair, so the form never assembles it.
      batchId: chosenLot?._id,
      batchCode: needsBatch && batchCode.trim() ? batchCode.trim() : undefined,
      expiryDate: needsBatch && expiryDate ? expiryDate : undefined,
      // Only arriving stock carries a cost, and consignment never does.
      costPerUnit:
        increasing && !isConsignment && costPerUnit.trim() !== ""
          ? costPerUnit
          : undefined,
      isConsignment: increasing ? isConsignment : undefined,
    }),
    [
      productId,
      warehouseId,
      delta,
      increasing,
      chosenLot,
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
    Boolean(productId && warehouseId && delta !== null && !unchanged),
    refreshKey,
  );

  /** Outbound rows only: an inbound adjustment draws from no lot. */
  const fefo = (preview.preview?.movements ?? []).filter((row) =>
    row.qty.startsWith("-"),
  );
  const journal = preview.preview?.journal ?? [];

  /**
   * Every rule the form owns, as a plain object — no state written.
   *
   * ONE SOURCE FOR TWO JOBS: `validate()` shows these on submit, and the save
   * button reads the same result to decide whether it can be pressed. Written
   * twice, the button would drift from the messages and start refusing things
   * the form had no complaint about.
   */
  function collectErrors(): Record<string, string> {
    const next: Record<string, string> = {};

    if (!product) {
      next.product = "Pilih gudang dan produknya dulu.";
    }

    if (tracksBatches && batchChoice === "") {
      next.batchChoice =
        "Produk ini melacak batch — pilih batch mana yang disesuaikan.";
    }

    if (newQty.trim() === "") next.newQty = "Stok baru wajib diisi.";
    else if (!isDecimal(newQty))
      next.newQty = "Gunakan angka, maksimal 4 desimal.";
    else if ((toMinor(newQty) ?? -1n) < 0n)
      next.newQty = "Stok tidak bisa kurang dari nol.";
    else if (unchanged)
      next.newQty = "Sama dengan stok sistem — tidak ada yang perlu dicatat.";

    if (needsBatch && batchCode.trim() === "") {
      next.batchCode = "Kode batch wajib diisi untuk batch baru.";
    }
    if (needsBatch && expiryDate === "") {
      next.expiryDate = "Tanggal kedaluwarsa wajib diisi untuk batch baru.";
    }
    if (costPerUnit.trim() !== "" && !isDecimal(costPerUnit)) {
      next.costPerUnit = "Gunakan angka, maksimal 4 desimal.";
    }
    // Required only where nothing can stand in for it: an arrival into a
    // balance with no average yet — which is what opening stock is.
    if (
      increasing &&
      !isConsignment &&
      costPerUnit.trim() === "" &&
      !product?.hppAvg
    ) {
      next.costPerUnit =
        "Belum ada HPP untuk barang ini — isi harga beli per unit sebagai dasarnya.";
    }

    return next;
  }

  /**
   * Everything below the goods, cleared — because it all described the OLD ones.
   *
   * The batch is the sharp edge: lot ids belong to one product at one
   * warehouse, so a choice left behind after switching either points at a lot
   * the new product does not have. It showed as a raw ObjectId in the picker,
   * which was the visible half of the bug; the dangerous half was invisible —
   * the id stayed in state, so a save would have attached the adjustment to
   * another product's lot.
   *
   * The count goes too, and for the same reason rather than for tidiness: a
   * number counted on one shelf is not a number about another, and leaving it
   * makes it one keystroke from being saved as one.
   */
  function resetGoodsScope() {
    setBatchChoice("");
    setBatchCode("");
    setExpiryDate("");
    setNewQty("");
    setCostPerUnit("");
    setIsConsignment(false);
    setFieldErrors({});
  }

  function validate(): boolean {
    const next = collectErrors();
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  /**
   * What is still missing, and why the save button is not pressable yet.
   *
   * A DISABLED PRIMARY ACTION HAS TO SAY WHY. Greying it out and leaving the
   * reason to be discovered by filling fields at random is the same failure as
   * a disabled control with no explanation — worse here, because the button is
   * the one thing on screen somebody is aiming for. The first outstanding rule
   * is printed under it, in the same words the field would use.
   */
  const blocking = Object.values(collectErrors())[0] ?? null;

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

      setNewQty("");
      setBatchChoice("");
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

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {formError && <Alert variant="error">{formError}</Alert>}

      {/* ---------------------------------------------------------- input */}
      {/* The precondition is stated on the card, not only implied by three
          greyed-out fields further down. Somebody who has not chosen yet is
          looking HERE — and a disabled input explains that it is disabled,
          never why. */}
      <Card
        title="Barang & lokasi"
        description="Pilih gudang dan produknya dulu. Jumlah baru bisa diisi setelah keduanya terpilih — penyesuaian selalu dicatat untuk satu produk di satu gudang."
      >
        <div className="flex flex-col gap-4">
          <WarehouseProductPicker
            warehouses={writableWarehouses}
            products={lookups.products}
            warehouseId={warehouseId}
            productId={productId}
            onWarehouseChange={(id) => {
              setWarehouseId(id);
              resetGoodsScope();
            }}
            onProductChange={(id) => {
              setProductId(id);
              resetGoodsScope();
            }}
          />

          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent/60 px-3 py-2 text-sm">
            <span className="text-muted">Stok saat ini</span>
            <b className="tabular-nums">
              {formatQty(qtyOnHand)} {product?.unit}
            </b>
            <span className="text-muted">·</span>
            <span className="text-muted">HPP</span>
            <b className="tabular-nums">
              {product?.hppAvg
                ? formatMoney(product?.hppAvg)
                : "belum terbentuk"}
            </b>
            {product?.hasExpiry && (
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

      {tracksBatches && (
        <Card
          title="Batch"
          description="Pilih batch yang sudah ada di gudang ini untuk produk ini, atau buat batch baru — pastikan kode batchnya unik."
        >
          <div className="flex flex-col gap-4">
            {/* An empty picker is ambiguous: it looks the same whether this
                product genuinely has no lots here, or the read was refused.
                Both are said out loud rather than left to be guessed from a
                list with one option in it. */}
            {lots.error && <Alert variant="error">{lots.error}</Alert>}

            {lots.loading ? (
              <p className="text-sm text-muted">Memuat batch…</p>
            ) : (
              <FilterSelect
                layout="field"
                label="Kode batch"
                ariaLabel="Kode batch"
                value={batchChoice}
                active={false}
                placeholder="Pilih batch"
                options={[
                  ...lots.batches.map((lot) => ({
                    value: lot._id,
                    label: `${lot.batchCode} · sisa ${formatQty(lot.qtyRemaining)}${
                      lot.expiryDate
                        ? ` · exp ${lot.expiryDate.slice(0, 10)}`
                        : ""
                    }`,
                  })),
                  { value: NEW_BATCH, label: "+ Batch baru…" },
                ]}
                onChange={setBatchChoice}
              />
            )}
            {fieldErrors.batchChoice && (
              <p role="alert" className="text-xs text-danger">
                {fieldErrors.batchChoice}
              </p>
            )}

            {/* Gone once "+ Batch baru…" is picked: at that point it is
                telling somebody to do what they have just done. */}
            {!lots.loading &&
              !lots.error &&
              !makingBatch &&
              lots.batches.length === 0 && (
                <p className="text-xs text-muted">
                  Belum ada batch untuk produk ini di gudang tersebut — pilih{" "}
                  <b>+ Batch baru…</b> untuk membuat yang pertama.
                </p>
              )}
            {/* The general guidance moved to the card's own description —
                it is true before anything is picked, which is when it is
                read. What stays here is the one fact that only holds while
                a NEW batch is being described. */}
            {makingBatch && (
              <p className="text-xs text-muted">
                Batch baru dibuat saat disimpan. Stok sistemnya nol — apa pun
                yang diisi di bawah adalah penambahan.
              </p>
            )}

            {makingBatch && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Kode batch baru"
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
                  required
                />
              </div>
            )}
          </div>
        </Card>
      )}

      <Card
        title={tracksBatches ? "Jumlah di batch ini" : "Jumlah di gudang ini"}
      >
        <div className="flex flex-col gap-4">
          {/* The whole form in three boxes: what we think, what you counted,
              and the difference — which is the only one the ledger stores. */}
          <div className="grid items-start gap-4 sm:grid-cols-3">
            <div>
              <Label className="mb-1.5 block">Stok sistem sekarang</Label>
              <div className="flex h-10 items-center rounded-md border border-border bg-accent/60 px-3 text-sm tabular-nums text-muted">
                {systemQty === null
                  ? "—"
                  : `${formatQty(systemQty)} ${product?.unit}`}
              </div>
              <p className="mt-1.5 text-xs text-muted">Tidak bisa diubah.</p>
            </div>

            <TextField
              label={`Stok baru (${product?.unit})`}
              name="newQty"
              inputMode="decimal"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              error={fieldErrors.newQty}
              hint="Jumlah yang benar-benar ada. Tidak bisa minus."
              placeholder="mis. 12 atau 2,5 → tulis 2.5"
              disabled={systemQty === null}
              required
            />

            <div>
              <Label className="mb-1.5 block">Selisih</Label>
              <div
                className={cn(
                  "flex h-10 items-center gap-2 rounded-md px-3 text-sm font-bold tabular-nums",
                  delta === null || unchanged
                    ? "bg-tint-brand text-primary"
                    : increasing
                      ? "bg-tint-success text-success"
                      : "bg-tint-danger text-danger",
                )}
              >
                {delta === null ? (
                  "—"
                ) : unchanged ? (
                  <>
                    0 {product?.unit}
                    <span className="font-normal">tidak ada selisih</span>
                  </>
                ) : (
                  <>
                    {increasing ? "+" : ""}
                    {formatQty(delta)} {product?.unit}
                    <span className="font-normal">
                      {increasing ? "bertambah" : "berkurang"}
                    </span>
                  </>
                )}
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Dihitung sistem, tidak diisi manual.
              </p>
            </div>
          </div>

          {/* Only when stock arrives: goods leaving carry no new cost. */}
          {increasing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Harga beli per unit"
                name="costPerUnit"
                inputMode="decimal"
                value={costPerUnit}
                onChange={(e) => setCostPerUnit(e.target.value)}
                error={fieldErrors.costPerUnit}
                disabled={isConsignment}
                hint={
                  isConsignment
                    ? "Tidak diisi untuk konsinyasi — harga yang berlaku adalah harga saat penagihan."
                    : product?.hppAvg
                      ? "Opsional. Dikosongkan berarti memakai HPP rata-rata yang berlaku."
                      : "Wajib: belum ada HPP untuk barang ini, jadi angka ini yang jadi dasarnya."
                }
                placeholder={
                  product?.hppAvg ? formatMoney(product?.hppAvg) : "mis. 118500"
                }
              />

              <div className="flex items-start gap-2 pt-6">
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
                    Milik supplier sampai laku. Harganya ditentukan saat
                    penagihan, bukan sekarang.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Panel "Yang akan terjadi" disembunyikan: form ini sekarang satu
          kolom penuh. Perkiraannya tetap dihitung — hanya tidak ditampilkan —
          sehingga cukup satu flag untuk mengembalikannya. */}
      {SHOW_OUTCOME_PREVIEW && (
        <div className="flex flex-col gap-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            Yang akan terjadi
          </p>

          {/* No HPP strip: the weighted average is the system's arithmetic over
              every movement, and explaining it here invited a decision this
              screen does not have. FEFO stays, but only where it still runs —
              a lot-tracked product is adjusted at the lot the user named. */}
          {!increasing && !tracksBatches && <FefoPreview rows={fefo} />}

          <JournalPreview
            lines={journal}
            emptyReason={
              delta !== null && !unchanged
                ? "Barang ini belum punya HPP, jadi belum ada nilai untuk dijurnal. Yang berpindah baru kuantitasnya."
                : "Isi stok baru untuk melihat jurnal yang akan dibuat."
            }
          />

          {!increasing && !tracksBatches && fefo.length > 1 && (
            <div className="rounded-lg border border-border bg-accent/50 px-4 py-3 text-xs text-muted">
              Satu permintaan ini akan menulis <b>{fefo.length} baris</b> di
              kartu stok — satu per lot. Itu disengaja: enam bulan lagi,
              pertanyaan &ldquo;batch mana yang keluar&rdquo; masih bisa dijawab
              dari catatan, bukan dikira-kira.
            </div>
          )}

          <p className="text-xs text-muted">
            Perkiraan di atas dihitung ulang oleh server tiap kali angkanya
            berubah. Hasil yang sebenarnya ditentukan saat disimpan — dan itulah
            yang dilaporkan setelah tombol ditekan.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || blocking !== null}>
            {saving ? "Menyimpan…" : "Simpan penyesuaian"}
          </Button>
        </div>

        {blocking && !saving && (
          <p className="text-xs text-muted">
            Belum bisa disimpan: <b>{blocking}</b>
          </p>
        )}

        <p className="text-xs text-muted">
          Kartu stok bersifat <b>append-only</b>. Penyesuaian tidak mengubah
          baris lama — ia menambah baris baru, sehingga koreksi dan kesalahannya
          sama-sama tetap terlihat.
        </p>
      </div>
    </form>
  );
}
