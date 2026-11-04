import search from "@/content/help/search.json";
import { normalize, prepareIndex, queryTerms, rootsOf, searchHelp } from "@/features/help/search";
import type { HelpSearchEntry } from "@/features/help/types";

const entry = (over: Partial<HelpSearchEntry>): HelpSearchEntry => ({
  kind: "article",
  module: "m",
  moduleTitle: "Topik",
  title: "",
  href: `/dashboard/help/m/${Math.random()}`,
  summary: "",
  text: "",
  ...over,
});

describe("help search", () => {
  it("normalises case, accents and punctuation", () => {
    expect(normalize("  Faktur  Penjualan, Café! ")).toBe("faktur penjualan cafe");
  });

  it("expands a word to its synonyms", () => {
    expect(queryTerms("invoice")[0]).toEqual(expect.arrayContaining(["invoice", "faktur"]));
  });

  it("ranks a title hit above a body hit", () => {
    const index = prepareIndex([
      entry({ title: "Membuka kasir", text: "langkah membuka shift" }),
      entry({ title: "Stok opname", text: "hitung stok fisik" }),
    ]);
    expect(searchHelp(index, "stok").map((e) => e.title)).toEqual(["Stok opname"]);
    expect(searchHelp(index, "shift")[0]?.title).toBe("Membuka kasir");
  });

  it("needs every word to match", () => {
    const index = prepareIndex([
      entry({ title: "Retur penjualan" }),
      entry({ title: "Retur ke supplier" }),
    ]);
    expect(searchHelp(index, "retur supplier").map((e) => e.title)).toEqual(["Retur ke supplier"]);
  });

  it("finds faktur when somebody types invoice", () => {
    const index = prepareIndex([entry({ title: "Faktur penjualan" })]);
    expect(searchHelp(index, "invoice")).toHaveLength(1);
  });

  it("puts back the letter me(N)- swallows", () => {
    expect(rootsOf("menutup")).toContain("tutup");
    expect(rootsOf("memilih")).toContain("pilih");
    expect(rootsOf("menyimpan")).toContain("simpan");
    expect(rootsOf("mengirim")).toContain("kirim");
    expect(rootsOf("pembayaran")).toContain("bayar");
    expect(rootsOf("ditutup")).toContain("tutup");
  });

  it("finds a word behind an Indonesian prefix", () => {
    const index = prepareIndex([
      entry({ title: "Membuka kasir", text: "kasir dibuka sebelum tutup toko" }),
      entry({ title: "Menutup kasir" }),
    ]);
    expect(searchHelp(index, "tutup kasir")[0]?.title).toBe("Menutup kasir");
  });

  it("returns nothing for an empty query", () => {
    expect(searchHelp(prepareIndex([entry({ title: "Apa saja" })]), "  ")).toEqual([]);
  });

  it("answers real questions from the generated index", () => {
    const index = prepareIndex(search as HelpSearchEntry[]);
    expect(searchHelp(index, "tutup kasir").length).toBeGreaterThan(0);
    expect(searchHelp(index, "stok minus").length).toBeGreaterThan(0);
    expect(searchHelp(index, "lupa password").length).toBeGreaterThan(0);
  });
});
