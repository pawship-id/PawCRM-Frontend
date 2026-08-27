import { renderHook, waitFor } from "@testing-library/react";

import { useShiftTotals } from "@/features/pos/hooks/useShiftTotals";
import { posService } from "@/services/pos.service";
import type { PosShift, PosXReport } from "@/types/api";

jest.mock("@/services/pos.service");

const mockedPos = posService as jest.Mocked<typeof posService>;

/*
  A whole shift rather than a stub. The hook never reads it — it takes only the
  three running figures — but a cast would hide the day the payload changes
  shape, which is the one thing a fixture is for.
*/
const shift: PosShift = {
  _id: "shift-1",
  tenantId: "t1",
  branchId: "b1",
  warehouseId: "w1",
  shiftNumber: "SHF-2026-0001",
  cashierUserId: "u1",
  openedAt: "2026-08-27T01:00:00.000Z",
  openingCash: "500000.0000",
  closedAt: null,
  countedCash: null,
  expectedCash: null,
  difference: null,
  closingNotes: null,
  status: "open",
  createdAt: "2026-08-27T01:00:00.000Z",
  updatedAt: "2026-08-27T01:00:00.000Z",
};

const report = (over: Partial<PosXReport["totals"]> = {}, count = 3) =>
  ({
    shift,
    transactionCount: count,
    breakdown: [],
    refunds: { count: 0, cashRefunds: "0.0000" },
    totals: {
      takings: "750000.0000",
      cashTakings: "300000.0000",
      expectedCash: "800000.0000",
      ...over,
    },
  }) as PosXReport;

beforeEach(() => {
  mockedPos.xReport.mockResolvedValue(report());
});

/**
 * The shift bar's running figures (FR-9).
 *
 * FROM THE X-REPORT, not tallied in the browser: the bar and Tutup Kasir must
 * agree to the rupiah, and that endpoint already nets change and this shift's
 * cash refunds out of the cash figure.
 */
describe("useShiftTotals", () => {
  it("reads this shift's figures", async () => {
    const { result } = renderHook(() => useShiftTotals("shift-1", 0));

    await waitFor(() => expect(result.current).not.toBeNull());
    /*
      ONLY THE CASH FIGURE. The same request carries the takings and the
      transaction count, and both are deliberately dropped here — they live in
      the X-Report dialog and nowhere else (decided 27 Agt).
    */
    expect(result.current).toEqual({ cashTakings: "300000.0000" });
  });

  it("asks nobody when there is no shift open", () => {
    const { result } = renderHook(() => useShiftTotals(null, 0));

    expect(result.current).toBeNull();
    expect(mockedPos.xReport).not.toHaveBeenCalled();
  });

  /*
    THE REFETCH SIGNAL. A bar that read once would sit on the morning's numbers
    all day, which is worse than showing none — the screen bumps this whenever a
    sale is settled, voided or returned.
  */
  it("re-reads when the takings change", async () => {
    const { result, rerender } = renderHook(
      ({ version }) => useShiftTotals("shift-1", version),
      { initialProps: { version: 0 } },
    );

    await waitFor(() =>
      expect(result.current?.cashTakings).toBe("300000.0000"),
    );

    mockedPos.xReport.mockResolvedValue(report({ cashTakings: "450000.0000" }));
    rerender({ version: 1 });

    await waitFor(() =>
      expect(result.current?.cashTakings).toBe("450000.0000"),
    );
  });

  it("does not re-read on an unrelated render", async () => {
    const { result, rerender } = renderHook(
      ({ version }) => useShiftTotals("shift-1", version),
      { initialProps: { version: 0 } },
    );

    await waitFor(() => expect(result.current).not.toBeNull());
    rerender({ version: 0 });

    // The X-Report writes nothing, but a request per keystroke is still a
    // request per keystroke.
    expect(mockedPos.xReport).toHaveBeenCalledTimes(1);
  });

  /*
    THE FIGURES MUST NOT BE ABLE TO TAKE THE TILL DOWN. They are the least
    important thing on the screen — a cashier can sell all day without them — so
    a call that throws on its way out is caught like any failed request rather
    than thrown through the render.
  */
  it("survives the call itself throwing, not just the request failing", async () => {
    mockedPos.xReport.mockImplementation(() => {
      throw new Error("boom");
    });

    const { result } = renderHook(() => useShiftTotals("shift-1", 0));

    await waitFor(() => expect(mockedPos.xReport).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  /*
    NULL, NOT ZERO. Zero is a real answer on a quiet till, so a failed request
    must not be able to print one — a cashier could reconcile against it.
  */
  it("reports nothing rather than zero when the read fails", async () => {
    mockedPos.xReport.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useShiftTotals("shift-1", 0));

    await waitFor(() => expect(mockedPos.xReport).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  /*
    A cashier who closes a till and opens another would otherwise read the OLD
    shift's takings for as long as the new request takes — a wrong number, about
    money, on a bar somebody reads at a glance.
  */
  it("never shows one shift's figures under another shift", async () => {
    const { result, rerender } = renderHook(({ id }) => useShiftTotals(id, 0), {
      initialProps: { id: "shift-1" },
    });

    await waitFor(() => expect(result.current).not.toBeNull());

    let release: (value: PosXReport) => void = () => {};
    mockedPos.xReport.mockReturnValue(
      new Promise<PosXReport>((resolve) => {
        release = resolve;
      }),
    );

    rerender({ id: "shift-2" });

    // The new shift's figures have not arrived, so there are none to show.
    expect(result.current).toBeNull();

    release(report({ cashTakings: "10000.0000" }));
    await waitFor(() => expect(result.current?.cashTakings).toBe("10000.0000"));
  });
});
