import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OpnameScreen, OpnameSheet } from "@/features/inventory";
import { stockOpnameService } from "@/services/stockOpname.service";
import { categoryService } from "@/services/category.service";
import { warehouseService } from "@/services/warehouse.service";
import { ApiError } from "@/services/api-error";
import type { Opname, OpnameItem } from "@/types/inventory";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/stockOpname.service");
jest.mock("@/services/category.service");
jest.mock("@/services/warehouse.service");

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

beforeEach(() => {
  jest.clearAllMocks();

  asMock(warehouseService.list).mockResolvedValue({
    items: [
      {
        _id: WAREHOUSE_ID,
        tenantId: "t1",
        name: "Gudang Utama",
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  asMock(categoryService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
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

  it("tells an empty tenant what to do", async () => {
    asMock(stockOpnameService.list).mockResolvedValue(page([]));

    renderWithAuth(<OpnameScreen />);

    expect(await screen.findByText(/Belum ada opname/)).toBeInTheDocument();
  });

  it("surfaces a load failure", async () => {
    asMock(stockOpnameService.list).mockRejectedValue(
      new ApiError("Gagal", 500),
    );

    renderWithAuth(<OpnameScreen />);

    expect(await screen.findByText("Gagal")).toBeInTheDocument();
  });

  it("hides the start card from a role that may not open a count", async () => {
    asMock(stockOpnameService.list).mockResolvedValue(page([]));

    renderWithAuth(<OpnameScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "stockOpnames", actions: ["read"] }],
    });

    await screen.findByText(/Belum ada opname/);
    expect(
      screen.queryByRole("button", { name: /Mulai opname/ }),
    ).not.toBeInTheDocument();
  });

  it("opens a count and navigates to the sheet", async () => {
    const user = userEvent.setup();
    asMock(stockOpnameService.list).mockResolvedValue(page([]));
    asMock(stockOpnameService.create).mockResolvedValue(sheet());

    renderWithAuth(<OpnameScreen />);

    await user.click(
      await screen.findByRole("button", { name: /Mulai opname/ }),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/dashboard/inventory/opname/${OPNAME_ID}`,
      ),
    );
  });

  /**
   * The 409's `reason` names the sheet that is in the way. Dropping it would
   * leave the user told they cannot start a count and not which one to finish.
   */
  it("shows which draft blocks a second count", async () => {
    const user = userEvent.setup();
    asMock(stockOpnameService.list).mockResolvedValue(page([]));
    asMock(stockOpnameService.create).mockRejectedValue(
      new ApiError("A stock opname is already open for this warehouse", 409, {
        reason: "Opname OPN-2026-0007 is still a draft",
      }),
    );

    renderWithAuth(<OpnameScreen />);
    await user.click(
      await screen.findByRole("button", { name: /Mulai opname/ }),
    );

    expect(await screen.findByText(/OPN-2026-0007/)).toBeInTheDocument();
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

    await waitFor(
      () => expect(stockOpnameService.update).toHaveBeenCalled(),
      { timeout: 3000 },
    );

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

    await waitFor(
      () => expect(stockOpnameService.update).toHaveBeenCalled(),
      { timeout: 3000 },
    );

    const [, payload] = asMock(stockOpnameService.update).mock.calls.at(-1)!;
    expect(payload.items?.[0]).toMatchObject({
      physicalQty: "10.0000",
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
   * Found stock of goods that expire needs a lot, or the submit is refused.
   * Saying so at the shelf beats a 400 after the counter has walked away.
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
      screen.getByText(/belum punya kode batch dan tanggal kedaluwarsa/),
    ).toBeInTheDocument();
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
      sheet({ items: [expiring({ physicalQty: "10.0000", diffQty: "0.0000" })] }),
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
});
