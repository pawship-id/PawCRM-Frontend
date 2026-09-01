import { render, screen } from "@testing-library/react";

import { PosSettlementCard } from "@/features/sales/components/PosSettlementCard";
import type { CustomerInvoiceDetail } from "@/types/api";

/**
 * HOW THE COUNTER SETTLED A SALE, on the invoice that mirrors it.
 *
 * WHY IT IS NOT PART OF "Riwayat pembayaran", which is the whole reason this
 * component exists: that list means "money collected against this debt, each
 * with its own reversible journal entry", and every row there carries a Batalkan
 * button. A till sale's settlement was posted INSIDE the sale's single revenue
 * entry — there is nothing per-line to reverse, and a row offering to do it
 * would also make the sale unvoidable. So these rows are read-only and say where
 * the money CAN be undone.
 */
type Settlement = NonNullable<CustomerInvoiceDetail["posSettlement"]>;

const settlement = (overrides: Partial<Settlement> = {}): Settlement => ({
  transactionNumber: "TRX-2026-0007",
  paidAt: "2026-09-01T03:00:00.000Z",
  payments: [
    {
      channelId: "ch1",
      channelName: "Kas Laci",
      channelType: "cash",
      amount: "620000.0000",
      change: "10000.0000",
      reference: null,
    },
  ],
  credit: "0.0000",
  ...overrides,
});

describe("what a row says", () => {
  it("names the amount, the kind of channel and the account it landed in", () => {
    render(<PosSettlementCard settlement={settlement()} />);

    expect(screen.getByText("Rp 620.000")).toBeInTheDocument();
    expect(screen.getByText("tunai")).toBeInTheDocument();
    expect(screen.getByText(/Masuk ke Kas Laci/)).toBeInTheDocument();
  });

  /*
    "Rp 620.000 tunai" against a Rp 610.000 bill reads as an overcharge until the
    change handed back is beside it.
  */
  it("shows the change given back on a cash line", () => {
    render(<PosSettlementCard settlement={settlement()} />);

    expect(screen.getByText(/kembalian Rp 10\.000/)).toBeInTheDocument();
  });

  it("says nothing about change when none was given", () => {
    render(
      <PosSettlementCard
        settlement={settlement({
          payments: [
            {
              channelId: "ch2",
              channelName: "BCA 1234",
              channelType: "transfer",
              amount: "610000.0000",
              change: null,
              reference: "TRF-99",
            },
          ],
        })}
      />,
    );

    expect(screen.queryByText(/kembalian/)).not.toBeInTheDocument();
    expect(screen.getByText(/TRF-99/)).toBeInTheDocument();
  });

  /* An unknown channel type still names itself rather than rendering blank. */
  it("falls back to the channel's own type word", () => {
    render(
      <PosSettlementCard
        settlement={settlement({
          payments: [
            {
              channelId: "ch3",
              channelName: "Voucher",
              channelType: "voucher",
              amount: "50000.0000",
              change: null,
              reference: null,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("voucher")).toBeInTheDocument();
  });

  it("names the transaction the money belongs to", () => {
    render(<PosSettlementCard settlement={settlement()} />);

    expect(screen.getByText(/TRX-2026-0007/)).toBeInTheDocument();
  });
});

describe("what it refuses to offer", () => {
  /*
    NO CANCEL AND NO PRINT. There is no per-line entry to reverse, and the
    receipt for this money is the sale's own struk.
  */
  it("gives no buttons at all", () => {
    render(<PosSettlementCard settlement={settlement()} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  /*
    SAID ONCE, so somebody hunting for a cancel button is sent to the till rather
    than left wondering why there is none.
  */
  it("says where the money can be undone instead", () => {
    render(<PosSettlementCard settlement={settlement()} />);

    expect(screen.getByText(/Void atau Retur di halaman kasir/)).toBeInTheDocument();
  });
});

describe("an empty settlement", () => {
  it("says so rather than rendering an empty list", () => {
    render(<PosSettlementCard settlement={settlement({ payments: [] })} />);

    expect(
      screen.getByText(/tidak mencatat pembayaran/i),
    ).toBeInTheDocument();
  });
});
