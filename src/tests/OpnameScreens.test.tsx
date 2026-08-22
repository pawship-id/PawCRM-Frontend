import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OpnameScreen, OpnameSheet } from "@/features/inventory";
import { stockOpnameService } from "@/services/stockOpname.service";
import { categoryService } from "@/services/category.service";
import { branchService } from "@/services/branch.service";
import { warehouseService } from "@/services/warehouse.service";
import { productService } from "@/services/product.service";
import { ApiError } from "@/services/api-error";
import type { Opname, OpnameItem, Product } from "@/types/inventory";
import type { User } from "@/types/api";

import { exportToXlsx } from "@/utils/xlsx";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * The workbook writer, mocked. These screens own WHICH rows and columns go into
 * the file; whether the bytes are a valid workbook belongs to `xlsx.test.ts`.
 * Loading the real 500 KB SheetJS build in every suite offering an export button
 * is what previously slowed the parallel run enough to time out other suites.
 */
jest.mock("@/utils/xlsx", () => ({
  exportToXlsx: jest.fn(async () => undefined),
}));

jest.mock("@/services/stockOpname.service");
jest.mock("@/services/category.service");
jest.mock("@/services/warehouse.service");
// The start card reads the branch list to fill its picker.
jest.mock("@/services/branch.service");
jest.mock("@/services/product.service");

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}));

/**
 * The stock-count screens, against mocked services.
 *
 * WHAT THESE TESTS GUARD. This module replaced a prototype that computed its own
 * variances and its own journal in the browser, and every way it can regress is
 * a way of drifting back toward that:
 *
 *  1. NOTHING IS RECOMPUTED HERE. The difference, its value and the sheet total
 *     are rendered from the API's answer — the server re-reads live stock at
 *     submit, so a locally derived number would silently disagree with the one
 *     actually posted;
 *  2. the journal comes from `/preview`, never from a hardcoded account pair —
 *     the old prototype booked a surplus to "4901 Pendapatan Lain-lain" while
 *     the ledger books both directions to inventory adjustment;
 *  3. "belum dihitung" is distinguishable from "dihitung dan cocok", which is
 *     the whole reason `countedAt` exists — both post nothing;
 *  4. `submit` is gated separately from `update`: the person who counts is not
 *     necessarily the person who accepts the loss.
 *
 * The Radix selects are not driven — jsdom cannot do their pointer protocol.
 */
const OPNAME_ID = "op1";
const BRANCH_ID = "br1";
const WAREHOUSE_ID = "wh1";

/**
 * Narrows a mocked service method to its jest type.
 *
 * `jest.mock` replaces the module wholesale, so TypeScript still sees the real
 * signatures; this is the cast that lets a test set a resolved value without
 * restating each one.
 */
const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

function item(overrides: Partial<OpnameItem> = {}): OpnameItem {
  return {
    productId: "p1",
    systemQty: "10.0000",
    physicalQty: "10.0000",
    diffQty: "0.0000",
    hppAtOpname: "15000.0000",
    diffValue: "0.0000",
    countedAt: null,
    notes: null,
    batchCode: null,
    expiryDate: null,
    productSku: "SHAMPOO",
    productName: "Shampoo Anjing",
    productUnit: "botol",
    productHasExpiry: false,
    ...overrides,
  };
}

function sheet(overrides: Partial<Opname> = {}): Opname {
  return {
    _id: OPNAME_ID,
    opnameNumber: "OPN-2026-0001",
    warehouseId: WAREHOUSE_ID,
    branchId: null,
    opnameDate: "2026-08-03T00:00:00.000Z",
    status: "draft",
    categoryFilter: null,
    totalDiffValue: "0.0000",
    journalEntryId: null,
    submittedBy: null,
    submittedAt: null,
    notes: null,
    createdBy: "u1",
    createdAt: "",
    updatedAt: "",
    warehouseName: "Gudang Utama",
    items: [item()],
    ...overrides,
  };
}

