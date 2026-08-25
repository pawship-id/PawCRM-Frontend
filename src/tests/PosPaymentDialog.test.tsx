import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosPaymentDialog } from "@/features/pos/components/PosPaymentDialog";
import { paymentChannelService } from "@/services/paymentChannel.service";
import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import type { PosTransaction } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/pos.service");

const mockedChannels = paymentChannelService as jest.Mocked<
  typeof paymentChannelService
>;
const mockedPos = posService as jest.Mocked<typeof posService>;

const CART_ID = "5a7f1f77bcf86cd7994390e1";
const CASH_ID = "5a7f1f77bcf86cd799439201";
const QRIS_ID = "5a7f1f77bcf86cd799439202";

const channel = (overrides = {}) => ({
  _id: CASH_ID,
  tenantId: "t1",
  type: "cash" as const,
  name: "Kas Toko",
  accountId: "acc-1",
  mdrPercent: 0,
  branchId: null,
  requiresReference: false,
  sortOrder: 0,
  isActive: true,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const cart: PosTransaction = {
  _id: CART_ID,
  tenantId: "t1",
  branchId: "b1",
  warehouseId: "w1",
  shiftId: "s1",
  transactionNumber: null,
  customerId: null,
  customer: null,
  items: [],
  cartDiscount: null,
  otherCharges: [],
  note: null,
  payments: [],
  totals: null,
  customerInvoiceId: null,
  runningTotals: {
    subtotal: "300000.0000",
    itemDiscount: "0.0000",
    cartDiscount: "0.0000",
    otherCharges: "0.0000",
    net: "300000.0000",
  },
  status: "held",
  heldLabel: null,
  bookingIds: [],
  paidAt: null,
  createdAt: "2026-08-25T02:00:00.000Z",
  updatedAt: "2026-08-25T02:00:00.000Z",
};

beforeEach(() => {
  mockedChannels.list.mockResolvedValue({
    items: [
      channel(),
      channel({
        _id: QRIS_ID,
        type: "qris",
        name: "QRIS Xendit",
        mdrPercent: 0.7,
        requiresReference: true,
      }),
    ],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedPos.pay.mockResolvedValue({ ...cart, _id: CART_ID, status: "paid" });
});

function open(overrides: Partial<PosTransaction> = {}) {
  return renderWithAuth(
    <PosPaymentDialog
      cart={{ ...cart, ...overrides }}
      open
      onPaid={jest.fn()}
      onOpenChange={jest.fn()}
    />,
  );
}

/**
 * FR-7.
 *
 * The remainder is what every one of these is really about. Selesaikan enabled
 * one rupiah early is a sale that posts short and a debt nobody recorded.
 */
describe("PosPaymentDialog — the remainder", () => {
  it("keeps Selesaikan disabled until a payment has been added", async () => {
    open();

    await screen.findByRole("button", { name: "Kas Toko" });

    expect(screen.getByRole("button", { name: /selesaikan/i })).toBeDisabled();
  });

  it("offers the whole bill on the first line, which is what most sales are", async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));

    expect(screen.getByLabelText(/jumlah kas toko/i)).toHaveValue("300000");
    expect(
      screen.getByRole("button", { name: /selesaikan/i }),
    ).not.toBeDisabled();
  });

  it("blocks Selesaikan while the sale is underpaid", async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));

    const amount = screen.getByLabelText(/jumlah kas toko/i);
    await user.clear(amount);
    await user.type(amount, "250000");

    // Underpaid is a debt nobody recorded.
    expect(screen.getByRole("button", { name: /selesaikan/i })).toBeDisabled();
    expect(screen.getByText(/Rp\s?50.000/)).toBeInTheDocument();
  });

  it("treats cash tendered above the bill as CHANGE, not an overpayment", async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));

    const amount = screen.getByLabelText(/jumlah kas toko/i);
    await user.clear(amount);
    await user.type(amount, "350000");

    expect(screen.getByText(/kembalian/i)).toBeInTheDocument();
    // The remainder still reads zero, and the drawer still balances.
    expect(
      screen.getByRole("button", { name: /selesaikan/i }),
    ).not.toBeDisabled();
  });

  it("refuses an overpayment that no cash line can absorb", async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole("button", { name: "QRIS" }));
    await user.click(await screen.findByRole("button", { name: "QRIS Xendit" }));

    const amount = screen.getByLabelText(/jumlah qris xendit/i);
    await user.clear(amount);
    await user.type(amount, "350000");

    // The bank has that money; handing over notes for it would empty the till
    // against a receipt saying otherwise.
    expect(await screen.findByText(/kelebihan bayar/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /selesaikan/i })).toBeDisabled();
  });

  it("never shows a negative remainder", async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole("button", { name: "QRIS" }));
    await user.click(await screen.findByRole("button", { name: "QRIS Xendit" }));

    const amount = screen.getByLabelText(/jumlah qris xendit/i);
    await user.clear(amount);
    await user.type(amount, "999999");

    // A "Sisa" of minus seven hundred thousand is a number nobody can act on —
    // an overpayment is its own state with its own sentence.
    expect(screen.queryByText(/-Rp/)).not.toBeInTheDocument();
  });
});

