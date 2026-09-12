import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CashTransactionCreateForm } from "@/features/cash-transactions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import type { ChartOfAccountNode } from "@/types/accounting";
import type { PaymentChannelListQuery } from "@/types/api";

import { cashTx, channel, channelPage } from "./helpers/cashTransactionFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => mockPush(href) }),
}));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * CATAT TRANSAKSI. What it guards: Simpan stays off — and says why — until the
 * required fields are answered; the pickers offer only what the server accepts
 * (active accounts of the right class, channels usable in the right direction
 * at the branch); and the payload is exactly the contract.
 */
const account = (
  overrides: Partial<ChartOfAccountNode> &
    Pick<ChartOfAccountNode, "_id" | "code" | "name" | "accountType">,
): ChartOfAccountNode => ({
  parentAccountId: null,
  businessLineId: null,
  isDefault: false,
  isActive: true,
  children: [],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  asMock(branchService.list).mockResolvedValue({
    items: [{ _id: "b1", name: "Cabang Pusat" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
  asMock(paymentChannelService.list).mockImplementation(
    async (query?: PaymentChannelListQuery) =>
      query?.usableFor === "in"
        ? channelPage([
            channel({ _id: "ch-kas", name: "Kas Laci", type: "cash" }),
            channel({ _id: "ch-qris", name: "QRIS BCA", type: "qris" }),
          ])
        : channelPage([
            channel({ _id: "ch-kas", name: "Kas Laci", type: "cash" }),
            channel({ _id: "ch-bca", name: "BCA Operasional", type: "transfer" }),
          ]),
  );
  asMock(chartOfAccountsService.tree).mockResolvedValue([
    account({
      _id: "acc-listrik",
      code: "5401",
      name: "Beban Listrik",
      accountType: "expense",
    }),
    account({
      _id: "acc-lama",
      code: "5499",
      name: "Beban Lama",
      accountType: "expense",
      isActive: false,
    }),
    account({
      _id: "acc-bunga",
      code: "4201",
      name: "Pendapatan Bunga",
      accountType: "income",
    }),
  ]);
  asMock(businessLineService.list).mockResolvedValue({
    items: [{ _id: "bl-groom", name: "Grooming", color: "navy" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  });
  asMock(cashTransactionService.create).mockResolvedValue(
    cashTx({
      _id: "ct9",
      number: "BKK/CBS/2609/0004",
      direction: "out",
      kind: "expense",
    }),
  );
});

async function pick(
  user: ReturnType<typeof userEvent.setup>,
  trigger: string,
  option: string,
) {
  const button = screen.getByRole("button", { name: trigger });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("CashTransactionCreateForm", () => {
  it("keeps Simpan off, saying why, until the required fields are answered", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);

    const submit = await screen.findByRole("button", {
      name: "Simpan pengeluaran",
    });
    // The one branch is filled in; the channel is not.
    expect(await screen.findByText("Channel belum dipilih")).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await pick(user, "Channel", "Kas Laci");
    expect(
      await screen.findByText("Akun di baris 1 belum dipilih"),
    ).toBeInTheDocument();

    await pick(user, "Akun baris 1", "5401 · Beban Listrik");
    expect(
      await screen.findByText("Jumlah di baris 1 belum diisi"),
    ).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Jumlah baris 1"), "75000");
    expect(submit).toBeEnabled();
  });

  it("offers only active expense accounts and out-going channels for Pengeluaran", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);

    await waitFor(() =>
      expect(paymentChannelService.list).toHaveBeenCalledWith(
        expect.objectContaining({ usableFor: "out", branchId: "b1", isActive: true }),
      ),
    );

    const accountTrigger = await screen.findByRole("button", { name: "Akun baris 1" });
    await user.click(accountTrigger);
    expect(
      await screen.findByRole("option", { name: "5401 · Beban Listrik" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "5499 · Beban Lama" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "4201 · Pendapatan Bunga" }),
    ).not.toBeInTheDocument();
  });

  it("switches to income accounts and receiving channels for Pemasukan", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);
    await screen.findByRole("button", { name: "Simpan pengeluaran" });

    await user.click(screen.getByRole("button", { name: "Pemasukan" }));

    expect(
      screen.getByRole("button", { name: "Simpan pemasukan" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(paymentChannelService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ usableFor: "in", branchId: "b1" }),
      ),
    );

    await pick(user, "Channel", "QRIS BCA");
    await user.click(screen.getByRole("button", { name: "Akun baris 1" }));
    expect(
      await screen.findByRole("option", { name: "4201 · Pendapatan Bunga" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "5401 · Beban Listrik" }),
    ).not.toBeInTheDocument();
  });

  it("sends the contract's payload, then opens the new transaction", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);
    await screen.findByRole("button", { name: "Simpan pengeluaran" });

    await pick(user, "Channel", "Kas Laci");
    await user.type(screen.getByLabelText("Nama pihak"), "PLN");
    await user.type(screen.getByLabelText("No. referensi"), "NOTA-88");
    await user.type(screen.getByLabelText("Keterangan"), "Listrik Agustus");

    await pick(user, "Akun baris 1", "5401 · Beban Listrik");
    await pick(user, "Lini bisnis baris 1", "Grooming");
    await user.type(screen.getByLabelText("Jumlah baris 1"), "75000");
    await user.type(screen.getByLabelText("Memo baris 1"), "Agustus");

    await user.click(screen.getByRole("button", { name: "Simpan pengeluaran" }));

    await waitFor(() =>
      expect(cashTransactionService.create).toHaveBeenCalledWith({
        kind: "expense",
        branchId: "b1",
        channelId: "ch-kas",
        partyName: "PLN",
        cashflowType: "operating",
        ref: "NOTA-88",
        note: "Listrik Agustus",
        // Today is not sent — the server stamps the time as well.
        lines: [
          {
            accountId: "acc-listrik",
            amount: "75000",
            businessLineId: "bl-groom",
            memo: "Agustus",
          },
        ],
      }),
    );
    expect(swalToast).toHaveBeenCalledWith("Transaksi BKK/CBS/2609/0004 tersimpan.");
    expect(mockPush).toHaveBeenCalledWith("/dashboard/keuangan/transaksi/ct9");
  });

  it("adds up several lines into the transaction's total", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);
    await screen.findByRole("button", { name: "Simpan pengeluaran" });

    await user.click(await screen.findByRole("button", { name: "Tambah baris" }));
    await user.type(screen.getByLabelText("Jumlah baris 1"), "75000");
    await user.type(screen.getByLabelText("Jumlah baris 2"), "25000");

    expect(screen.getByText("Rp 100.000")).toBeInTheDocument();
  });

  it("shows the server's refusal verbatim", async () => {
    const user = userEvent.setup();
    asMock(cashTransactionService.create).mockRejectedValue(
      new ApiError("Account 5401 is not an active expense account", 400),
    );

    renderWithAuth(<CashTransactionCreateForm />);
    await screen.findByRole("button", { name: "Simpan pengeluaran" });

    await pick(user, "Channel", "Kas Laci");
    await pick(user, "Akun baris 1", "5401 · Beban Listrik");
    await user.type(screen.getByLabelText("Jumlah baris 1"), "75000");
    await user.click(screen.getByRole("button", { name: "Simpan pengeluaran" }));

    expect(
      await screen.findByText(/not an active expense account/),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