/** A stock-holding product, as the create screen's picker lists it. */
function product(overrides: Partial<Product> = {}): Product {
  return {
    _id: "p1",
    isConsignment: false,
    sku: "SHAMPOO",
    name: "Shampoo Anjing",
    productType: "standalone",
    parentId: null,
    variantAxes: [],
    variantAttributes: null,
    bundleConfig: null,
    barcode: null,
    minStock: 0,
    hasExpiry: false,
    categoryId: "c1",
    unit: "botol",
    sellPrice: "20000.0000",
    hppAvg: "15000.0000",
    isActive: true,
    deletedAt: null,
    stockByWarehouse: [],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  asMock(branchService.list).mockResolvedValue({
    items: [{ _id: BRANCH_ID, name: "Cabang Pusat", isActive: true }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);

  asMock(warehouseService.list).mockResolvedValue({
    items: [
      {
        _id: WAREHOUSE_ID,
        tenantId: "t1",
        name: "Gudang Utama",
        defaultBranchId: BRANCH_ID,
        address: null,
        picName: null,
        picPhone: null,
        isActive: true,
        isDefault: true,
        deletedAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  asMock(categoryService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  asMock(productService.list).mockResolvedValue({
    items: [product(), product({ _id: "p2", sku: "MAKANAN", name: "Makanan" })],
    pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

/* ------------------------------------------------------------------ list -- */

describe("OpnameScreen", () => {
  const page = (items: Opname[]) => ({
    items,
    pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  });

  it("renders the sheets the API returned", async () => {
    asMock(stockOpnameService.list).mockResolvedValue(
      page([sheet({ items: undefined, itemCount: 40, countedCount: 12 })]),
    );

    renderWithAuth(<OpnameScreen />);

    const number = await screen.findByText("OPN-2026-0001");
    // Scoped to the row: the warehouse name also appears in the start-count and
    // filter pickers, so a bare getByText would match three nodes.
    const row = number.closest("tr")!;
    expect(within(row).getByText("Gudang Utama")).toBeInTheDocument();
  });

  /**
   * The progress column is the reason `countedAt` exists on the API at all: a
   * sheet where every line still holds the system quantity is indistinguishable
   * from a completed one that happened to agree.
   */
  it("shows counted-of-total from the server, not from a row count", async () => {
    asMock(stockOpnameService.list).mockResolvedValue(
      page([sheet({ items: undefined, itemCount: 40, countedCount: 12 })]),
    );

    renderWithAuth(<OpnameScreen />);

    expect(await screen.findByText("12 / 40")).toBeInTheDocument();
  });

  it("names the warehouse from the API rather than joining it client-side", async () => {
    asMock(stockOpnameService.list).mockResolvedValue(
      page([
        sheet({
          items: undefined,
          itemCount: 1,
          countedCount: 0,
          warehouseName: "Gudang Cabang",
        }),
      ]),
    );

    renderWithAuth(<OpnameScreen />);

    expect(await screen.findByText("Gudang Cabang")).toBeInTheDocument();
    // The lookup feeds the pickers, never the row labels.
    expect(warehouseService.list).toHaveBeenCalled();
  });

  /**
   * THE SHEET'S OWN BRANCH, not its warehouse's default — and the two differ
   * exactly where the column earns its place: a central warehouse serving three
   * shops has one default, so deriving the label from the warehouse would print
   * the same name on every count taken there.
   */
  it("names the branch the sheet declared, from the API", async () => {
    asMock(stockOpnameService.list).mockResolvedValue(
      page([
        sheet({
          items: undefined,
          itemCount: 1,
          countedCount: 0,
          branchId: "br9",
          branchName: "Cabang Selatan",
          warehouseName: "Gudang Utama",
        }),
      ]),
    );

    renderWithAuth(<OpnameScreen />);

    const row = (await screen.findByText("OPN-2026-0001")).closest("tr")!;
    expect(within(row).getByText("Cabang Selatan")).toBeInTheDocument();
    // The lookup fills the pickers; it never labels a row.
    expect(within(row).queryByText("Cabang Pusat")).not.toBeInTheDocument();
  });

  /**
   * A sheet opened before `branchId` existed carries none, and reads as unset
   * rather than borrowing the warehouse's — inventing one would put a shop's
   * name on a count that never claimed it.
   */
  it("reads a sheet with no branch as unset, not as its warehouse's", async () => {
    asMock(stockOpnameService.list).mockResolvedValue(
      page([
        sheet({
          items: undefined,
          itemCount: 1,
          countedCount: 0,
          branchId: null,
          branchName: null,
        }),
      ]),
    );

    renderWithAuth(<OpnameScreen />);

    const row = (await screen.findByText("OPN-2026-0001")).closest("tr")!;
    // The Cabang cell by position: a zero variance renders an em dash too, so a
    // bare getByText would match either column and pass for the wrong reason.
    const cabang = row.querySelectorAll("td")[2];
    expect(cabang).toHaveTextContent("—");
    // And the warehouse beside it is untouched — the row is still worth reading.
    expect(row.querySelectorAll("td")[3]).toHaveTextContent("Gudang Utama");
  });

  /**
   * The mark is what tells a reader WHY this row is a result. Yellow `<mark>`,
   * the same `HighlightText` every other searched list in this repo uses — a
   * second highlighting convention would be one more thing to recognise.
   */
  it("marks the searched term inside the opname number", async () => {
    const user = userEvent.setup();
    asMock(stockOpnameService.list).mockResolvedValue(
      page([sheet({ items: undefined, itemCount: 1, countedCount: 0 })]),
    );

    renderWithAuth(<OpnameScreen />);
    await screen.findByText("OPN-2026-0001");

    await user.type(screen.getByLabelText("Cari opname"), "2026");

    // Sought as its own node: highlighting SPLITS the cell, so the number is no
    // longer one text node — which is exactly what is being asserted.
    const mark = await screen.findByText("2026");
    expect(mark.tagName).toBe("MARK");

    // The rest of the number is NOT marked — a highlight over the whole cell
    // says nothing about which characters matched.
    const cell = mark.closest("td")!;
    expect(cell).toHaveTextContent("OPN-2026-0001");
    expect(cell.querySelectorAll("mark")).toHaveLength(1);
  });

  it("leaves the number unmarked while nothing is searched", async () => {
    asMock(stockOpnameService.list).mockResolvedValue(
      page([sheet({ items: undefined, itemCount: 1, countedCount: 0 })]),
    );

    renderWithAuth(<OpnameScreen />);

    const row = (await screen.findByText("OPN-2026-0001")).closest("tr")!;
    expect(row.querySelector("mark")).toBeNull();
  });

  it("tells an empty tenant what to do", async () => {
    asMock(stockOpnameService.list).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    } as never);

    renderWithAuth(<OpnameScreen />);

    expect(await screen.findByText(/Belum ada opname/)).toBeInTheDocument();
  });

  /**
   * A DIFFERENT FACT FROM "this tenant has never counted", and with five filters
   * in the panel it is the far likelier one. The first message would send
   * somebody off to start a sheet that already exists one branch over.
   */
  it("says an empty page is the filter's doing when it is", async () => {
    const user = userEvent.setup();
    asMock(stockOpnameService.list).mockResolvedValue(page([]));

    renderWithAuth(<OpnameScreen />);
    await screen.findByText(/Belum ada opname/);

    await user.type(screen.getByLabelText("Cari opname"), "OPN-9999");

    expect(
      await screen.findByText(/Tidak ada opname yang cocok/),
    ).toBeInTheDocument();
  });

  it("surfaces a load failure", async () => {
    asMock(stockOpnameService.list).mockRejectedValue(
      new ApiError("Gagal", 500),
    );

    renderWithAuth(<OpnameScreen />);

    expect(await screen.findByText("Gagal")).toBeInTheDocument();
  });

  /**
   * The sheet opens EMPTY and the counter scopes it there, next to the rows it
   * produces. Omitting `items` would ask the server for the whole catalogue —
   * they are different requests, and this is the one that asks for nothing.
   */
  it("opens an empty sheet and goes straight to it", async () => {
    const user = userEvent.setup();
    asMock(stockOpnameService.list).mockResolvedValue(page([]));
    asMock(stockOpnameService.create).mockResolvedValue(sheet());

    renderWithAuth(<OpnameScreen />);

    await user.click(
      await screen.findByRole("button", { name: "+ Mulai opname" }),
    );

    await waitFor(() =>
      expect(stockOpnameService.create).toHaveBeenCalledWith({
        warehouseId: WAREHOUSE_ID,
        // Pre-filled from the warehouse — the branch the server would have
        // resolved anyway, so the ordinary case is nought clicks.
        branchId: BRANCH_ID,
        categoryFilter: undefined,
        items: [],
      }),
    );
    expect(push).toHaveBeenCalledWith(
      `/dashboard/inventory/opname/${OPNAME_ID}`,
    );
    // No product picker here: what to count is decided on the sheet.
    expect(productService.list).not.toHaveBeenCalled();
  });

  /**
   * WHICH SET OF BOOKS the count's variance lands on.
   *
   * `defaultBranchId` remains the answer for postings NOBODY chooses — a POS
   * sale has no operator standing at a form. A count does, and a central
   * warehouse serving three branches has one default that cannot speak for all
   * of them.
   */
  it("sends the branch the sheet was opened for, counting at a shared warehouse", async () => {
    const user = userEvent.setup();
    asMock(stockOpnameService.list).mockResolvedValue(page([]));
    asMock(stockOpnameService.create).mockResolvedValue(sheet());
    asMock(branchService.list).mockResolvedValue({
      items: [
        { _id: BRANCH_ID, name: "Cabang Pusat", isActive: true },
        { _id: "br2", name: "Cabang Bazar", isActive: true },
      ],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    } as never);
    // `defaultBranchId: null` is the central warehouse: it belongs to no branch
    // and so appears under every one of them — which is the only way a second
    // branch has anywhere to count here.
    asMock(warehouseService.list).mockResolvedValue({
      items: [
        {
          _id: WAREHOUSE_ID,
          tenantId: "t1",
          name: "Gudang Bersama",
          defaultBranchId: null,
          address: null,
          picName: null,
          picPhone: null,
          isActive: true,
          isDefault: true,
          deletedAt: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    } as never);

    renderWithAuth(<OpnameScreen />);

    await user.click(await screen.findByLabelText("Cabang"));
    await user.click(
      await screen.findByRole("option", { name: /Cabang Bazar/ }),
    );
    await user.click(screen.getByRole("button", { name: "+ Mulai opname" }));

    await waitFor(() =>
      expect(stockOpnameService.create).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: "br2" }),
      ),
    );
  });

  /**
   * One warehouse, one draft. The API refuses the second with a 409 that names
   * the blocking sheet; asking first turns that refusal into an offer, since the
   * sheet already open is where that counter was going anyway.
   */
  it("offers to continue a draft the warehouse already has", async () => {
    asMock(stockOpnameService.list).mockResolvedValue(
      page([sheet({ items: undefined, itemCount: 1, countedCount: 0 })]),
    );

    renderWithAuth(<OpnameScreen />);

    expect(
      await screen.findByRole("link", { name: /Lanjutkan OPN-2026-0001/ }),
    ).toHaveAttribute("href", `/dashboard/inventory/opname/${OPNAME_ID}`);
    expect(
      screen.queryByRole("button", { name: "+ Mulai opname" }),
    ).not.toBeInTheDocument();
    // The check is a read of the drafts at that warehouse, not of the page.
    expect(stockOpnameService.list).toHaveBeenCalledWith({
      warehouseId: WAREHOUSE_ID,
      status: "draft",
      limit: 1,
    });
  });

  it("hides the start card from a role that may not open a count", async () => {
    asMock(stockOpnameService.list).mockResolvedValue(page([]));

    renderWithAuth(<OpnameScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "stockOpnames", actions: ["read"] }],
    });

    await screen.findByText(/Belum ada opname/);
    expect(
      screen.queryByRole("button", { name: "+ Mulai opname" }),
    ).not.toBeInTheDocument();
  });

  it("offers Buang on a draft only, and only with the grant", async () => {
    asMock(stockOpnameService.list).mockResolvedValue(
      page([
        sheet({ _id: "a", items: undefined, itemCount: 1, countedCount: 1 }),
        sheet({
          _id: "b",
          opnameNumber: "OPN-2026-0002",
          status: "submitted",
          items: undefined,
          itemCount: 1,
          countedCount: 1,
        }),
      ]),
    );

    renderWithAuth(<OpnameScreen />);

    await screen.findByText("OPN-2026-0001");
    // One draft, one final — so exactly one discard action.
    expect(screen.getAllByRole("button", { name: "Buang" })).toHaveLength(1);
  });

  it("withholds Buang from a counter who may not discard", async () => {
    asMock(stockOpnameService.list).mockResolvedValue(
      page([sheet({ items: undefined, itemCount: 1, countedCount: 0 })]),
    );

    renderWithAuth(<OpnameScreen />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "stockOpnames", actions: ["create", "read", "update"] },
      ],
    });

    await screen.findByText("OPN-2026-0001");
    expect(
      screen.queryByRole("button", { name: "Buang" }),
    ).not.toBeInTheDocument();
  });

  /**
   * Every filter lives behind one button now, the same shape the catalogue
   * uses. These pin the two things that shape can get wrong: a field that
   * queries while it is being composed, and a badge that stops being worth
   * reading once the triggers are hidden.
   */
  describe("the filter panel", () => {
    /** Opens the one filter panel and returns it. */
    async function openFilters(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: "Filter" }));
      return screen.findByRole("dialog");
    }

    /**
     * Matches the LIST request specifically.
     *
     * This screen fires `list()` twice for different reasons: the paged history
     * below, and the start card's own lookup for a draft the warehouse already
     * has (`{limit: 1, status: "draft"}`). `toHaveBeenLastCalledWith` catches
     * whichever landed last — and since the lookup also carries
     * `status: "draft"`, an assertion about the status filter can pass while
     * the filter does nothing at all. `limit` is what tells them apart.
     */
    const listRequest = (fields: Record<string, unknown>) =>
      expect.objectContaining({ limit: 20, ...fields });

    beforeEach(() => {
      asMock(stockOpnameService.list).mockResolvedValue(page([sheet()]));
    });

    it("puts every filter behind one button", async () => {
      const user = userEvent.setup();
      renderWithAuth(<OpnameScreen />);
      await screen.findByText("OPN-2026-0001");

      // Absent, not hidden: two controls named "Filter gudang" on one page is
      // one control to look at and two to a screen reader.
      expect(
        screen.queryByRole("button", { name: "Filter gudang" }),
      ).not.toBeInTheDocument();

      const panel = await openFilters(user);
      expect(
        within(panel).getByRole("button", { name: "Filter status opname" }),
      ).toBeInTheDocument();
      expect(
        within(panel).getByRole("button", { name: "Filter cabang" }),
      ).toBeInTheDocument();
      expect(
        within(panel).getByRole("button", { name: "Filter gudang" }),
      ).toBeInTheDocument();
      // The range renders as a FIELD here — two plain inputs, no popover of its
      // own, so there is exactly one Terapkan on screen for one decision.
      expect(
        within(panel).getByLabelText("Tanggal opname dari"),
      ).toBeInTheDocument();
      expect(
        within(panel).queryByRole("button", { name: /Tanggal opname/ }),
      ).not.toBeInTheDocument();
    });

    it("holds the fields as a draft until Terapkan", async () => {
      const user = userEvent.setup();
      renderWithAuth(<OpnameScreen />);
      await screen.findByText("OPN-2026-0001");

      const calls = asMock(stockOpnameService.list).mock.calls.length;

      const panel = await openFilters(user);
      await user.click(
        within(panel).getByRole("button", { name: "Filter status opname" }),
      );
      await user.click(screen.getByRole("option", { name: "Draft" }));

      // Composing a query does not query — the whole reason for a panel.
      expect(asMock(stockOpnameService.list).mock.calls).toHaveLength(calls);

      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      await waitFor(() =>
        expect(stockOpnameService.list).toHaveBeenCalledWith(
          listRequest({ status: "draft" }),
        ),
      );
    });

    /**
     * BOTH SCOPES REACH THE SERVER, and the branch is one of them. A page holds
     * twenty rows and a busy quarter spans several, so narrowing in the browser
     * would answer "counts at Cabang Selatan" with "the ones that happened to be
     * on page 1".
     */
    it("narrows by branch, and sends it to the server", async () => {
      const user = userEvent.setup();
      renderWithAuth(<OpnameScreen />);
      await screen.findByText("OPN-2026-0001");

      const panel = await openFilters(user);
      await user.click(
        within(panel).getByRole("button", { name: "Filter cabang" }),
      );
      await user.click(screen.getByRole("option", { name: "Cabang Pusat" }));
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      await waitFor(() =>
        expect(stockOpnameService.list).toHaveBeenCalledWith(
          listRequest({ branchId: BRANCH_ID }),
        ),
      );

      // Counted, unlike the ordering: it changes what is IN the list, and a
      // filter hidden behind a button is one people forget is on.
      expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
        "Filter (1)",
      );
    });

    /**
     * THE INTERLOCK, in the direction that is not symmetrical — the same one
     * Penyesuaian Stok's panel has. A warehouse pinned to one branch ANSWERS the
     * branch question, so the field above fills itself in rather than sitting on
     * "Semua cabang" while the reader wonders whether it is still open.
     */
    it("fills the branch in from a warehouse that names one", async () => {
      const user = userEvent.setup();
      renderWithAuth(<OpnameScreen />);
      await screen.findByText("OPN-2026-0001");

      const panel = await openFilters(user);
      await user.click(
        within(panel).getByRole("button", { name: "Filter gudang" }),
      );
      await user.click(screen.getByRole("option", { name: "Gudang Utama" }));
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      await waitFor(() =>
        expect(stockOpnameService.list).toHaveBeenCalledWith(
          listRequest({ warehouseId: WAREHOUSE_ID, branchId: BRANCH_ID }),
        ),
      );
    });

    it("re-orders the list by a name the API accepts", async () => {
      const user = userEvent.setup();
      renderWithAuth(<OpnameScreen />);
      await screen.findByText("OPN-2026-0001");

      // Stated rather than omitted: every page of a walk has to agree.
      expect(stockOpnameService.list).toHaveBeenCalledWith(
        listRequest({ sort: "newest" }),
      );

      const panel = await openFilters(user);
      await user.click(within(panel).getByRole("button", { name: "Urutkan" }));
      await user.click(screen.getByRole("option", { name: "Nomor A–Z" }));
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      await waitFor(() =>
        expect(stockOpnameService.list).toHaveBeenCalledWith(
          listRequest({ sort: "numberAsc" }),
        ),
      );

      // Read with the panel SHUT — Radix hides the trigger from the
      // accessibility tree while its own dialog is up. The ordering is not
      // counted: every list has one.
      expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
        /^Filter$/,
      );
    });

    it("commits the date range with the panel, not with a second button", async () => {
      const user = userEvent.setup();
      renderWithAuth(<OpnameScreen />);
      await screen.findByText("OPN-2026-0001");

      const panel = await openFilters(user);
      await user.type(
        within(panel).getByLabelText("Tanggal opname dari"),
        "2026-08-01",
      );
      await user.click(within(panel).getByRole("button", { name: "Terapkan" }));

      // The hook widens the date to a UTC instant before sending it.
      await waitFor(() =>
        expect(stockOpnameService.list).toHaveBeenCalledWith(
          listRequest({ dateFrom: "2026-08-01T00:00:00.000Z" }),
        ),
      );

      // And the badge counts the range ONCE, not once per bound.
      expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
        "Filter (1)",
      );
    });
  });

  describe("exporting the history", () => {
    /**
     * The list is paged, so the file is too — and the button says so. A file
     * quietly holding 20 of 140 rows is one somebody reconciles against and
     * finds short.
     */
    it("exports this page, and says so on the button", async () => {
      asMock(stockOpnameService.list).mockResolvedValue(page([sheet()]));

      renderWithAuth(<OpnameScreen />);
      await screen.findByText("OPN-2026-0001");

      await userEvent.click(
        screen.getByRole("button", { name: /export halaman ini/i }),
      );

      await waitFor(() => expect(exportToXlsx).toHaveBeenCalled());
      const [columns, rows, filename] = asMock(exportToXlsx).mock.calls[0];
      expect(rows).toHaveLength(1);
      expect(filename).toBe("riwayat-opname.xlsx");
      // Names, not ObjectIds: the list response already resolves them.
      expect(columns.map((column) => column.header)).toEqual(
        expect.arrayContaining(["Nomor", "Gudang", "Selisih nilai"]),
      );
    });

    /**
     * The sign is the finding. A shrinkage is negative in the ledger and must be
     * negative here, typed as a number — otherwise the column cannot be summed to
     * "what did counting cost us this quarter".
     */
    it("types the variance as a signed number", async () => {
      asMock(stockOpnameService.list).mockResolvedValue(
        page([sheet({ totalDiffValue: "-120000.0000" })]),
      );

      renderWithAuth(<OpnameScreen />);
      await screen.findByText("OPN-2026-0001");
      await userEvent.click(
        screen.getByRole("button", { name: /export halaman ini/i }),
      );

      await waitFor(() => expect(exportToXlsx).toHaveBeenCalled());
      const [columns, rows] = asMock(exportToXlsx).mock.calls[0];
      const variance = columns.find((c) => c.header === "Selisih nilai")!;
      expect(variance.type).toBe("number");
      expect(variance.value(rows[0])).toBe("-120000.0000");
    });

    // An empty workbook helps nobody, and the button not being clickable is
    // clearer than a file with one header row in it.
    it("disables the button while the list is empty", async () => {
      asMock(stockOpnameService.list).mockResolvedValue(page([]));

      renderWithAuth(<OpnameScreen />);

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /export halaman ini/i }),
        ).toBeDisabled(),
      );
    });
  });
});