describe("PosPaymentDialog — the channel rules", () => {
  it("asks for a reference only where the channel needs one", async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));

    // A reference field on a cash line is one nobody fills in, which teaches
    // people to skip the ones that matter.
    expect(screen.queryByLabelText(/referensi/i)).not.toBeInTheDocument();
  });

  it("blocks Selesaikan until a required reference is filled in", async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole("button", { name: "QRIS" }));
    await user.click(await screen.findByRole("button", { name: "QRIS Xendit" }));

    // An unmatchable QRIS line is indistinguishable from one that never arrived.
    expect(screen.getByRole("button", { name: /selesaikan/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/referensi qris/i), "QR-4471");

    expect(
      screen.getByRole("button", { name: /selesaikan/i }),
    ).not.toBeDisabled();
  });

  it("splits one sale across two channels", async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));

    const cash = screen.getByLabelText(/jumlah kas toko/i);
    await user.clear(cash);
    await user.type(cash, "100000");

    await user.click(screen.getByRole("button", { name: "QRIS" }));
    await user.click(await screen.findByRole("button", { name: "QRIS Xendit" }));

    // The second line is offered the balance, not the whole bill again.
    expect(screen.getByLabelText(/jumlah qris xendit/i)).toHaveValue("200000");
  });
});

describe("PosPaymentDialog — what it sends", () => {
  it("sends amounts as strings, never as numbers", async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));
    await user.click(screen.getByRole("button", { name: /selesaikan/i }));

    await waitFor(() =>
      expect(mockedPos.pay).toHaveBeenCalledWith(CART_ID, {
        payments: [{ channelId: CASH_ID, amount: "300000" }],
      }),
    );
  });

  it("sends the change it computed, so the drawer matches the receipt", async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));

    const amount = screen.getByLabelText(/jumlah kas toko/i);
    await user.clear(amount);
    await user.type(amount, "350000");
    await user.click(screen.getByRole("button", { name: /selesaikan/i }));

    await waitFor(() =>
      expect(mockedPos.pay).toHaveBeenCalledWith(CART_ID, {
        payments: [
          { channelId: CASH_ID, amount: "350000", change: "50000" },
        ],
      }),
    );
  });

  it("never sends a channel name — the server snapshots it", async () => {
    const user = userEvent.setup();
    open();

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));
    await user.click(screen.getByRole("button", { name: /selesaikan/i }));

    await waitFor(() => expect(mockedPos.pay).toHaveBeenCalled());

    const [, body] = mockedPos.pay.mock.calls[0];
    // Labelling a QRIS line "Kas" would move it into the drawer's expected total.
    expect(body.payments[0]).not.toHaveProperty("channelName");
  });

  it("reports the server's refusal rather than a generic failure", async () => {
    const user = userEvent.setup();
    mockedPos.pay.mockRejectedValue(
      new ApiError("Bad Request", 400, {
        reason: "Remaining: 50000.0000",
      }),
    );

    open();

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));
    await user.click(screen.getByRole("button", { name: /selesaikan/i }));

    expect(await screen.findByText(/Remaining/)).toBeInTheDocument();
  });

  it("scopes the channel list to the sale's branch, and to money coming IN", async () => {
    open();

    await waitFor(() =>
      expect(mockedChannels.list).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: "b1",
          isActive: true,
          // Without this, a bank account the tenant marked pay-out-only would
          // still appear at the till, and the narrowing would work one way.
          usableFor: "in",
        }),
      ),
    );
  });
});

/**
 * Selling on account (FR-7), and FR-2's rule seen from the till.
 *
 * "Pelanggan wajib untuk Piutang; tab Piutang nonaktif + tooltip 'Pilih
 * pelanggan dulu'." The disabling is the easy half. The half worth testing is
 * that the amount is never typed: whatever the payment lines did not cover walks
 * out on account, and a screen that let a cashier name a smaller figure would
 * leave the difference belonging to nobody.
 */
