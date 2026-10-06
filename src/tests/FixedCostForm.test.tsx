import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FixedCostForm } from "@/features/fixed-costs";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { fixedCostService } from "@/services/fixedCost.service";
import type { ChartOfAccountNode, FixedCost } from "@/types/accounting";
import { accountTypeOf } from "@/types/accounting";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/fixedCost.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * UBAH BIAYA TETAP. What it guards (BO, 6 Okt 2026): the line is not chosen
 * here — no Lini column — and a schedule saved while it still could be keeps its
 * stored line, read-only, sent back unchanged.
 */
const account = (
  overrides: Partial<ChartOfAccountNode> &
    Pick<ChartOfAccountNode, "_id" | "code" | "name" | "accountCategory">,
): ChartOfAccountNode => ({
  parentAccountId: null,
  isDefault: false,
  isActive: true,
  children: [],
  accountType: accountTypeOf(overrides.accountCategory),
  ...overrides,
});

const fixedCost = (lines: FixedCost["lines"]): FixedCost =>
  ({
    _id: "fc1",
    name: "Sewa Toko Pusat",
    kind: "expense",
    direction: "out",
    branchId: "b1",
    branchName: "Pusat",
    accountId: "acc-bca",
    accountName: "1102 · Bank BCA",
    counterAccounts: [],
    amount: "3500000.0000",
    lines,
    partyType: null,
    partyId: null,
    partyName: null,
    cashflowType: "operating",
    ref: null,
    note: null,
    interval: "monthly",
    startDate: "2026-09-01T00:00:00.000Z",
    nextDueAt: "2026-10-01T00:00:00.000Z",
    postedCount: 1,
    lastPostedAt: null,
    lastTransactionId: null,
    isActive: true,
    dueCount: 0,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  }) as FixedCost;

beforeEach(() => {
  jest.clearAllMocks();
  asMock(branchService.list).mockResolvedValue({
    items: [{ _id: "b1", name: "Pusat" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
  asMock(businessLineService.list).mockResolvedValue({
    items: [{ _id: "bl-groom", name: "Grooming", color: "navy" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
  asMock(chartOfAccountsService.tree).mockResolvedValue([
    account({
      _id: "acc-bca",
      code: "1102",
      name: "Bank BCA",
      accountCategory: "cash_bank",
      cashType: "bank",
    }),
    account({
      _id: "acc-sewa",
      code: "5501",
      name: "Beban Sewa",
      accountCategory: "biaya",
    }),
  ]);
  asMock(fixedCostService.update).mockResolvedValue(fixedCost([]) as never);
});

describe("FixedCostForm", () => {
  it("has no Lini bisnis column, and sends a line without one as null", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <FixedCostForm
        fixedCost={fixedCost([
          {
            accountId: "acc-sewa",
            amount: "3500000.0000",
            businessLineId: null,
            subAccountId: null,
            memo: null,
          } as never,
        ])}
      />,
    );

    const amount = await screen.findByLabelText("Jumlah baris 1");
    expect(screen.queryByText("Lini bisnis")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Lini bisnis baris/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/\(tersimpan\)/)).not.toBeInTheDocument();

    await user.clear(amount);
    await user.type(amount, "4000000");
    await user.click(screen.getByRole("button", { name: "Simpan biaya tetap" }));

    await waitFor(() =>
      expect(fixedCostService.update).toHaveBeenCalledWith(
        "fc1",
        expect.objectContaining({
          lines: [
            {
              accountId: "acc-sewa",
              amount: "4000000",
              businessLineId: null,
              subAccountId: null,
            },
          ],
        }),
      ),
    );
  });

  it("keeps a stored business line, read-only and unchanged, on save", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <FixedCostForm
        fixedCost={fixedCost([
          {
            accountId: "acc-sewa",
            amount: "3500000.0000",
            businessLineId: "bl-groom",
            subAccountId: "sub-sewa-1",
            memo: null,
          } as never,
        ])}
      />,
    );

    const amount = await screen.findByLabelText("Jumlah baris 1");
    expect(await screen.findByText("Lini: Grooming (tersimpan)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Lini bisnis baris/ })).not.toBeInTheDocument();

    await user.clear(amount);
    await user.type(amount, "4000000");
    await user.click(screen.getByRole("button", { name: "Simpan biaya tetap" }));

    await waitFor(() =>
      expect(fixedCostService.update).toHaveBeenCalledWith(
        "fc1",
        expect.objectContaining({
          lines: [
            {
              accountId: "acc-sewa",
              amount: "4000000",
              businessLineId: "bl-groom",
              subAccountId: "sub-sewa-1",
            },
          ],
        }),
      ),
    );
  });
});
