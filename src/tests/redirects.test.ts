import nextConfig from "../../next.config";

/**
 * OLD ADDRESSES LIVE IN next.config.ts NOW (26 October 2026), not in
 * redirect-only pages. These pin the two things that list must keep true:
 * every old address still lands somewhere, and lands there in ONE hop.
 */
async function rules() {
  return (await nextConfig.redirects!()) as { source: string; destination: string }[];
}

const target = async (source: string) =>
  (await rules()).find((rule) => rule.source === source)?.destination;

describe("old addresses", () => {
  it.each([
    ["/dashboard/booking/:id/hewan/:petId", "/dashboard/booking/:id"],
    ["/dashboard/sales", "/dashboard/sales/summary"],
    ["/dashboard/purchasing", "/dashboard/purchasing/summary"],
    ["/dashboard/promotion", "/dashboard/promotion/summary"],
    ["/dashboard/pengaturan", "/dashboard/settings/general"],
    ["/dashboard/booking/kalender", "/dashboard/booking/calendar"],
    ["/dashboard/master/users/:path*", "/dashboard/settings/users/:path*"],
    ["/dashboard/customers/membership/perpanjangan", "/dashboard/promotion/summary"],
    ["/dashboard/uang", "/dashboard/money"],
    ["/dashboard/keuangan/kas-bank/biaya-tetap/:path*", "/dashboard/finance/cash-bank/fixed-costs/:path*"],
    ["/dashboard/pengaturan/umum/:path*", "/dashboard/settings/general/:path*"],
    ["/dashboard/service/:kind/katalog/:path*", "/dashboard/service/:kind/catalog/:path*"],
    ["/faktur/:token", "/invoice/:token"],
  ])("forwards %s to %s", async (source, destination) => {
    expect(await target(source)).toBe(destination);
  });

  it("never forwards to an address that is itself forwarded", async () => {
    const all = await rules();
    const sources = new Set(all.map((rule) => rule.source));
    for (const { destination } of all) {
      expect(sources.has(destination.split("?")[0])).toBe(false);
    }
  });

  it("pins kas-bank's :id to a Mongo id, so Biaya Tetap is not swallowed", async () => {
    const sources = (await rules()).map((rule) => rule.source);
    expect(sources).not.toContain("/dashboard/keuangan/kas-bank/:id");
    expect(sources).toContain("/dashboard/keuangan/kas-bank/:id([a-f0-9]{24})");
  });
});