/* ----------------------------------------------------------------- sheet -- */

describe("OpnameSheet", () => {
  it("renders the line with the labels the API resolved", async () => {
    asMock(stockOpnameService.getById).mockResolvedValue(sheet());

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    expect(await screen.findByText("Shampoo Anjing")).toBeInTheDocument();
    // SKU and unit come from the API — the sheet does not fetch the catalogue.
    expect(screen.getByText(/SHAMPOO · botol/)).toBeInTheDocument();
  });

  /**
   * WHICH SET OF BOOKS THIS AFTERNOON'S COUNTING WAS BOOKED TO — the question
   * this screen is the one place to ask. Read from the sheet's own `branchName`,
   * never derived from the warehouse: a warehouse three shops share has one
   * default, and printing it here would answer the question wrongly for two of
   * them.
   */
  it("names the branch the sheet declared, beside the warehouse", async () => {
    asMock(stockOpnameService.getById).mockResolvedValue(
      sheet({ branchId: "br9", branchName: "Cabang Selatan" }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    expect(await screen.findByText("Cabang")).toBeInTheDocument();
    expect(screen.getByText("Cabang Selatan")).toBeInTheDocument();
    expect(screen.getByText("Gudang Utama")).toBeInTheDocument();
  });

  it("reads a sheet with no branch as unset on the header", async () => {
    asMock(stockOpnameService.getById).mockResolvedValue(
      sheet({ branchId: null, branchName: null }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    // The label is present, its value is an em dash — the field is not hidden,
    // because "nobody said" is itself the fact worth reporting.
    const label = await screen.findByText("Cabang");
    expect(label.parentElement).toHaveTextContent("—");
  });

  /**
   * The API stores four decimals, which is right for a ledger and wrong for the
   * box somebody types into: a counter who enters `1` and is answered `1.0000`
   * reads that as the form having changed their number.
   */
  it("puts a quantity in the field the way a person would write it", async () => {
    asMock(stockOpnameService.getById).mockResolvedValue(
      sheet({ items: [item({ physicalQty: "1.0000" })] }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    expect(await screen.findByLabelText(/Qty fisik Shampoo/)).toHaveValue("1");
  });

  it("keeps a real fraction, and keeps it typeable", async () => {
    asMock(stockOpnameService.getById).mockResolvedValue(
      sheet({ items: [item({ physicalQty: "2.5000" })] }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    // A POINT, not the comma `formatQty` would localise it to — a decimal comma
    // typed back into the payload is a value the API rejects.
    expect(await screen.findByLabelText(/Qty fisik Shampoo/)).toHaveValue(
      "2.5",
    );
  });

  /**
   * Both post nothing, so nothing downstream distinguishes them — but a counter
   * deciding whether the sheet is finished must.
   */
  it("counts only the lines the API says were visited", async () => {
    asMock(stockOpnameService.getById).mockResolvedValue(
      sheet({
        items: [
          item({ productId: "p1", countedAt: "2026-08-03T09:14:00.000Z" }),
          item({ productId: "p2", productName: "Makanan", countedAt: null }),
        ],
      }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    expect(await screen.findByText("1 / 2 produk")).toBeInTheDocument();
    expect(screen.getByText(/1 produk belum dihitung/)).toBeInTheDocument();
  });

  it("renders the variance the API computed, never its own subtraction", async () => {
    asMock(stockOpnameService.getById).mockResolvedValue(
      sheet({
        totalDiffValue: "-30000.0000",
        items: [
          item({
            physicalQty: "8.0000",
            // Deliberately inconsistent with 10 − 8: if the screen recomputed,
            // it would render -2 and this would fail. It must trust the server,
            // which re-reads live stock at submit.
            diffQty: "-3.0000",
            diffValue: "-45000.0000",
            countedAt: "2026-08-03T09:14:00.000Z",
          }),
        ],
      }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    expect(await screen.findByText("-3")).toBeInTheDocument();
  });

  it("auto-saves an edited quantity, sending counted for that line", async () => {
    const user = userEvent.setup();
    asMock(stockOpnameService.getById).mockResolvedValue(sheet());
    asMock(stockOpnameService.update).mockResolvedValue(sheet());

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    const field = await screen.findByLabelText(/Qty fisik Shampoo Anjing/);
    await user.clear(field);
    await user.type(field, "8");

    await waitFor(() => expect(stockOpnameService.update).toHaveBeenCalled(), {
      timeout: 3000,
    });

    const [, payload] = asMock(stockOpnameService.update).mock.calls.at(-1)!;
    expect(payload.items?.[0]).toMatchObject({
      productId: "p1",
      physicalQty: "8",
      counted: true,
    });
  });

  /**
   * A counter who walks up to a shelf, finds exactly what was predicted and
   * moves on HAS counted that line. Without an explicit control they could not
   * say so, and the progress figure would undercount every shelf that was fine.
   */
  it("lets a matching line be marked counted without changing the quantity", async () => {
    const user = userEvent.setup();
    asMock(stockOpnameService.getById).mockResolvedValue(sheet());
    asMock(stockOpnameService.update).mockResolvedValue(sheet());

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    await user.click(
      await screen.findByLabelText(/Tandai Shampoo Anjing sudah dihitung/),
    );

    await waitFor(() => expect(stockOpnameService.update).toHaveBeenCalled(), {
      timeout: 3000,
    });

    const [, payload] = asMock(stockOpnameService.update).mock.calls.at(-1)!;
    expect(payload.items?.[0]).toMatchObject({
      // The stored "10.0000" shortened for the field it is edited in, and sent
      // back as the same number — the API takes either.
      physicalQty: "10",
      counted: true,
    });

    /**
     * AND THE LINE STILL NAMES ITS PRODUCT AFTERWARDS. The save's response
     * replaces the lines on screen, so a `PATCH` that answered with bare
     * `productId`s blanked every name the moment somebody ticked a box — which
     * is exactly what the API did until PawCRM-Backend 0.24.1.
     *
     * The mock here has always returned a labelled sheet, which is why these
     * tests did not catch it: a mock more generous than the API tests a server
     * that does not exist. It mirrors the real response — keep it that way.
     */
    expect(await screen.findByText("Shampoo Anjing")).toBeInTheDocument();
  });

  /**
   * Found stock of goods that expire needs a DATED lot, or the submit is
   * refused. Saying so at the shelf beats a 400 after the counter has walked
   * away.
   *
   * The code is asked for but not required — left blank it becomes
   * `sku:tanggal-expired` — so the warning names the date and nothing else.
   */
  it("asks for a lot when an expiring product is found in surplus", async () => {
    asMock(stockOpnameService.getById).mockResolvedValue(
      sheet({
        items: [
          item({
            productName: "Vaksin Rabies",
            productHasExpiry: true,
            physicalQty: "13.0000",
            diffQty: "3.0000",
            countedAt: "2026-08-03T09:14:00.000Z",
          }),
        ],
      }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    expect(
      await screen.findByLabelText(/Kode batch Vaksin Rabies/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/belum punya tanggal kedaluwarsa/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/belum punya kode batch/),
    ).not.toBeInTheDocument();
  });

  /**
   * THE PLACEHOLDER IS THE EXPLANATION. A counter who leaves the code blank can
   * read what the lot will be called, which beats a sentence saying one will be
   * generated — and it only appears once the date it derives from is there.
   */
  it("previews the code the found lot will take, once it is dated", async () => {
    const user = userEvent.setup();

    asMock(stockOpnameService.getById).mockResolvedValue(
      sheet({
        items: [
          item({
            productName: "Vaksin Rabies",
            productSku: "VAK-RAB",
            productHasExpiry: true,
            physicalQty: "13.0000",
            diffQty: "3.0000",
            countedAt: "2026-08-03T09:14:00.000Z",
          }),
        ],
      }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    const code = await screen.findByLabelText(/Kode batch Vaksin Rabies/);
    expect(code).toHaveAttribute("placeholder", "Kode batch (opsional)");

    await user.type(
      screen.getByLabelText(/Tanggal kedaluwarsa Vaksin Rabies/),
      "2027-03-01",
    );

    await waitFor(() =>
      expect(code).toHaveAttribute("placeholder", "VAK-RAB:2027-03-01"),
    );
  });

  /**
   * AND KEEPS ASKING AFTER THE SAVE LANDS. The prompt is driven by
   * `productHasExpiry`, which arrives per line — so it survives only as long as
   * the auto-save's response carries it. Until PawCRM-Backend 0.24.1 it did not,
   * and typing the surplus that CREATED the requirement was the very act that
   * switched the prompt off: nothing on screen said so, and the requirement came
   * back as a 400 at submit with nobody left at the shelf to answer it.
   *
   * The test above covers the load; this covers the save, which is the path that
   * actually broke.
   */
  it("keeps asking for the lot after the save comes back", async () => {
    const user = userEvent.setup();
    const expiring = (overrides = {}) =>
      item({
        productName: "Vaksin Rabies",
        productHasExpiry: true,
        countedAt: "2026-08-03T09:14:00.000Z",
        ...overrides,
      });

    asMock(stockOpnameService.getById).mockResolvedValue(
      sheet({
        items: [expiring({ physicalQty: "10.0000", diffQty: "0.0000" })],
      }),
    );
    // The server's answer to that surplus, labelled as the real API returns it.
    asMock(stockOpnameService.update).mockResolvedValue(
      sheet({
        items: [expiring({ physicalQty: "13.0000", diffQty: "3.0000" })],
      }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    const field = await screen.findByLabelText(/Qty fisik Vaksin Rabies/);
    await user.clear(field);
    await user.type(field, "13");

    await waitFor(() => expect(stockOpnameService.update).toHaveBeenCalled(), {
      timeout: 3000,
    });

    expect(
      await screen.findByLabelText(/Kode batch Vaksin Rabies/),
    ).toBeInTheDocument();
  });

  it("asks for no lot on a shortage — FEFO decides which lots it leaves", async () => {
    asMock(stockOpnameService.getById).mockResolvedValue(
      sheet({
        items: [
          item({
            productName: "Vaksin Rabies",
            productHasExpiry: true,
            physicalQty: "7.0000",
            diffQty: "-3.0000",
            countedAt: "2026-08-03T09:14:00.000Z",
          }),
        ],
      }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    await screen.findByText("Vaksin Rabies");
    expect(
      screen.queryByLabelText(/Kode batch Vaksin Rabies/),
    ).not.toBeInTheDocument();
  });

  /**
   * The prototype hardcoded a surplus to 4901; the ledger books both directions
   * to inventory adjustment. The accounts must come from the server.
   */
  it("asks the server for the journal before confirming a submit", async () => {
    const user = userEvent.setup();
    asMock(stockOpnameService.getById).mockResolvedValue(sheet());
    asMock(stockOpnameService.preview).mockResolvedValue({
      opnameId: OPNAME_ID,
      opnameNumber: "OPN-2026-0001",
      items: [],
      totalDiffValue: "-30000.0000",
      movements: [],
      hppAvg: [],
      journal: [
        {
          accountId: "a1",
          accountCode: "5201",
          accountName: "Kerugian Persediaan",
          debit: "30000.0000",
          credit: null,
        },
        {
          accountId: "a2",
          accountCode: "1201",
          accountName: "Persediaan Barang",
          debit: null,
          credit: "30000.0000",
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    await user.click(
      await screen.findByRole("button", { name: /Selesaikan opname/ }),
    );

    await waitFor(() =>
      expect(stockOpnameService.preview).toHaveBeenCalledWith(OPNAME_ID),
    );
    // Confirmed before anything is posted.
    expect(stockOpnameService.submit).not.toHaveBeenCalled();
  });

  it("submits only after the confirmation is accepted", async () => {
    const user = userEvent.setup();
    asMock(stockOpnameService.getById).mockResolvedValue(sheet());
    asMock(stockOpnameService.preview).mockResolvedValue({
      opnameId: OPNAME_ID,
      opnameNumber: "OPN-2026-0001",
      items: [],
      totalDiffValue: "0.0000",
      movements: [],
      hppAvg: [],
      journal: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    asMock(stockOpnameService.submit).mockResolvedValue(
      sheet({ status: "submitted", totalDiffValue: "0.0000" }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    await user.click(
      await screen.findByRole("button", { name: /Selesaikan opname/ }),
    );

    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: /Ya, selesaikan/ }),
    );

    await waitFor(() =>
      expect(stockOpnameService.submit).toHaveBeenCalledWith(OPNAME_ID),
    );
  });

  /**
   * The seeded Staff role counts but does not accept the variance — someone
   * other than the counter signs off the loss.
   */
  it("withholds the submit button from a counter", async () => {
    asMock(stockOpnameService.getById).mockResolvedValue(sheet());

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "stockOpnames", actions: ["create", "read", "update"] },
      ],
    });

    await screen.findByText("Shampoo Anjing");
    expect(
      screen.queryByRole("button", { name: /Selesaikan opname/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/izin/)).toBeInTheDocument();
  });

  it("renders a submitted sheet read-only, with its journal link", async () => {
    asMock(stockOpnameService.getById).mockResolvedValue(
      sheet({
        status: "submitted",
        submittedByName: "Budi",
        journalEntryId: "je1",
        totalDiffValue: "-30000.0000",
        items: [item({ countedAt: "2026-08-03T09:14:00.000Z" })],
      }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    expect(await screen.findByText("final")).toBeInTheDocument();
    expect(screen.getByText(/oleh Budi/)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Qty fisik Shampoo Anjing/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Lihat jurnal/ })).toHaveAttribute(
      "href",
      expect.stringContaining("je1"),
    );
  });

  /** A zero-value count posts no entry at all — that is a result, not a gap. */
  it("explains a submitted sheet that produced no journal", async () => {
    asMock(stockOpnameService.getById).mockResolvedValue(
      sheet({ status: "submitted", journalEntryId: null }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    expect(await screen.findByText(/Tidak ada jurnal/)).toBeInTheDocument();
  });

  it("surfaces a 409 when the sheet was submitted mid-edit", async () => {
    const user = userEvent.setup();
    asMock(stockOpnameService.getById).mockResolvedValue(sheet());
    asMock(stockOpnameService.update).mockRejectedValue(
      new ApiError("This opname is no longer a draft", 409, {
        reason: "It was submitted while you were editing",
      }),
    );

    renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

    const field = await screen.findByLabelText(/Qty fisik Shampoo Anjing/);
    await user.clear(field);
    await user.type(field, "8");

    expect(
      await screen.findByText(/submitted while you were editing/, undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
  });

  /**
   * A sheet opens EMPTY and is scoped here, next to the rows the choice
   * produces — "everything in this warehouse" or "these six shelves". That
   * decision used to live on a page of its own, before the sheet existed, which
   * meant committing to a list without seeing a single row.
   */
  describe("scoping an empty sheet", () => {
    const emptySheet = () => sheet({ items: [] });

    it("offers both ways to fill it instead of an empty table", async () => {
      asMock(stockOpnameService.getById).mockResolvedValue(emptySheet());

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

      expect(
        await screen.findByText(/Lembar ini belum berisi produk/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Muat semua produk gudang ini/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Tambah produk/ }),
      ).toBeInTheDocument();
    });

    it("loads the whole warehouse on request, scope and all", async () => {
      const user = userEvent.setup();
      asMock(stockOpnameService.getById).mockResolvedValue(emptySheet());
      asMock(stockOpnameService.addEveryProduct).mockResolvedValue(sheet());

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);
      await user.click(
        await screen.findByRole("button", {
          name: /Muat semua produk gudang ini/,
        }),
      );

      // No scope travels with it: the category lives on the sheet, and a client
      // that re-stated it could widen a count past the scope it claims.
      await waitFor(() =>
        expect(stockOpnameService.addEveryProduct).toHaveBeenCalledWith(
          OPNAME_ID,
        ),
      );
      expect(await screen.findByText("Shampoo Anjing")).toBeInTheDocument();
    });

    /** "Already complete" is an answer, and it is shown rather than swallowed. */
    it("surfaces the refusal when there is nothing left to load", async () => {
      const user = userEvent.setup();
      asMock(stockOpnameService.getById).mockResolvedValue(emptySheet());
      asMock(stockOpnameService.addEveryProduct).mockRejectedValue(
        new ApiError("Every countable product is already on this sheet", 409, {
          reason: "Nothing left to add for this warehouse",
        }),
      );

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);
      await user.click(
        await screen.findByRole("button", {
          name: /Muat semua produk gudang ini/,
        }),
      );

      expect(
        await screen.findByText(/Nothing left to add for this warehouse/),
      ).toBeInTheDocument();
    });

    // The API refuses a submit with no items; the button says so first.
    it("will not offer to finish a sheet with no lines", async () => {
      asMock(stockOpnameService.getById).mockResolvedValue(emptySheet());

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

      expect(
        await screen.findByRole("button", { name: /Selesaikan opname/ }),
      ).toBeDisabled();
    });
  });

  /**
   * The other half of adding: a product put on the sheet by mistake comes back
   * off it. No endpoint of its own — `items` replaces the array, so a sheet
   * shrinks the same way it grows.
   */
  describe("removing a product from a draft", () => {
    it("saves the sheet without that line, at once rather than on a debounce", async () => {
      const user = userEvent.setup();
      asMock(stockOpnameService.getById).mockResolvedValue(
        sheet({
          items: [item(), item({ productId: "p2", productName: "Makanan" })],
        }),
      );
      asMock(stockOpnameService.update).mockResolvedValue(sheet());

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

      const row = (await screen.findByText("Makanan")).closest("tr")!;
      await user.click(within(row).getByRole("button", { name: "Hapus" }));

      await waitFor(() =>
        expect(stockOpnameService.update).toHaveBeenCalledWith(OPNAME_ID, {
          items: [expect.objectContaining({ productId: "p1" })],
        }),
      );
    });

    /**
     * A counted line's quantity is the one thing on the sheet that cannot be
     * recovered from anywhere else — so that removal asks, and an uncounted one
     * does not.
     */
    it("asks before discarding a line somebody already counted", async () => {
      const user = userEvent.setup();
      asMock(stockOpnameService.getById).mockResolvedValue(
        sheet({
          items: [
            item({ physicalQty: "8.0000", countedAt: "2026-08-03T09:14:00Z" }),
          ],
        }),
      );

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);
      await user.click(await screen.findByRole("button", { name: "Hapus" }));

      expect(
        await screen.findByText(/Hapus produk dari lembar ini\?/),
      ).toBeInTheDocument();
      // Nothing sent until it is confirmed.
      expect(stockOpnameService.update).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Hapus baris" }));

      await waitFor(() =>
        expect(stockOpnameService.update).toHaveBeenCalledWith(OPNAME_ID, {
          items: [],
        }),
      );
    });

    it("offers no removal on a submitted sheet", async () => {
      asMock(stockOpnameService.getById).mockResolvedValue(
        sheet({ status: "submitted" }),
      );

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

      await screen.findByText("Shampoo Anjing");
      expect(
        screen.queryByRole("button", { name: "Hapus" }),
      ).not.toBeInTheDocument();
    });

    it("offers no removal to a role that may not edit the sheet", async () => {
      asMock(stockOpnameService.getById).mockResolvedValue(sheet());

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />, {
        isSuperAdmin: false,
        permissions: [{ feature: "stockOpnames", actions: ["read"] }],
      });

      await screen.findByText("Shampoo Anjing");
      expect(
        screen.queryByRole("button", { name: "Hapus" }),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * A sheet is a plan for an afternoon, and the plan is wrong the moment
   * somebody finds a shelf that was not on it. The alternative was discarding
   * the draft — and every quantity already typed with it.
   */
  describe("adding products to an open count", () => {
    const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(
        await screen.findByRole("button", { name: /Tambah produk/ }),
      );
    };

    it("adds the picked products and re-renders the sheet the API returned", async () => {
      const user = userEvent.setup();
      asMock(stockOpnameService.getById).mockResolvedValue(sheet());
      asMock(stockOpnameService.addItems).mockResolvedValue(
        sheet({
          items: [item(), item({ productId: "p2", productName: "Makanan" })],
        }),
      );
      // The picker offers a product the sheet does not already carry.
      asMock(productService.list).mockResolvedValue({
        items: [product({ _id: "p2", sku: "MAKANAN", name: "Makanan" })],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);
      await openDialog(user);

      await user.click(await screen.findByLabelText(/Makanan/));
      await user.click(screen.getByRole("button", { name: /Tambahkan/ }));

      /**
       * IDS ONLY. A quantity sent here would either be a zero — a shortage of
       * that product's whole stock, waiting to be posted — or a balance the
       * browser read for itself; the server fills the line from live stock.
       */
      await waitFor(() =>
        expect(stockOpnameService.addItems).toHaveBeenCalledWith(OPNAME_ID, [
          "p2",
        ]),
      );
      // The response IS the sheet, so the new line renders without a re-read.
      expect(await screen.findByText("Makanan")).toBeInTheDocument();
      expect(stockOpnameService.getById).toHaveBeenCalledTimes(1);
    });

    /** A product may appear once on a sheet; the API refuses the second. */
    it("does not offer a product the sheet already carries", async () => {
      const user = userEvent.setup();
      asMock(stockOpnameService.getById).mockResolvedValue(sheet());
      asMock(productService.list).mockResolvedValue({
        items: [product()],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);
      await openDialog(user);

      expect(
        await screen.findByText(/sudah ada di lembar ini/),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText(/Shampoo Anjing SHAMPOO/)).toBeNull();
    });

    /** Naming the offender is the point — a closed dialog cannot offer that. */
    it("keeps the dialog open and shows the refusal", async () => {
      const user = userEvent.setup();
      asMock(stockOpnameService.getById).mockResolvedValue(sheet());
      asMock(stockOpnameService.addItems).mockRejectedValue(
        new ApiError("Some products are already on this count sheet", 409, {
          reason: "Already counted here: MAKANAN",
        }),
      );
      asMock(productService.list).mockResolvedValue({
        items: [product({ _id: "p2", sku: "MAKANAN", name: "Makanan" })],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);
      await openDialog(user);

      await user.click(await screen.findByLabelText(/Makanan/));
      await user.click(screen.getByRole("button", { name: /Tambahkan/ }));

      expect(
        await screen.findByText(/Already counted here: MAKANAN/),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Tambahkan/ }),
      ).toBeInTheDocument();
    });

    it("is absent on a submitted sheet — a posted count cannot grow", async () => {
      asMock(stockOpnameService.getById).mockResolvedValue(
        sheet({ status: "submitted" }),
      );

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);

      await screen.findByText("Shampoo Anjing");
      expect(
        screen.queryByRole("button", { name: /Tambah produk/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("exporting the sheet's lines", () => {
    /**
     * THE EXPORT AN ACCOUNTANT ACTUALLY USES. The history export answers "which
     * counts happened"; this answers "which products were off, and by how much"
     * — the question a variance is investigated with.
     */
    it("exports one row per line, named after the opname", async () => {
      asMock(stockOpnameService.getById).mockResolvedValue(
        sheet({
          opnameNumber: "OPN-2026-0007",
          items: [item({ diffQty: "-2.0000", diffValue: "-30000.0000" })],
        }),
      );

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);
      await screen.findByText("Shampoo Anjing");

      await userEvent.click(
        screen.getByRole("button", { name: /export selisih/i }),
      );

      await waitFor(() => expect(exportToXlsx).toHaveBeenCalled());
      const [columns, rows, filename] = asMock(exportToXlsx).mock.calls[0];
      expect(rows).toHaveLength(1);
      expect(filename).toBe("opname-OPN-2026-0007.xlsx");
      expect(columns.map((column) => column.header)).toEqual(
        expect.arrayContaining([
          "SKU",
          "Qty sistem",
          "Qty fisik",
          "Selisih qty",
          "HPP saat opname",
        ]),
      );
    });

    /**
     * OUTSIDE the `!done` block, deliberately: a submitted sheet is the one that
     * gets reconciled, and it is exactly the state with no other actions left on
     * screen.
     */
    it("is available on a submitted sheet, where every other action is gone", async () => {
      asMock(stockOpnameService.getById).mockResolvedValue(
        sheet({ status: "submitted", items: [item()] }),
      );

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);
      await screen.findByText("Shampoo Anjing");

      expect(
        screen.getByRole("button", { name: /export selisih/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /selesaikan opname/i }),
      ).not.toBeInTheDocument();
    });

    /**
     * A line nobody reached posts nothing, but "we did not get to it" is a
     * finding in its own right — and this column is what tells it from "counted,
     * and it matched".
     */
    it("keeps uncounted lines, and marks them as such", async () => {
      asMock(stockOpnameService.getById).mockResolvedValue(
        sheet({ items: [item({ countedAt: null })] }),
      );

      renderWithAuth(<OpnameSheet opnameId={OPNAME_ID} />);
      await screen.findByText("Shampoo Anjing");
      await userEvent.click(
        screen.getByRole("button", { name: /export selisih/i }),
      );

      await waitFor(() => expect(exportToXlsx).toHaveBeenCalled());
      const [columns, rows] = asMock(exportToXlsx).mock.calls[0];
      const counted = columns.find((c) => c.header === "Dihitung")!;
      expect(rows).toHaveLength(1);
      expect(counted.value(rows[0])).toBe("belum");
    });
  });
});

/**
 * Stock isolation on the count screen.
 *
 * A COURTESY OVER THE SERVER'S ANSWER — the API narrows every list and refuses
 * an out-of-scope filter or a count at an unreachable shelf on its own. What is
 * worth asserting here is that neither picker offers a choice whose only
 * possible outcome is that refusal.
 */
describe("stock isolation", () => {
  const OTHER_BRANCH_ID = "b-other";
  const OTHER_WAREHOUSE_ID = "w-other";
  const SHARED_WAREHOUSE_ID = "w-shared";

  /** Scoped to Cabang Pusat, and there only to Gudang Utama. */
  const CONFINED = {
    _id: "u2",
    allBranches: false,
    branchAccess: [BRANCH_ID],
    warehouseAccess: [
      { branchId: BRANCH_ID, allWarehouses: false, warehouseIds: [WAREHOUSE_ID] },
    ],
  } as unknown as User;

  function warehouse(_id: string, name: string, defaultBranchId: string | null) {
    return {
      _id,
      tenantId: "t1",
      name,
      defaultBranchId,
      address: null,
      picName: null,
      picPhone: null,
      isActive: true,
      isDefault: false,
      deletedAt: null,
      createdAt: "",
      updatedAt: "",
    };
  }

  beforeEach(() => {
    asMock(stockOpnameService.list).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    } as never);
    asMock(branchService.list).mockResolvedValue({
      items: [
        { _id: BRANCH_ID, name: "Cabang Pusat", isActive: true },
        { _id: OTHER_BRANCH_ID, name: "Cabang Lain", isActive: true },
      ],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    } as never);

    asMock(warehouseService.list).mockResolvedValue({
      items: [
        warehouse(WAREHOUSE_ID, "Gudang Utama", BRANCH_ID),
        warehouse(OTHER_WAREHOUSE_ID, "Gudang Lain", OTHER_BRANCH_ID),
        warehouse(SHARED_WAREHOUSE_ID, "Gudang Pusat", null),
      ],
      pagination: { page: 1, limit: 100, total: 3, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it("offers the start card only the shelves the user may count", async () => {
    // Gudang Pusat has no branch of its own, so it serves every one of them and
    // comes with any branch access at all.
    const ui = userEvent.setup();
    renderWithAuth(<OpnameScreen />, { user: CONFINED });

    await ui.click(await screen.findByLabelText("Gudang"));

    expect(
      screen.getByRole("option", { name: "Gudang Utama" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Gudang Pusat" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Gudang Lain" }),
    ).not.toBeInTheDocument();
  });

  it("leaves an all-branches user the branch the other one cannot see", async () => {
    // Nothing is offered under Gudang before a branch is named — the form
    // helper is empty until then, so a warehouse cannot be chosen and then
    // silently invalidated by a branch picked after it. Hence the two clicks.
    const owner = { ...CONFINED, allBranches: true, branchAccess: [] };
    const ui = userEvent.setup();
    renderWithAuth(<OpnameScreen />, { user: owner });

    await ui.click(await screen.findByLabelText("Cabang"));
    await ui.click(screen.getByRole("option", { name: "Cabang Lain" }));
    await ui.click(screen.getByLabelText("Gudang"));

    expect(
      screen.getByRole("option", { name: "Gudang Lain" }),
    ).toBeInTheDocument();
  });

  it("offers a confined user no branch but their own", async () => {
    renderWithAuth(<OpnameScreen />, { user: CONFINED });

    // One branch is not a choice: with only Cabang Pusat in reach the picker
    // fills it in, which is why the shelves above are reachable in one click.
    expect(await screen.findByLabelText("Gudang")).toBeInTheDocument();
    expect(screen.queryByText("Cabang Lain")).not.toBeInTheDocument();
  });
});