describe("PosPaymentDialog — Piutang", () => {
  const WITH_CUSTOMER = {
    customerId: "cust-1",
    customer: { _id: "cust-1", name: "Bu Sari", phone: "081234567890" },
  };

  beforeEach(() => {
    mockedPos.creditStatus.mockResolvedValue({
      customerId: "cust-1",
      outstanding: "0.0000",
      invoiceCount: 0,
      creditLimit: null,
      remaining: null,
    });
  });

  it("is offered on every sale, so a cashier can see it exists", async () => {
    open();
    expect(await screen.findByRole("button", { name: "Piutang" })).toBeInTheDocument();
  });

  it("is disabled with no customer, and says why in words on the screen", async () => {
    open();

    expect(await screen.findByRole("button", { name: "Piutang" })).toBeDisabled();
    // Not only in a title attribute: a till is touched, not hovered over.
    expect(
      screen.getByText(/pilih pelanggan dulu/i),
    ).toBeInTheDocument();
  });

  it("carries the hint for a shop running this with a mouse too", async () => {
    open();

    const wrapper = (await screen.findByRole("button", { name: "Piutang" }))
      .parentElement;

    expect(wrapper).toHaveAttribute("title", expect.stringMatching(/pilih pelanggan/i));
  });

  it("is enabled once a customer is on the cart", async () => {
    open(WITH_CUSTOMER);
    expect(await screen.findByRole("button", { name: "Piutang" })).toBeEnabled();

    expect(screen.queryByText(/pilih pelanggan dulu/i)).not.toBeInTheDocument();
  });

  it("names the debtor and the amount, without asking for either", async () => {
    const user = userEvent.setup();
    open(WITH_CUSTOMER);

    await user.click(await screen.findByRole("button", { name: "Piutang" }));

    expect(await screen.findByText(/jadi piutang bu sari/i)).toBeInTheDocument();
    /*
      The whole bill, because nothing has been paid towards it — and it appears
      TWICE, in the panel and on the "Sisa jadi piutang" line. That is the
      intended screen: the panel says what the debt is, the line says what is
      still uncovered, and on a sale with no payment they are the same figure.
    */
    expect(screen.getAllByText("Rp 300.000").length).toBeGreaterThan(0);
    // And no field to type it into — that is the point.
    expect(screen.queryByLabelText(/jumlah piutang/i)).not.toBeInTheDocument();
  });

  it("sends the due date and no payment lines when nothing was tendered", async () => {
    const user = userEvent.setup();
    open(WITH_CUSTOMER);

    await user.click(await screen.findByRole("button", { name: "Piutang" }));
    await user.click(screen.getByRole("button", { name: /selesaikan/i }));

    await waitFor(() => expect(mockedPos.pay).toHaveBeenCalled());

    const [, body] = mockedPos.pay.mock.calls[0];
    expect(body.payments).toEqual([]);
    expect(body.credit?.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("defaults to 30 days — FR-7's term", async () => {
    const user = userEvent.setup();
    open(WITH_CUSTOMER);

    await user.click(await screen.findByRole("button", { name: "Piutang" }));

    const field = await screen.findByLabelText(/jatuh tempo/i);
    const due = new Date(`${(field as HTMLInputElement).value}T00:00:00.000Z`);
    const days = Math.round((due.getTime() - Date.now()) / 86_400_000);

    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("sends a date the cashier chose instead", async () => {
    const user = userEvent.setup();
    open(WITH_CUSTOMER);

    await user.click(await screen.findByRole("button", { name: "Piutang" }));
    const field = await screen.findByLabelText(/jatuh tempo/i);
    await user.clear(field);
    await user.type(field, "2026-12-31");

    await user.click(screen.getByRole("button", { name: /selesaikan/i }));
    await waitFor(() => expect(mockedPos.pay).toHaveBeenCalled());

    expect(mockedPos.pay.mock.calls[0][1].credit?.dueDate).toBe("2026-12-31");
  });

  /*
    THE CASE THE WHOLE DESIGN TURNS ON. A cashier takes 100.000 towards a 300.000
    bill and taps Piutang; the remaining 200.000 follows, derived rather than
    typed.
  */
  it("puts only the shortfall on account after a part payment", async () => {
    const user = userEvent.setup();
    open(WITH_CUSTOMER);

    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));
    const amount = screen.getByLabelText(/jumlah/i);
    await user.clear(amount);
    await user.type(amount, "100000");

    await user.click(screen.getByRole("button", { name: "Piutang" }));

    // Both the panel and the remainder line — see above.
    await waitFor(() =>
      expect(screen.getAllByText("Rp 200.000").length).toBeGreaterThan(0),
    );

    await user.click(screen.getByRole("button", { name: /selesaikan/i }));
    await waitFor(() => expect(mockedPos.pay).toHaveBeenCalled());

    const [, body] = mockedPos.pay.mock.calls[0];
    expect(body.payments).toHaveLength(1);
    expect(body.payments[0].amount).toBe("100000");
    expect(body.credit).toBeTruthy();
  });

  it("refuses to submit when the payments already cover the bill", async () => {
    const user = userEvent.setup();
    open(WITH_CUSTOMER);

    // The first line offers the whole bill, so this covers it outright.
    await user.click(await screen.findByRole("button", { name: "Kas Toko" }));
    await user.click(screen.getByRole("button", { name: "Piutang" }));

    expect(screen.getByRole("button", { name: /selesaikan/i })).toBeDisabled();
  });

  it("relabels the remainder — it is what the customer will owe, not a shortfall", async () => {
    const user = userEvent.setup();
    open(WITH_CUSTOMER);

    expect(await screen.findByText("Sisa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Piutang" }));

    expect(await screen.findByText("Sisa jadi piutang")).toBeInTheDocument();
  });

  it("sends no credit at all when the cashier goes back to a cash sale", async () => {
    const user = userEvent.setup();
    open(WITH_CUSTOMER);

    await user.click(await screen.findByRole("button", { name: "Piutang" }));
    await user.click(screen.getByRole("button", { name: "Tunai" }));
    await user.click(screen.getByRole("button", { name: "Kas Toko" }));
    await user.click(screen.getByRole("button", { name: /selesaikan/i }));

    await waitFor(() => expect(mockedPos.pay).toHaveBeenCalled());
    expect(mockedPos.pay.mock.calls[0][1].credit).toBeUndefined();
  });

  /* ------------------------------------------------------------- the plafon */

  it("shows what the customer already owes, and their ceiling", async () => {
    const user = userEvent.setup();
    mockedPos.creditStatus.mockResolvedValue({
      customerId: "cust-1",
      outstanding: "150000.0000",
      invoiceCount: 2,
      creditLimit: "500000.0000",
      remaining: "350000.0000",
    });

    open(WITH_CUSTOMER);
    await user.click(await screen.findByRole("button", { name: "Piutang" }));

    expect(await screen.findByText(/Rp 150.000/)).toBeInTheDocument();
    expect(screen.getByText(/plafon Rp 500.000/)).toBeInTheDocument();
  });

  it("warns when the sale would go past the plafon", async () => {
    const user = userEvent.setup();
    mockedPos.creditStatus.mockResolvedValue({
      customerId: "cust-1",
      outstanding: "400000.0000",
      invoiceCount: 1,
      creditLimit: "500000.0000",
      remaining: "100000.0000",
    });

    open(WITH_CUSTOMER);
    await user.click(await screen.findByRole("button", { name: "Piutang" }));

    expect(await screen.findByText(/melebihi plafon/i)).toBeInTheDocument();
  });

  /*
    ADVISORY, NEVER BLOCKING. The server decides, and it decides again against
    figures that may have moved since this was fetched. A client-side refusal
    would be a second authority that can disagree with the first — and a cashier
    stuck behind a stale number with a customer waiting.
  */
  it("still lets the sale be submitted past the plafon — the server decides", async () => {
    const user = userEvent.setup();
    mockedPos.creditStatus.mockResolvedValue({
      customerId: "cust-1",
      outstanding: "400000.0000",
      invoiceCount: 1,
      creditLimit: "500000.0000",
      remaining: "100000.0000",
    });

    open(WITH_CUSTOMER);
    await user.click(await screen.findByRole("button", { name: "Piutang" }));
    await screen.findByText(/melebihi plafon/i);

    expect(screen.getByRole("button", { name: /selesaikan/i })).toBeEnabled();
  });

  it("says so plainly when the plafon cannot be read, and carries on", async () => {
    const user = userEvent.setup();
    mockedPos.creditStatus.mockRejectedValue(new Error("offline"));

    open(WITH_CUSTOMER);
    await user.click(await screen.findByRole("button", { name: "Piutang" }));

    expect(
      await screen.findByText(/piutang berjalan tidak bisa dibaca/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /selesaikan/i })).toBeEnabled();
  });

  it("surfaces the server's refusal rather than a generic failure", async () => {
    const user = userEvent.setup();
    mockedPos.pay.mockRejectedValue(
      new ApiError("Melebihi plafon kredit pelanggan", 409, {
        reason: "Bu Sari sudah punya piutang 400000.0000 dari plafon 500000.0000.",
      }),
    );

    open(WITH_CUSTOMER);
    await user.click(await screen.findByRole("button", { name: "Piutang" }));
    await user.click(screen.getByRole("button", { name: /selesaikan/i }));

    expect(await screen.findByText(/sudah punya piutang/i)).toBeInTheDocument();
  });
});
