import {
  dateScope,
  formatNumber,
  nextNumber,
  raiseCounter,
} from "@/features/pos/offline/numbering";

/**
 * POS OFFLINE MODE (19 October 2026) — the device renders the number the
 * server will claim: "POS-BRT-K1-261019-0001", in the SHOP's day.
 */
const numbering = {
  series: { prefix: "POS", padding: 4, reset: "daily" as const, separator: "-", timeZone: "Asia/Jakarta" },
  branchCode: "BRT",
  deviceCode: "K1",
};

describe("offline numbering", () => {
  it("formats branch, device, the WIB day and the padded sequence", () => {
    expect(formatNumber(numbering, new Date("2026-10-19T05:00:00.000Z"), 7)).toBe(
      "POS-BRT-K1-261019-0007",
    );
  });

  it("reads 02:00 WIB as that WIB day, as the server does", () => {
    expect(dateScope("daily", new Date("2026-10-19T19:00:00.000Z"), "Asia/Jakarta")).toBe("261020");
  });

  it("follows a monthly or never-resetting series", () => {
    expect(dateScope("monthly", new Date("2026-12-31T18:30:00.000Z"), "Asia/Jakarta")).toBe("2027-01");
    expect(dateScope("never", new Date(), "Asia/Jakarta")).toBe("");
  });

  it("counts up per day and never re-issues below what the server recorded", async () => {
    const day = new Date("2026-10-21T05:00:00.000Z");
    expect((await nextNumber(numbering, day)).number).toBe("POS-BRT-K1-261021-0001");
    expect((await nextNumber(numbering, day)).number).toBe("POS-BRT-K1-261021-0002");

    await raiseCounter("BRT-K1-261021", 40);
    expect((await nextNumber(numbering, day)).number).toBe("POS-BRT-K1-261021-0041");

    const nextDay = new Date("2026-10-22T05:00:00.000Z");
    expect((await nextNumber(numbering, nextDay)).number).toBe("POS-BRT-K1-261022-0001");
  });
});
