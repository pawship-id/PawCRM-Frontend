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
    for (const [axis, values] of Object.entries(table)) {
      expect(out[axis].map((e) => e.value)).toEqual(values.map((e) => e.value));
    }
  });
});

describe("Jenis hewan × Tipe kamar (24 November 2026)", () => {
  it("pairs a room type only with the animals it takes", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { buildVariantCombos } = require("@/features/services/variantAxes");
    const scoped = scopeHotelAxisValues(
      {
        petType: [v("cat", "Kucing"), v("dog", "Anjing")],
        roomCard: [v("std", "Kandang Standar"), v("catroom", "Ruang Kucing"), v("dogzone", "Zona Bermain Anjing")],
      },
      {
        petTypeIds: ["cat", "dog"],
        roomTypeIds: [],
        roomTypeAxis: "roomCard",
        roomTypes: [
          { _id: "std", petTypeIds: ["cat", "dog"] },
          { _id: "catroom", petTypeIds: ["cat"] },
          { _id: "dogzone", petTypeIds: ["dog"] },
        ],
      },
    );
    const labels = buildVariantCombos(["petType", "roomCard"], scoped).map((combo: { label: string }) => combo.label);
    expect(labels).toEqual([
      "Kucing · Kandang Standar",
      "Kucing · Ruang Kucing",
      "Anjing · Kandang Standar",
      "Anjing · Zona Bermain Anjing",
    ]);
  });
});
