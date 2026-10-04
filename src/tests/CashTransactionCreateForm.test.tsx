import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CashTransactionCreateForm } from "@/features/cash-transactions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { fixedCostService } from "@/services/fixedCost.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { customerService } from "@/services/customer.service";
import { supplierService } from "@/services/supplier.service";
import { userService } from "@/services/user.service";
import type { ChartOfAccountNode } from "@/types/accounting";
import { accountTypeOf } from "@/types/accounting";

import { cashTx } from "./helpers/cashTransactionFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/supplier.service");
jest.mock("@/services/user.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/fixedCost.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => mockPush(href) }),
}));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * TAMBAH TRANSAKSI. What it guards: Simpan stays off — and says why — until the
 * required fields are answered; the Akun Kas/Bank picker offers every active
 * account filed under Kas & Bank and NO channels at all; the account's own jenis
 * decides the series; the header's Lini Usaha seeds the rows; and the payload is
 * exactly the contract, Operasi included.
 */
const account = (
  overrides: Partial<ChartOfAccountNode> &
    Pick<ChartOfAccountNode, "_id" | "code" | "name" | "accountCategory">,
): ChartOfAccountNode => ({
  parentAccountId: null,
  allocations: [],
  isDefault: false,
  isActive: true,
  children: [],
  // The class is DERIVED, the way the server derives it — a fixture stating
  // both could claim a pair the API cannot produce, and the pickers here filter
  // on the class while the chart groups on the category.
  accountType: accountTypeOf(overrides.accountCategory),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  asMock(branchService.list).mockResolvedValue({
    items: [{ _id: "b1", name: "Cabang Pusat" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
  // The three registers behind the Penerima / Pengirim picker.
  const page = <T,>(items: T[]) => ({
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  });
  asMock(customerService.list).mockResolvedValue(
    page([{ _id: "cus-1", name: "Pet Shop Melati" }]) as never,
  );
  asMock(supplierService.list).mockResolvedValue(
    page([{ _id: "sup-1", name: "CV Grooming Supplies" }]) as never,
  );
  asMock(userService.list).mockResolvedValue(
    page([{ _id: "usr-1", fullName: "Sari" }]) as never,
  );
  asMock(chartOfAccountsService.tree).mockResolvedValue([
    // `cashType` is what decides BKM/BKK against BBM/BBK now that no channel
    // is involved — see the account model.
    account({
      _id: "acc-kas",
      code: "1101",
      name: "Kas Pusat",
      accountCategory: "cash_bank",
      cashType: "cash",
    }),
    account({
      _id: "acc-bca",
      code: "1102",
      name: "Bank BCA",
      accountCategory: "cash_bank",
      cashType: "bank",
    }),
    // Retired in Daftar Akun — offered by neither picker.
    account({
      _id: "acc-lama-kas",
      code: "1109",
      name: "Kas Lama",
      accountCategory: "cash_bank",
      cashType: "cash",
      isActive: false,
    }),
    account({
      _id: "acc-listrik",
      code: "5401",
      name: "Beban Listrik",
      accountCategory: "biaya",
    }),
    account({
      _id: "acc-lama",
      code: "5499",
      name: "Beban Lama",
      accountCategory: "biaya",
      isActive: false,
    }),
    account({
      _id: "acc-bunga",
      code: "4201",
      name: "Pendapatan Bunga",
      accountCategory: "pendapatan_lainnya",
    }),
  ]);
  asMock(businessLineService.list).mockResolvedValue({
    items: [
      { _id: "bl-groom", name: "Grooming", color: "navy" },
      { _id: "bl-retail", name: "Retail", color: "navy" },
    ],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
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
      name: "Simpan transaksi",
    });
    // The one branch is filled in; the cash account is not.
    expect(
      await screen.findByText("Akun kas/bank belum dipilih"),
    ).toBeInTheDocument();
    expect(submit).toBeDisabled();

    await pick(user, "Akun Kas/Bank", "1101 · Kas Pusat");
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

  it("lists every active Kas & Bank account and no channels at all", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);

    await user.click(
      await screen.findByRole("button", { name: "Akun Kas/Bank" }),
    );

    // Accounts, in code order. The retired one is not offered, and neither is
    // anything that is not filed under Kas & Bank.
    expect(
      (await screen.findAllByRole("option")).map((row) => row.textContent),
    ).toEqual(["1101 · Kas Pusat", "1102 · Bank BCA"]);
  });

  /** No channel states the class any more, so the account's own jenis does. */
  it("reads the bukti kas series off the account's jenis", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);
    await screen.findByRole("button", { name: "Simpan transaksi" });

    await pick(user, "Akun Kas/Bank", "1101 · Kas Pusat");
    expect(await screen.findByText(/seri BKK/)).toBeInTheDocument();

    await pick(user, "Akun Kas/Bank", "1102 · Bank BCA");
    expect(await screen.findByText(/seri BBK/)).toBeInTheDocument();
  });

  /**
   * An account has no direction — a bank account both receives and pays — so
   * flipping the toggle must not silently unpick it, the way the channel it
   * replaced had to be.
   */
  it("keeps the chosen account when the direction flips", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);
    await screen.findByRole("button", { name: "Simpan transaksi" });

    await pick(user, "Akun Kas/Bank", "1102 · Bank BCA");
    await user.click(screen.getByRole("button", { name: "Uang masuk" }));

    expect(await screen.findByText(/seri BBM/)).toBeInTheDocument();
    expect(
      screen.queryByText("Akun kas/bank belum dipilih"),
    ).not.toBeInTheDocument();
  });

  it("switches to income accounts for Uang masuk", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);
    await screen.findByRole("button", { name: "Simpan transaksi" });

    await user.click(screen.getByRole("button", { name: "Uang masuk" }));

    // The party field asks the other question.
    expect(screen.getByLabelText("Pengirim")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Akun baris 1" }));
    expect(
      await screen.findByRole("option", { name: "4201 · Pendapatan Bunga" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "5401 · Beban Listrik" }),
    ).not.toBeInTheDocument();
  });

  it("offers only active expense accounts for Uang keluar", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);

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

  /*
    ONE FORM, TWO DOORS (21 September 2026, on request). A fixed cost IS a
    transaction somebody also means to repeat, so Tambah biaya tetap is this
    form with the switch pre-answered — the URL is the difference.
  */
  describe("as biaya tetap", () => {
    async function fillMinimum(user: ReturnType<typeof userEvent.setup>) {
      await pick(user, "Akun Kas/Bank", "1101 · Kas Pusat");
      await pick(user, "Akun baris 1", "5401 · Beban Listrik");
      await user.type(screen.getByLabelText("Jumlah baris 1"), "3500000");
    }

    /*
      THE SWITCH IS THE ONLY DIFFERENCE. `/kas-bank/biaya-tetap/new` was a
      second route that opened this form with it pre-answered; it is gone, so
      every case here turns it on for itself.
    */
    async function turnOn(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByLabelText("Jadikan biaya tetap"));
    }

    it("hides the schedule's fields until the switch is on", async () => {
      const user = userEvent.setup();
      renderWithAuth(<CashTransactionCreateForm />);
      await screen.findByRole("button", { name: "Simpan transaksi" });

      expect(
        screen.queryByLabelText(/Nama biaya tetap/),
      ).not.toBeInTheDocument();

      await user.click(screen.getByLabelText("Jadikan biaya tetap"));

      expect(screen.getByLabelText(/Nama biaya tetap/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Pengulangan/)).toBeInTheDocument();
    });

    it("opens with the switch off, whichever tab somebody came from", async () => {
      renderWithAuth(<CashTransactionCreateForm />);
      await screen.findByRole("button", { name: "Simpan transaksi" });

      expect(screen.getByLabelText("Jadikan biaya tetap")).not.toBeChecked();
    });

    /*
      A SCHEDULE NEEDS A NAME, which a transaction does not: a transaction is
      identified by its number, and a template recurs, so the name is the only
      stable handle anybody has on it.
    */
    it("will not save a schedule with no name, and says so", async () => {
      const user = userEvent.setup();
      renderWithAuth(<CashTransactionCreateForm />);
      await screen.findByRole("button", { name: "Simpan transaksi" });

      await turnOn(user);
      // Everything a plain transaction needs is answered; only the schedule's
      // own field is missing.
      await fillMinimum(user);

      expect(
        screen.getByRole("button", { name: "Simpan transaksi" }),
      ).toBeDisabled();
      expect(
        await screen.findByText("Nama biaya tetap belum diisi"),
      ).toBeInTheDocument();
    });

    /*
      THE OCCURRENCE IS POSTED THROUGH THE SCHEDULE, not written beside it:
      that is what moves `nextDueAt` on, so the row lands in Biaya Tetap showing
      next month rather than a month in arrears for a rent just paid.
    */
    it("writes the schedule, then records its first occurrence through it", async () => {
      const user = userEvent.setup();
      asMock(fixedCostService.create).mockResolvedValue({
        _id: "fc9",
        name: "Sewa toko",
      } as never);
      asMock(fixedCostService.post).mockResolvedValue({} as never);

      renderWithAuth(<CashTransactionCreateForm />);
      await screen.findByRole("button", { name: "Simpan transaksi" });

      await turnOn(user);
      await fillMinimum(user);
      await user.type(
        screen.getByLabelText(/Nama biaya tetap/),
        "Sewa toko",
      );

      await user.click(screen.getByRole("button", { name: "Simpan transaksi" }));

      await waitFor(() =>
        expect(fixedCostService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "Sewa toko",
            kind: "expense",
            accountId: "acc-kas",
            interval: "monthly",
          }),
        ),
      );
      await waitFor(() =>
        expect(fixedCostService.post).toHaveBeenCalledWith(
          "fc9",
          expect.objectContaining({ at: expect.any(String) }),
        ),
      );
      // The plain transaction endpoint is NOT also called — one occurrence, one
      // path, and no chance of the money landing twice.
      expect(cashTransactionService.create).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith(
        "/dashboard/keuangan/kas-bank/biaya-tetap/fc9",
      );
    });

    /*
      THE SCHEDULE EXISTS even when its first occurrence does not. Saying
      otherwise would send somebody to make the same schedule again.
    */
    it("says the schedule survived when only the first occurrence failed", async () => {
      const user = userEvent.setup();
      asMock(fixedCostService.create).mockResolvedValue({
        _id: "fc9",
        name: "Sewa toko",
      } as never);
      asMock(fixedCostService.post).mockRejectedValue(
        new Error("account closed"),
      );

      renderWithAuth(<CashTransactionCreateForm />);
      await screen.findByRole("button", { name: "Simpan transaksi" });

      await turnOn(user);
      await fillMinimum(user);
      await user.type(screen.getByLabelText(/Nama biaya tetap/), "Sewa toko");
      await user.click(screen.getByRole("button", { name: "Simpan transaksi" }));

      expect(
        await screen.findByText(/tersimpan, tapi transaksi pertamanya gagal/),
      ).toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    /*
      SAVING HERE IS TWO ACTS AND TWO GRANTS. Blocking up front beats letting
      the second call fail on a form somebody has already filled in.
    */
    it("blocks Simpan for a role that may not post", async () => {
      const user = userEvent.setup();
      renderWithAuth(<CashTransactionCreateForm />, {
        isSuperAdmin: false,
        permissions: [
          { feature: "cashTransactions", actions: ["read", "create"] },
          { feature: "fixedCosts", actions: ["read", "create"] },
          { feature: "chartOfAccounts", actions: ["read"] },
          { feature: "branches", actions: ["read"] },
        ],
      });
      await screen.findByRole("button", { name: "Simpan transaksi" });
      await turnOn(user);

      expect(
        await screen.findByText("Kamu belum boleh mencatat biaya tetap"),
      ).toBeInTheDocument();
    });
  });

  it("sends the contract's payload, then opens the new transaction", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);
    await screen.findByRole("button", { name: "Simpan transaksi" });

    await pick(user, "Akun Kas/Bank", "1101 · Kas Pusat");
    await pick(user, "Penerima", "CV Grooming Supplies");
    await user.type(screen.getByLabelText("Deskripsi"), "Listrik Agustus");

    await pick(user, "Akun baris 1", "5401 · Beban Listrik");
    await pick(user, "Lini bisnis baris 1", "Grooming");
    await user.type(screen.getByLabelText("Jumlah baris 1"), "75000");
    await user.type(screen.getByLabelText("Memo baris 1"), "Agustus");

    await user.click(screen.getByRole("button", { name: "Simpan transaksi" }));

    await waitFor(() =>
      expect(cashTransactionService.create).toHaveBeenCalledWith({
        kind: "expense",
        branchId: "b1",
        accountId: "acc-kas",
        // The picker sends the register and the id; the server snapshots the
        // name, so the client never states one it could get wrong.
        partyType: "supplier",
        partyId: "sup-1",
        // Not a field any more; sent so the entry still lands in Arus Kas.
        cashflowType: "operating",
        note: "Listrik Agustus",
        // Today is not sent — the server stamps the time as well.
        lines: [
          {
            accountId: "acc-listrik",
            amount: "75000",
            businessLineId: "bl-groom",
            // Null because the account carries no Detil Akun to pick from.
            allocationId: null,
            memo: "Agustus",
          },
        ],
      }),
    );
    expect(swalToast).toHaveBeenCalledWith("Transaksi BKK/CBS/2609/0004 tersimpan.");
    expect(mockPush).toHaveBeenCalledWith("/dashboard/keuangan/kas-bank/transaksi/ct9");
  });

  it("uses the header's Lini Usaha for the rows, and leaves an edited row alone", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);
    await screen.findByRole("button", { name: "Simpan transaksi" });

    await pick(user, "Akun Kas/Bank", "1101 · Kas Pusat");
    await pick(user, "Akun baris 1", "5401 · Beban Listrik");
    await user.type(screen.getByLabelText("Jumlah baris 1"), "75000");

    // The header carries the untouched first row along…
    await pick(user, "Lini Usaha", "Grooming");
    // …and seeds the row added after it.
    await user.click(screen.getByRole("button", { name: "Tambah baris" }));
    await pick(user, "Akun baris 2", "5401 · Beban Listrik");
    await user.type(screen.getByLabelText("Jumlah baris 2"), "25000");
    // A row set by hand keeps what it was set to.
    await pick(user, "Lini bisnis baris 2", "Retail");

    await user.click(screen.getByRole("button", { name: "Simpan transaksi" }));

    await waitFor(() =>
      expect(cashTransactionService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lines: [
            expect.objectContaining({ amount: "75000", businessLineId: "bl-groom" }),
            expect.objectContaining({ amount: "25000", businessLineId: "bl-retail" }),
          ],
        }),
      ),
    );
  });

  /**
   * `partyType` is exactly customer | supplier | user, so the three headings are
   * what the field can BE — and "Nama lain…" is the way out of them, for the
   * landlords and utilities no register holds.
   */
  it("offers the three registers under their own headings", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);

    await user.click(await screen.findByRole("button", { name: "Penerima" }));

    expect(
      await screen.findByRole("group", { name: "Pelanggan" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Supplier" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Staf" })).toBeInTheDocument();
    expect(
      (await screen.findAllByRole("option")).map((row) => row.textContent),
    ).toEqual([
      "Pet Shop Melati",
      "CV Grooming Supplies",
      "Sari",
      "Nama lain…",
    ]);
  });

  it("asks the label of the side the money is on", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);
    await screen.findByRole("button", { name: "Penerima" });

    await user.click(screen.getByRole("button", { name: "Uang masuk" }));
    expect(
      await screen.findByRole("button", { name: "Pengirim" }),
    ).toBeInTheDocument();
  });

  it("takes a typed name for somebody no register holds", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);
    await screen.findByRole("button", { name: "Simpan transaksi" });

    await pick(user, "Akun Kas/Bank", "1101 · Kas Pusat");
    await pick(user, "Akun baris 1", "5401 · Beban Listrik");
    await user.type(screen.getByLabelText("Jumlah baris 1"), "75000");

    await pick(user, "Penerima", "Nama lain…");
    // The name is then required — an escape hatch nobody filled in is a blank.
    expect(
      await screen.findByText("Nama penerima belum diisi"),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Nama penerima/), "PLN");
    await user.click(screen.getByRole("button", { name: "Simpan transaksi" }));

    await waitFor(() =>
      expect(cashTransactionService.create).toHaveBeenCalledWith(
        expect.objectContaining({ partyName: "PLN" }),
      ),
    );
    const [sent] = asMock(cashTransactionService.create).mock.calls[0];
    expect(sent).not.toHaveProperty("partyType");
  });

  it("adds up several lines into the transaction's total", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionCreateForm />);
    await screen.findByRole("button", { name: "Simpan transaksi" });

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
    await screen.findByRole("button", { name: "Simpan transaksi" });

    await pick(user, "Akun Kas/Bank", "1101 · Kas Pusat");
    await pick(user, "Akun baris 1", "5401 · Beban Listrik");
    await user.type(screen.getByLabelText("Jumlah baris 1"), "75000");
    await user.click(screen.getByRole("button", { name: "Simpan transaksi" }));

    expect(
      await screen.findByText(/not an active expense account/),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
