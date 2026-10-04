import { netOf } from "@/features/pos/components/PosLineTotal";
import type { PosItem } from "@/types/api";

/**
 * What a basket line actually bills, under the struck-through price.
 *
 * `lineTotal` is the figure BEFORE anything came off; `discount.resolvedAmount`
 * is everything that came off together — the cashier's, the booking's share and
 * a card's benefit alike. This is the subtraction the row now shows instead of
 * asking the cashier to do it.
 */
const line = (over: Record<string, unknown> = {}) =>
  ({
    kind: "service",
    refId: "svc-1",
    name: "Full Grooming",
    qty: "1.0000",
    unitPrice: "169000.0000",
    lineTotal: "169000.0000",
    discount: null,
    ...over,
  }) as unknown as PosItem;

const off = (resolvedAmount: string, source = "manual") => ({
  mode: "amount",
  value: resolvedAmount,
  resolvedAmount,
  approvedBy: null,
  source,
});

describe("netOf", () => {
  it("is the line's own total when nothing came off", () => {
    expect(netOf(line())).toBe("169000.0000");
  });

  it("takes a partial discount off", () => {
    expect(netOf(line({ discount: off("19000.0000") }))).toBe("150000.0000");
  });

  /* The free-grooming case the struck price exists for. */
  it("is nought when a benefit paid for the whole line", () => {
    expect(
      netOf(line({ discount: off("169000.0000", "membership") })),
    ).toBe("0.0000");
  });

  /*
    NEVER BELOW ZERO. The server already caps a benefit at the line's total, so
    this is a floor against arithmetic rather than a rule of its own — but a
    negative figure on a till would be read as a refund.
  */
  it("floors at nought rather than going negative", () => {
    expect(netOf(line({ discount: off("200000.0000") }))).toBe("0.0000");
  });

  it("ignores a discount recorded as nothing", () => {
    expect(netOf(line({ discount: off("0.0000") }))).toBe("169000.0000");
  });
});
