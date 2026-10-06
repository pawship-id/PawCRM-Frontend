import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CashBankOpeningScreen } from "@/features/settings";
import { ApiError } from "@/services/api-error";
import { openingBalanceService } from "@/services/openingBalance.service";
import type { CashBankOpening } from "@/types/accounting";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => "/dashboard/pengaturan/data-awal/kas-bank",
}));
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("@/services/openingBalance.service");

/**
 * Pengaturan › Data awal › Saldo awal kas & bank.
 *
 * What is worth a test here is what goes over the wire and what the screen
 * refuses before it gets that far: a blank form must not post, a saved balance
 * must ask before it is replaced, and the server's refusal must be shown.
 */
const ACCOUNTS = [
  { id: "a-kas", code: "1101", name: "Kas", amount: "0.0000" },
  { id: "a-bca", code: "1102", name: "Bank BCA", amount: "0.0000" },
];

const EMPTY: CashBankOpening = {
  startDate: null,
  entry: null,
  accounts: ACCOUNTS,
  total: "0.0000",
  firstEntryDate: null,
};

const SAVED: CashBankOpening = {
  startDate: "2026-01-01",
  entry: { id: "e1", entryNumber: "JE-0001", branchId: "b1" },
  accounts: [
    { ...ACCOUNTS[0], amount: "1500000.0000" },
    ACCOUNTS[1],
  ],
  total: "1500000.0000",
  firstEntryDate: null,
};

beforeEach(() => {
  jest.mocked(openingBalanceService.getCashBank).mockResolvedValue(EMPTY);
  jest.mocked(openingBalanceService.saveCashBank).mockResolvedValue({
    entryId: "e2",
    entryNumber: "JE-0002",
    total: "0",
  });
});

describe("CashBankOpeningScreen", () => {
  it("does not offer to save until there is a date and an amount", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashBankOpeningScreen />);

    const save = await screen.findByRole("button", { name: "Simpan saldo awal" });
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/1101 · Kas/), "1500000");
    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/Tanggal mulai/), "2026-01-01");
    expect(save).toBeEnabled();
  });

  it("sends every account, zeros included, with the date and no confirmation on first save", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashBankOpeningScreen />);

    await user.type(await screen.findByLabelText(/1101 · Kas/), "1500000");
    await user.type(screen.getByLabelText(/Tanggal mulai/), "2026-01-01");
    await user.click(screen.getByRole("button", { name: "Simpan saldo awal" }));

    await waitFor(() =>
      expect(openingBalanceService.saveCashBank).toHaveBeenCalledWith({
        startDate: "2026-01-01",
        lines: [
          { accountId: "a-kas", amount: "1500000" },
          { accountId: "a-bca", amount: "0" },
        ],
      }),
    );
  });

  it("strips anything but digits and one decimal point, keeping two decimals", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashBankOpeningScreen />);

    const kas = await screen.findByLabelText(/1101 · Kas/);
    await user.type(kas, "Rp 1.5a00");

    expect(kas).toHaveValue("1.50");
  });

  it("asks before replacing a saved balance, and says what happens", async () => {
    jest.mocked(openingBalanceService.getCashBank).mockResolvedValue(SAVED);
    const user = userEvent.setup();
    renderWithAuth(<CashBankOpeningScreen />);

    const kas = await screen.findByLabelText(/1101 · Kas/);
    await waitFor(() => expect(kas).toHaveValue("1500000"));

    await user.clear(kas);
    await user.type(kas, "1000000");
    await user.click(screen.getByRole("button", { name: "Ubah saldo awal" }));

    expect(await screen.findByText(/dibatalkan, lalu dicatat ulang/)).toBeInTheDocument();
    expect(openingBalanceService.saveCashBank).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "Ubah saldo awal" }).at(-1)!);
    await waitFor(() =>
      expect(openingBalanceService.saveCashBank).toHaveBeenCalledTimes(1),
    );
  });

  it("shows the server's refusal and keeps what was typed", async () => {
    jest
      .mocked(openingBalanceService.saveCashBank)
      .mockRejectedValue(
        new ApiError(
          "Sudah ada transaksi pada 2025-12-20. Tanggal mulai harus sama dengan atau sebelum transaksi pertama.",
          409,
        ),
      );
    const user = userEvent.setup();
    renderWithAuth(<CashBankOpeningScreen />);

    const kas = await screen.findByLabelText(/1101 · Kas/);
    await user.type(kas, "500");
    await user.type(screen.getByLabelText(/Tanggal mulai/), "2026-01-01");
    await user.click(screen.getByRole("button", { name: "Simpan saldo awal" }));

    expect(await screen.findByText(/Sudah ada transaksi pada 2025-12-20/)).toBeInTheDocument();
    expect(kas).toHaveValue("500");
  });

  it("is read-only for a role that may not update", async () => {
    renderWithAuth(<CashBankOpeningScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "openingBalances", actions: ["read"] }],
    });

    expect(await screen.findByLabelText(/1101 · Kas/)).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Simpan saldo awal" }),
    ).not.toBeInTheDocument();
  });
});
