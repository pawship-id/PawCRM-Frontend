import { scopeHotelAxisValues } from "@/features/services/variantAxes";

const v = (value: string, label: string, extra = {}) => ({ value, label, retired: false, ...extra });

const table = {
  petType: [v("cat", "Kucing"), v("dog", "Anjing")],
  sizeCategory: [v("s", "Kecil"), v("cs", "Kecil", { speciesId: "cat" }), v("ds", "Besar", { speciesId: "dog" })],
  furType: [v("short", "Pendek")],
  roomCard: [v("r1", "Standard"), v("r2", "VIP Suite")],
  other: [v("a", "Pagi"), v("b", "Sore")],
};

describe("scopeHotelAxisValues", () => {
  it("keeps only the animals and room types ticked in Lokasi & jangkauan", () => {
    const out = scopeHotelAxisValues(table, { petTypeIds: ["cat"], roomTypeIds: ["r2"], roomTypeAxis: "roomCard" });
    expect(out.petType.map((e) => e.value)).toEqual(["cat"]);
    expect(out.sizeCategory.map((e) => e.value)).toEqual(["s", "cs"]);
    expect(out.roomCard.map((e) => e.value)).toEqual(["r2"]);
    expect(out.other).toHaveLength(2);
    expect(out.furType).toHaveLength(1);
  });

  it("narrows nothing while nothing is ticked", () => {
    const out = scopeHotelAxisValues(table, { petTypeIds: [], roomTypeIds: [], roomTypeAxis: "roomCard" });
    expect(out).toEqual(table);
  });
});
