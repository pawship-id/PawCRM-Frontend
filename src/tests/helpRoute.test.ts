import routeMap from "@/content/help/route-map.json";
import { helpHrefFor } from "@/features/help/route";
import type { HelpRoute } from "@/features/help/types";

const ROUTES: HelpRoute[] = [
  { pattern: "/dashboard/customers", module: "pelanggan", article: "daftar-pelanggan" },
  { pattern: "/dashboard/customers/[id]", module: "pelanggan", article: "profil-pelanggan" },
  { pattern: "/dashboard/customers/new", module: "pelanggan", article: "tambah-pelanggan" },
  { pattern: "/dashboard/pos", module: "kasir", article: "layar-kasir" },
];

/**
 * The top bar's ? — which page of the guide it opens for the screen in view.
 */
describe("helpHrefFor", () => {
  it("opens the article for a screen the guide explains", () => {
    expect(helpHrefFor("/dashboard/pos", ROUTES)).toBe("/dashboard/help/kasir/layar-kasir");
  });

  it("matches a record page by its pattern", () => {
    expect(helpHrefFor("/dashboard/customers/6adfe062dde5c245a0aedd76", ROUTES)).toBe(
      "/dashboard/help/pelanggan/profil-pelanggan",
    );
  });

  it("prefers a static segment over a parameter", () => {
    // "new" must not be read as customer id "new".
    expect(helpHrefFor("/dashboard/customers/new", ROUTES)).toBe(
      "/dashboard/help/pelanggan/tambah-pelanggan",
    );
  });

  it("ignores the query string and a trailing slash", () => {
    expect(helpHrefFor("/dashboard/customers/?status=aktif", ROUTES)).toBe(
      "/dashboard/help/pelanggan/daftar-pelanggan",
    );
  });

  it("falls back to the topic page of the nearest explained screen", () => {
    expect(helpHrefFor("/dashboard/customers/6adf/notes/9", ROUTES)).toBe(
      "/dashboard/help/pelanggan",
    );
  });

  it("falls back to the guide's home for a screen it knows nothing about", () => {
    expect(helpHrefFor("/dashboard/somewhere-new", ROUTES)).toBe("/dashboard/help");
  });

  it("goes home from inside the guide", () => {
    expect(helpHrefFor("/dashboard/help/kasir/layar-kasir", ROUTES)).toBe("/dashboard/help");
  });

  it("finds an article for the generated map's main screens", () => {
    const map = routeMap as HelpRoute[];
    // The screens people press ? on most; a regenerated map that lost one of
    // these is a guide that has stopped covering a daily screen.
    for (const path of ["/dashboard", "/dashboard/pos", "/dashboard/customers", "/dashboard/sales/invoice"]) {
      expect(helpHrefFor(path, map)).toMatch(/^\/dashboard\/help\/[^/]+\/[^/]+$/);
    }
  });
});
