import { axisDefsForLine, variantAxisDefs } from "@/features/services";

import { makeVariantOption } from "./helpers/variantOptions";

/**
 * Opsi Varian per lini bisnis (22 September 2026) — the service form offers a
 * line's cards, cards for every line, and whatever the service already prices on.
 */
const defs = variantAxisDefs([
  makeVariantOption({ _id: "vo-size", name: "Ukuran", source: "size", axisKey: "sizeCategory", businessLineIds: ["groom"] }),
  makeVariantOption({ _id: "vo-zone", name: "Zona", source: "zone", axisKey: "zone", businessLineIds: ["aj"], sortOrder: 1 }),
  makeVariantOption({ _id: "vo-arah", name: "Arah", source: "staff", axisKey: "vo-arah", businessLineIds: ["aj"], sortOrder: 2 }),
  makeVariantOption({ _id: "vo-lokasi", name: "Lokasi", source: "staff", axisKey: "vo-lokasi", sortOrder: 3 }),
]);

describe("axisDefsForLine", () => {
  it("offers a line its own cards and the cards for every line", () => {
    expect(axisDefsForLine(defs, "aj").map((def) => def.name)).toEqual(["Zona", "Arah", "Lokasi"]);
    expect(axisDefsForLine(defs, "groom").map((def) => def.name)).toEqual(["Ukuran", "Lokasi"]);
  });

  it("keeps an axis the service already prices on, whatever its card says now", () => {
    expect(axisDefsForLine(defs, "groom", ["zone"]).map((def) => def.name)).toEqual([
      "Ukuran",
      "Zona",
      "Lokasi",
    ]);
  });

  it("offers every card before a line is chosen", () => {
    expect(axisDefsForLine(defs, "")).toHaveLength(4);
  });
});
