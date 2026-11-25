import { addonCount, dayItems, discountOff, nightsOf, stayDays, stayFlag } from "@/features/hotel/stay";
import { blankPet, petInput, previewBill } from "@/features/hotel/stayDraft";
import type { HotelStayBooking } from "@/types/api";

const stay = { checkInDate: "2026-11-10", checkOutDate: "2026-11-13", leftDate: null };

describe("hotel stay arithmetic (client)", () => {
  it("counts nights and the checklist's days, early leave included", () => {
    expect(nightsOf(stay)).toBe(3);
    expect(nightsOf({ ...stay, leftDate: "2026-11-11" })).toBe(1);
    expect(stayDays(stay)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  });

  it("counts a per-night add-on from its date and a per-time one by its count", () => {
    expect(addonCount({ unit: "night", qty: 1, date: "2026-11-11" }, stay)).toBe(2);
    expect(addonCount({ unit: "time", qty: 3, date: "2026-11-11" }, stay)).toBe(3);
  });

  it("takes a percent or an amount off, never more than the price", () => {
    expect(discountOff("100000.0000", { mode: "percent", value: "10" })).toBe(100_000_000n);
    expect(discountOff("50000", { mode: "amount", value: "80000" })).toBe(500_000_000n);
  });

  it("flags what needs doing today", () => {
    const booking = { status: "confirmed", stay } as unknown as HotelStayBooking;
    expect(stayFlag(booking, "2026-11-10")).toBe("Datang hari ini");
    expect(stayFlag({ ...booking, status: "in_progress" } as HotelStayBooking, "2026-11-14")).toBe("Lewat jadwal pulang");
  });

  it("lists a day's tasks by time, add-ons staff do included", () => {
    const booking = {
      stay: {
        ...stay,
        stepTimes: [
          { stepName: "Makan malam", time: "17:00", weight: null },
          { stepName: "Makan pagi", time: "08:00", weight: null },
        ],
        care: { food: "owner", portion: null, medicine: null, medicineTime: null, behaviour: null },
      },
      service: {
        addons: [
          { itemId: "w", name: "Extra walk", commissionable: true, hotel: { unit: "time", qty: 1, date: "2026-11-11", time: "16:00", unitPrice: "20000" } },
          { itemId: "c", name: "CCTV", commissionable: false, hotel: { unit: "night", qty: 1, date: "2026-11-10", time: null, unitPrice: "25000" } },
        ],
      },
    } as unknown as HotelStayBooking;
    expect(dayItems(booking, "2026-11-11").map((item) => item.key)).toEqual(["step:Makan pagi", "addon:w", "step:Makan malam"]);
    expect(dayItems(booking, "2026-11-13")).toEqual([]);
  });
});

describe("hotel booking draft", () => {
  it("previews a stay at the catalogue price with an add-on and a booking discount", () => {
    const draft = {
      ...blankPet(),
      serviceId: "s",
      roomTypeId: "r",
      addons: [
        { key: "a", serviceId: "x", name: "CCTV", unit: "night" as const, unitPrice: "25000", qty: "1", date: "2026-11-10", time: "", discount: { mode: "amount" as const, value: "" }, commissionable: false, billed: false },
      ],
      bookingDiscount: { mode: "amount" as const, value: "25000" },
    };
    const bill = previewBill(draft, { checkInDate: "2026-11-10", checkOutDate: "2026-11-13" }, { serviceName: "Hotel Kucing", catalogPrice: "100000" });
    expect(bill.nights).toBe(3);
    expect(bill.lines.map((line) => Number(line.net))).toEqual([300000, 75000]);
    expect(Number(bill.total)).toBe(350000);
  });

  it("sends no price when none was typed, and only real discounts", () => {
    const input = petInput("p", { ...blankPet(), serviceId: "s", roomTypeId: "r", unitId: "u" });
    expect(input).toMatchObject({ petId: "p", nightPrice: null, discount: null, bookingDiscount: null, unitId: "u" });
  });
});
