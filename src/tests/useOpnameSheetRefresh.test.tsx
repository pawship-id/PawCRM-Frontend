import { act, renderHook, waitFor } from "@testing-library/react";

import { useOpnameSheet } from "@/features/inventory/hooks/useOpnameSheet";
import { stockOpnameService } from "@/services/stockOpname.service";
import type { Opname } from "@/types/inventory";

/**
 * A count sheet left open re-reads its system quantities when somebody comes
 * back to it (`?fresh=true`, nothing saved) — and never on top of a count that
 * is still waiting to be saved.
 */
const sheet = (systemQty: string, diffQty: string) =>
  ({
    _id: "op1",
    status: "draft",
    warehouseId: "wh1",
    items: [
      {
        productId: "p1",
        systemQty,
        physicalQty: "8",
        diffQty,
        hppAtOpname: "1000",
        diffValue: "0",
        countedAt: "2026-10-19T01:00:00.000Z",
        notes: null,
      },
    ],
    totalDiffValue: "0",
  }) as unknown as Opname;

function comeBack() {
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
}

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date("2026-10-19T10:00:00Z"),
    advanceTimers: true,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("re-reads the sheet's figures when somebody comes back", async () => {
  const getById = jest
    .spyOn(stockOpnameService, "getById")
    .mockImplementation(async (_id, options = {}) =>
      options.fresh ? sheet("7", "1") : sheet("10", "-2"),
    );

  const { result } = renderHook(() => useOpnameSheet("op1"));
  await waitFor(() => expect(result.current.items[0]?.systemQty).toBe("10"));

  act(() => {
    jest.setSystemTime(new Date("2026-10-19T10:00:20Z"));
  });
  comeBack();

  await waitFor(() => expect(result.current.items[0].systemQty).toBe("7"));
  expect(result.current.items[0].diffQty).toBe("1");
  expect(getById).toHaveBeenLastCalledWith("op1", { fresh: true });
});

it("leaves the sheet alone while a typed count is waiting to be saved", async () => {
  const getById = jest
    .spyOn(stockOpnameService, "getById")
    .mockImplementation(async (_id, options = {}) =>
      options.fresh ? sheet("7", "1") : sheet("10", "-2"),
    );
  jest.spyOn(stockOpnameService, "update").mockResolvedValue(sheet("10", "2"));

  const { result } = renderHook(() => useOpnameSheet("op1"));
  await waitFor(() => expect(result.current.items[0]?.systemQty).toBe("10"));

  act(() => {
    result.current.editLine(0, { physicalQty: "12" });
    jest.setSystemTime(new Date("2026-10-19T10:00:20Z"));
  });
  comeBack();

  expect(getById).not.toHaveBeenCalledWith("op1", { fresh: true });
  expect(result.current.items[0].physicalQty).toBe("12");
});
