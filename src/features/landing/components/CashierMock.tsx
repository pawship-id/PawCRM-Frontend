import { MOCK_LINES } from "../content";

/**
 * The till, as the hero's illustration.
 *
 * WHITE, NOT NAVY, sitting on the navy hero. The product runs on a white
 * surface and this is the first look anybody gets at it; tinting it to match the
 * hero would sell a screen that does not exist.
 *
 * THE FIGURES ARE AN EXAMPLE AND THE PANEL SAYS SO. What they are not is
 * invented behaviour: every badge, label and button below is one the till really
 * draws, down to the two buttons being Simpan and Bayar in that order.
 */
export function CashierMock() {
  return (
    <div className="rounded-2xl bg-surface p-5 text-foreground shadow-lg sm:p-6">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3.5">
        <p className="text-base font-bold">
          Kasir{" "}
          <span className="text-sm font-normal text-muted">
            · Cabang Pusat · Gudang Pusat
          </span>
        </p>
        <span className="rounded-full bg-tint-success px-2.5 py-1 text-xs font-bold whitespace-nowrap text-success">
          Shift #12 buka 08.00
        </span>
      </div>

      <ul>
        {MOCK_LINES.map((line) => (
          <li
            key={line.name}
            className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
          >
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-tint-brand font-display text-[15px] font-extrabold text-primary"
            >
              {line.initial}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-snug font-semibold">
                {line.name}
              </span>
              <span className="block text-sm text-muted">
                {line.detail}
                {line.badge && (
                  <>
                    {" · "}
                    <span className="rounded-full bg-tint-warning px-2 py-0.5 text-xs font-bold text-warning">
                      {line.badge}
                    </span>
                  </>
                )}
              </span>
            </span>
            <span className="text-sm font-medium tabular-nums whitespace-nowrap">
              {line.amount}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex justify-between gap-3 border-t border-border pt-3 text-sm text-muted">
        <span>Diskon keranjang · 5%</span>
        <span className="font-semibold tabular-nums text-success">
          −Rp 24.550
        </span>
      </div>

      <div className="mt-2.5 flex items-baseline justify-between border-t border-dashed border-border pt-3">
        <span className="text-sm text-muted">Total</span>
        <span className="font-display text-2xl font-extrabold tabular-nums">
          Rp 466.450
        </span>
      </div>

      {/*
        SIMPAN IS THE SMALLER HALF, and it is on the left. Parking a basket is
        the rarer of the two, and a shop that parks one is not finishing a sale —
        giving both buttons equal weight is how a cashier taps the wrong one with
        somebody's card already out.
      */}
      <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2.5">
        <span className="inline-flex h-12 items-center justify-center rounded-lg border-[1.5px] border-primary/40 bg-surface text-[15px] font-semibold text-primary">
          Simpan
        </span>
        <span className="inline-flex h-12 items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground">
          Bayar
        </span>
      </div>

      <p className="mt-3.5 text-sm leading-relaxed text-muted">
        <span className="font-semibold text-foreground">Contoh layar kasir.</span>{" "}
        Setelah pembayarannya lunas: stok berkurang, jurnal penjualan dan HPP
        tercatat, fakturnya terbit, dan struknya bisa dikirim sebagai link
        WhatsApp.
      </p>
    </div>
  );
}
