import { axisDefsForKind, variantAxisDefs } from "@/features/services";

import { makeVariantOption } from "./helpers/variantOptions";

/**
 * Opsi Varian per jenis layanan (22 September 2026) — the service form offers
 * the cards of its module's kind, cards for every kind, and whatever the
 * service already prices on.
 */
const defs = variantAxisDefs([
  makeVariantOption({ _id: "vo-size", name: "Ukuran", source: "size", axisKey: "sizeCategory", serviceKinds: ["grooming"] }),
  makeVariantOption({ _id: "vo-zone", name: "Zona", source: "zone", axisKey: "zone", serviceKinds: ["pickup-delivery"], sortOrder: 1 }),
  makeVariantOption({ _id: "vo-arah", name: "Arah", source: "staff", axisKey: "vo-arah", serviceKinds: ["pickup-delivery"], sortOrder: 2 }),
  makeVariantOption({ _id: "vo-lokasi", name: "Lokasi", source: "staff", axisKey: "vo-lokasi", sortOrder: 3 }),
]);

const names = (kind: Parameters<typeof axisDefsForKind>[1], keep?: string[]) =>
  axisDefsForKind(defs, kind, keep).map((def) => def.name);

describe("axisDefsForKind", () => {
  it("offers a kind its own cards and the cards for every kind", () => {
    expect(names("pickup-delivery")).toEqual(["Zona", "Arah", "Lokasi"]);
    expect(names("grooming")).toEqual(["Ukuran", "Lokasi"]);
    expect(names("hotel")).toEqual(["Lokasi"]);
  });

  it("keeps an axis the service already prices on, whatever its card says now", () => {
    expect(names("grooming", ["zone"])).toEqual(["Ukuran", "Zona", "Lokasi"]);
  });

  it("offers every card when the form came from no module", () => {
    expect(names(undefined)).toHaveLength(4);
  });
});
