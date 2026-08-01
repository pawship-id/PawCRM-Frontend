import {
  absDecimal,
  formatMoney,
  formatMoneyPrecise,
  formatQty,
  toDecimalString,
  toMinor,
} from "@/utils/decimal";
import type { HppPreview } from "../data/demoStore";

/**
 * The weighted-average calculation, shown as arithmetic rather than as a result.
 *
 * WHY IT IS SPELLED OUT. `hppAvg` is the number every margin report and every
 * COGS posting is built on, and it moves on its own whenever goods arrive at a
 * price different from the last. A user who sees only "HPP: Rp 243.750" has no
 * way to check it, and no way to notice when it moved for a reason they did not
 * intend. Showing the terms — old stock × old average, plus new stock × new
 * price, over the new total — turns an opaque field into something a shop owner
 * can verify against their own invoice.
 *
 * Every number below goes through the decimal helpers, never `Number()`. A
 * component that re-derived these with float arithmetic would reintroduce the
 * error the string contract exists to prevent, in the one place a user is
 * guaranteed to look.
 */
export function HppStrip({ preview }: { preview: HppPreview | null }) {
  if (!preview) return null;

  const beforeMinor = toMinor(preview.before ?? "0") ?? 0n;
  const afterMinor = toMinor(preview.after) ?? 0n;
  const qtyBeforeMinor = toMinor(preview.qtyBefore) ?? 0n;
  const qtyInMinor = toMinor(preview.qtyIn) ?? 0n;

  // Negative stock is treated as zero when weighting — see weightedAverage.
  const qtyAfter = toDecimalString(
    (qtyBeforeMinor > 0n ? qtyBeforeMinor : 0n) + qtyInMinor,
  );
  const delta = afterMinor - beforeMinor;
  const first = preview.before === null;

  return (
    <div className="rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-primary-hover">
        Perhitungan HPP rata-rata tertimbang
      </p>

      <p className="mt-2 overflow-x-auto whitespace-nowrap font-mono text-[13px] leading-7 text-foreground">
        {first ? (
          <>
            Belum ada stok bernilai <span className="text-muted">→</span> HPP
            pertama ={" "}
            <b className="text-primary-hover">
              {formatMoneyPrecise(preview.after)}
            </b>
          </>
        ) : (
          <>
            ({formatQty(preview.qtyBefore)} <span className="text-muted">×</span>{" "}
            {formatMoney(preview.before)}) <span className="text-muted">+</span>{" "}
            ({formatQty(preview.qtyIn)} <span className="text-muted">×</span>{" "}
            {formatMoney(preview.unitCost)}) <span className="text-muted">÷</span>{" "}
            {formatQty(qtyAfter)} <span className="text-muted">=</span>{" "}
            <b className="text-primary-hover">
              {formatMoneyPrecise(preview.after)}
            </b>
          </>
        )}
      </p>

      {!first && (
        <p className="mt-1 font-mono text-xs">
          {delta === 0n ? (
            <span className="text-muted">
              tidak berubah — barang masuk pada harga rata-rata yang berlaku
            </span>
          ) : (
            <span className={delta > 0n ? "text-danger" : "text-success"}>
              {delta > 0n ? "▲ naik " : "▼ turun "}
              {formatMoneyPrecise(absDecimal(toDecimalString(delta)))} per unit
            </span>
          )}
        </p>
      )}
    </div>
  );
}
