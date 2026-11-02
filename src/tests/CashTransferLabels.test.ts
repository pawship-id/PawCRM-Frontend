import { accountsForLines } from "@/features/cash-transactions/hooks/useLineLookups";
import {
  directionTitle,
  transactionKindLabel,
} from "@/features/cash-transactions/labels";
import {
  blankLine,
  linesAccountHeading,
} from "@/features/cash-transactions/components/CashLinesEditor";
import type { ChartOfAccount } from "@/types/accounting";

const account = (
  _id: string,
  accountType: string,
  isActive = true,
): ChartOfAccount =>
  ({ _id, accountType, isActive, code: _id, name: _id }) as unknown as ChartOfAccount;

const CHART = [
  account("sewa", "expense"),
  account("bunga", "income"),
  account("bank", "asset"),
  account("kas", "asset"),
  account("piutang", "asset"),
  account("lama", "expense", false),
];

describe("accountsForLines", () => {
  const ids = (options: Parameters<typeof accountsForLines>[1]) =>
    accountsForLines(CHART, options).map((row) => row._id);

  it("puts the kind's class first and drops the blocked, the retired and the cash account", () => {
    expect(
      ids({
        kind: "expense",
        blocked: new Set(["piutang"]),
        cashAccountId: "kas",
      }),
    ).toEqual(["sewa", "bunga", "bank"]);
  });

  it("keeps what a stored line already names", () => {
    expect(
      ids({ kind: "expense", blocked: new Set(), keep: ["lama"] }),
    ).toContain("lama");
  });
});

describe("linesAccountHeading", () => {
  const line = (accountId: string) => ({ ...blankLine(), accountId });

  it("keeps the kind's word while every line is of that class", () => {
    expect(linesAccountHeading("expense", [line("sewa"), line("")], CHART)).toBe(
      "Akun beban",
    );
    expect(linesAccountHeading("other_income", [line("bunga")], CHART)).toBe(
      "Akun pendapatan",
    );
  });

  it("says Akun lawan over a rekening or a mix", () => {
    expect(linesAccountHeading("expense", [line("bank")], CHART)).toBe("Akun lawan");
    expect(
      linesAccountHeading("expense", [line("sewa"), line("bank")], CHART),
    ).toBe("Akun lawan");
  });
});

describe("a transfer's name", () => {
  const transfer = {
    kind: "expense",
    direction: "out",
    number: "BBK/PST/2611/0001",
    amount: "100.0000",
    isTransfer: true,
  } as const;

  it("is never Pengeluaran", () => {
    expect(transactionKindLabel(transfer)).toBe("Transfer antar rekening");
    expect(directionTitle(transfer)).toBe(
      "Transfer antar rekening – BBK/PST/2611/0001",
    );
    expect(transactionKindLabel({ ...transfer, isTransfer: false })).toBe(
      "Pengeluaran",
    );
  });
});
