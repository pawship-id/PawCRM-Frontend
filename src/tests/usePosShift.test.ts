import { renderHook, waitFor } from "@testing-library/react";

import { usePosShift } from "@/features/pos/hooks/usePosShift";
import { posService } from "@/services/pos.service";
import type { PosShift } from "@/types/api";

jest.mock("@/services/pos.service");

const mocked = posService as jest.Mocked<typeof posService>;

const shift = (branchId: string, shiftNumber: string) =>
  ({ _id: shiftNumber, branchId, shiftNumber, status: "open" }) as unknown as PosShift;

/**
 * A SHIFT BELONGS TO A BRANCH (11 October 2026). The answer for one branch says
 * nothing about another: a cashier moved from Timur to Barat, where a shift of
 * theirs is still open, was kept on "Buka Kasir" because the hook only asked
 * again when a branch went from none to some — and the duplicate they then
 * tried to open was refused.
 */
describe("usePosShift", () => {
  beforeEach(() => {
    mocked.currentShift.mockReset();
  });

  it("asks nothing until a branch is chosen", () => {
    renderHook(() => usePosShift(null));

    expect(mocked.currentShift).not.toHaveBeenCalled();
  });

  it("reads the shift of the branch it is given", async () => {
    mocked.currentShift.mockResolvedValue(shift("b-timur", "SHF-2026-0003"));

    const { result } = renderHook(() => usePosShift("b-timur"));

    await waitFor(() => expect(result.current.shift?.shiftNumber).toBe("SHF-2026-0003"));
  });

  it("asks again when the branch changes, and shows the new branch's shift", async () => {
    mocked.currentShift
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(shift("b-barat", "SHF-2026-0002"));

    const { result, rerender } = renderHook(({ branch }) => usePosShift(branch), {
      initialProps: { branch: "b-timur" as string | null },
    });

    await waitFor(() => expect(mocked.currentShift).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.shift).toBeNull();

    rerender({ branch: "b-barat" });

    await waitFor(() => expect(mocked.currentShift).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(result.current.shift?.shiftNumber).toBe("SHF-2026-0002"),
    );
  });
});
