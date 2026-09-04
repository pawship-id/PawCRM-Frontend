import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { SuppliersTable } from "@/features/purchasing/components/SuppliersTable";
import { supplierService } from "@/services/supplier.service";
import type {
  Supplier,
  SupplierOutstandingRow,
  SupplierPurchaseRow,
} from "@/types/api";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// Row actions fire a SweetAlert2 toast on success; mock the library so no real
// dialog is created during the test.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

function makeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    _id: "s1",
    tenantId: "t1",
    name: "PT Sumber Pangan",
    pic: { name: "Bu Rina", email: null, address: null, phone: null },
    phone: "031-8877-221",
    email: "sales@sumber.co.id",
    address: {
      street: "Jl. Rungkut Industri 21",
      city: "Surabaya",
      postalCode: null,
      province: null,
      country: null,
    },
    npwp: "01.234.567.8-901.000",
    notes: null,
    type: "beli_putus",
    paymentTermDays: 30,
    isActive: true,
    createdBy: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const owed = (outstanding: string, invoiceCount = 2) =>
  new Map<string, SupplierOutstandingRow>([
    [
      "s1",
      {
        supplierId: "s1",
        supplierName: null,
        invoiceCount,
        outstanding,
        // Nothing late and nothing due this week in this fixture — the supplier
        // column under test reads `outstanding`, and the overdue/due-soon split
        // belongs to the payables screens.
        overdueInvoiceCount: 0,
        overdueOutstanding: "0",
        dueSoonInvoiceCount: 0,
        dueSoonOutstanding: "0",
      },
    ],
  ]);

const bought = (receiptCount: number) =>
  new Map<string, SupplierPurchaseRow>([
    [
      "s1",
      {
        supplierId: "s1",
        supplierName: null,
        receiptCount,
        purchased: "0",
        taxTotal: "0",
        lastReceiptDate: null,
      },
    ],
  ]);

function renderTable(
  suppliers: Supplier[],
  options: {
    outstanding?: Map<string, SupplierOutstandingRow>;
    purchases?: Map<string, SupplierPurchaseRow>;
    horizonDays?: number | null;
    onChanged?: () => void;
    permissions?: Parameters<typeof renderWithAuth>[1];
  } = {},
) {
  return renderWithAuth(
    <SuppliersTable
      suppliers={suppliers}
      outstanding={options.outstanding ?? new Map()}
      purchases={options.purchases ?? new Map()}
      horizonDays={options.horizonDays ?? 7}
      loading={false}
      onChanged={options.onChanged ?? jest.fn()}
    />,
    options.permissions,
  );
}

/**
 * Opens a row's kebab menu and returns it. The actions live behind it, so every
 * action assertion starts here — which is also the cheapest way to notice if the
 * trigger ever stops being reachable by its accessible name.
 */
async function openRowMenu(name = "PT Sumber Pangan") {
  await userEvent.click(
    screen.getByRole("button", { name: `Aksi untuk ${name}` }),
  );
  return screen.getByRole("menu");
}

describe("SuppliersTable", () => {
  afterEach(() => jest.restoreAllMocks());

  it("shows the terms and the cooperation model", () => {
    renderTable([makeSupplier()]);

    expect(screen.getByText("PT Sumber Pangan")).toBeInTheDocument();
    expect(screen.getByText("beli putus")).toBeInTheDocument();
    expect(screen.getByText("30 hari")).toBeInTheDocument();
  });

  /**
   * THE COLUMN THIS SCREEN EXISTS FOR. Without it the list is an address book;
   * with it, it is what somebody reads before deciding who to pay this week.
   */
  it("shows what is still owed, and nothing when the debt is zero", () => {
    const { unmount } = renderTable([makeSupplier()], {
      outstanding: owed("1500000.0000"),
    });
    expect(screen.getByText(/1\.500\.000/)).toBeInTheDocument();
    unmount();

    // A supplier owing nothing is ABSENT from the summary rather than present
    // with zeros — the row must read that as "—", not as missing data.
    renderTable([makeSupplier()]);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  /**
   * WHEN, under HOW MUCH. Ten million a month late and ten million due in June
   * are the same figure in this column and completely different decisions, so
   * the split is what makes it answer "who do I pay first". Both halves are the
   * server's own subsets of the amount above them — nothing here subtracts.
   */
  it("splits the debt into what is late and what is about to be", () => {
    renderTable([makeSupplier()], {
      outstanding: new Map([
        [
          "s1",
          {
            supplierId: "s1",
            supplierName: null,
            invoiceCount: 3,
            outstanding: "1500000.0000",
            overdueInvoiceCount: 1,
            overdueOutstanding: "900000.0000",
            dueSoonInvoiceCount: 1,
            dueSoonOutstanding: "400000.0000",
          },
        ],
      ]),
      horizonDays: 7,
    });

    expect(screen.getByText(/1\.500\.000/)).toBeInTheDocument();
    expect(screen.getByText(/900\.000 lewat tempo/)).toBeInTheDocument();
    // The window is named from what the server reported, never a constant here.
    expect(screen.getByText(/400\.000 ≤ 7 hari/)).toBeInTheDocument();
  });

  // A vendor with nothing late says nothing about lateness: two zero lines would
  // read as data where there is none.
  it("omits a half of the split that is zero", () => {
    renderTable([makeSupplier()], { outstanding: owed("1500000.0000") });

    expect(screen.queryByText(/lewat tempo/)).toBeNull();
    // Narrower than /hari/ on purpose: the Termin column says "30 hari".
    expect(screen.queryByText(/≤ \d+ hari/)).toBeNull();
  });

  it("counts deliveries from the purchase summary", () => {
    renderTable([makeSupplier()], { purchases: bought(7) });

    expect(screen.getByText("7")).toBeInTheDocument();
  });

  describe("the actions menu", () => {
    it("keeps the actions behind one trigger per row", async () => {
      renderTable([makeSupplier()]);

      // Nothing is on show until the menu is opened — that is the point of it.
      expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();

      const menu = await openRowMenu();

      expect(within(menu).getByRole("menuitem", { name: /Ubah/ })).toBeInTheDocument();
      expect(
        within(menu).getByRole("menuitem", { name: /Nonaktifkan/ }),
      ).toBeInTheDocument();
      expect(within(menu).getByRole("menuitem", { name: /Hapus/ })).toBeInTheDocument();
    });

    it("names the row in the trigger, since the icon does not", () => {
      renderTable([makeSupplier(), makeSupplier({ _id: "s2", name: "CV Mitra" })]);

      // Twenty identical "Aksi" buttons would tell a screen-reader user nothing.
      expect(
        screen.getByRole("button", { name: "Aksi untuk PT Sumber Pangan" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Aksi untuk CV Mitra" }),
      ).toBeInTheDocument();
    });

    it("links Ubah straight to the edit route", async () => {
      renderTable([makeSupplier()]);
      const menu = await openRowMenu();

      expect(within(menu).getByRole("menuitem", { name: /Ubah/ })).toHaveAttribute(
        "href",
        "/dashboard/purchasing/suppliers/s1/edit",
      );
    });
  });

  describe("the two lifecycle axes", () => {
    it("badges a deactivated supplier and offers to reactivate it", async () => {
      renderTable([makeSupplier({ isActive: false })]);

      expect(screen.getByText("nonaktif")).toBeInTheDocument();
      const menu = await openRowMenu();
      expect(
        within(menu).getByRole("menuitem", { name: /Aktifkan/ }),
      ).toBeInTheDocument();
    });

    it("badges a deleted supplier and offers only restore", async () => {
      renderTable([makeSupplier({ deletedAt: "2026-08-01T00:00:00.000Z" })]);

      expect(screen.getByText("terhapus")).toBeInTheDocument();
      const menu = await openRowMenu();

      expect(
        within(menu).getByRole("menuitem", { name: /Pulihkan/ }),
      ).toBeInTheDocument();
      // Restoring first is what makes the others meaningful again.
      expect(within(menu).queryByRole("menuitem", { name: /Nonaktifkan/ })).toBeNull();
      expect(within(menu).queryByRole("menuitem", { name: /Hapus/ })).toBeNull();
    });

    /**
     * A supplier stored before `isActive` existed has no such field. Reading the
     * absence as "deactivated" would grey out and mislabel every vendor a tenant
     * already had.
     */
    it("treats a supplier with no isActive field as active", async () => {
      const legacy = makeSupplier();
      delete legacy.isActive;

      renderTable([legacy]);

      expect(screen.queryByText("nonaktif")).not.toBeInTheDocument();
      const menu = await openRowMenu();
      expect(
        within(menu).getByRole("menuitem", { name: /Nonaktifkan/ }),
      ).toBeInTheDocument();
    });
  });

  describe("deactivating", () => {
    it("patches isActive to false after confirmation, then refetches", async () => {
      const update = jest
        .spyOn(supplierService, "update")
        .mockResolvedValue({} as never);
      const onChanged = jest.fn();

      renderTable([makeSupplier()], { onChanged });

      const menu = await openRowMenu();
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: /Nonaktifkan/ }),
      );

      const dialog = await screen.findByRole("dialog");
      // The wording has to say what happens to the DOCUMENTS — deactivating and
      // deleting look identical in a list.
      expect(
        within(dialog).getByText(/tidak akan muncul lagi/i),
      ).toBeInTheDocument();

      await userEvent.click(
        within(dialog).getByRole("button", { name: "Nonaktifkan" }),
      );

      expect(update).toHaveBeenCalledWith("s1", { isActive: false });
      expect(onChanged).toHaveBeenCalled();
    });

    it("patches isActive to true when reactivating", async () => {
      const update = jest
        .spyOn(supplierService, "update")
        .mockResolvedValue({} as never);

      renderTable([makeSupplier({ isActive: false })]);

      const menu = await openRowMenu();
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: /Aktifkan/ }),
      );
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Aktifkan",
        }),
      );

      expect(update).toHaveBeenCalledWith("s1", { isActive: true });
    });

    it("does nothing until the dialog is confirmed", async () => {
      const update = jest.spyOn(supplierService, "update");

      renderTable([makeSupplier()]);
      const menu = await openRowMenu();
      await userEvent.click(
        within(menu).getByRole("menuitem", { name: /Nonaktifkan/ }),
      );

      expect(update).not.toHaveBeenCalled();
    });
  });

  it("soft-deletes through its own endpoint, not through isActive", async () => {
    const remove = jest
      .spyOn(supplierService, "remove")
      .mockResolvedValue({} as never);
    const update = jest.spyOn(supplierService, "update");

    renderTable([makeSupplier()]);

    const menu = await openRowMenu();
    await userEvent.click(within(menu).getByRole("menuitem", { name: /Hapus/ }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Hapus",
      }),
    );

    expect(remove).toHaveBeenCalledWith("s1");
    expect(update).not.toHaveBeenCalled();
  });

  it("surfaces a refusal inside the dialog rather than closing it", async () => {
    jest
      .spyOn(supplierService, "restore")
      .mockRejectedValue(
        new (
          await import("@/services/api-error")
        ).ApiError("Supplier 'PT Sumber Pangan' already exists", 409),
      );

    renderTable([makeSupplier({ deletedAt: "2026-08-01T00:00:00.000Z" })]);

    const menu = await openRowMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /Pulihkan/ }),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Pulihkan",
      }),
    );

    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  describe("permission gating", () => {
    /**
     * A read-only role keeps the menu, and it holds exactly one thing: the way
     * to the detail screen, which needs no grant beyond the one that rendered
     * this row. Every mutation is still gated — the menu is not empty, and it is
     * not a way in either.
     */
    it("offers a read-only role the detail link and nothing else", async () => {
      renderTable([makeSupplier()], {
        permissions: {
          isSuperAdmin: false,
          permissions: [{ feature: "suppliers", actions: ["read"] }],
        },
      });

      const menu = await openRowMenu();

      expect(
        within(menu).getByRole("menuitem", { name: /Lihat detail/ }),
      ).toBeInTheDocument();
      expect(within(menu).queryByRole("menuitem", { name: /Ubah/ })).toBeNull();
      expect(
        within(menu).queryByRole("menuitem", { name: /Nonaktifkan/ }),
      ).toBeNull();
      expect(within(menu).queryByRole("menuitem", { name: /Hapus/ })).toBeNull();
    });

    it("points the detail link at the supplier's own page", async () => {
      renderTable([makeSupplier()]);

      const menu = await openRowMenu();

      expect(
        within(menu).getByRole("menuitem", { name: /Lihat detail/ }),
      ).toHaveAttribute("href", "/dashboard/purchasing/suppliers/s1");
    });

    it("lets an update-only role deactivate but not delete", async () => {
      renderTable([makeSupplier()], {
        permissions: {
          isSuperAdmin: false,
          permissions: [{ feature: "suppliers", actions: ["read", "update"] }],
        },
      });

      const menu = await openRowMenu();

      expect(
        within(menu).getByRole("menuitem", { name: /Nonaktifkan/ }),
      ).toBeInTheDocument();
      expect(within(menu).queryByRole("menuitem", { name: /Hapus/ })).toBeNull();
    });

    /**
     * The mixed case the per-row trigger exists for: with "show deleted" on, the
     * two rows offer different things. The live one has the detail link; the
     * deleted one has Pulihkan and NOT the detail link, because the detail
     * endpoint reads live suppliers only and the link would land on "tidak
     * ditemukan". Restoring first is what makes it reachable.
     */
    it("offers restore on a deleted row, and no way into its detail", async () => {
      renderTable(
        [
          makeSupplier(),
          makeSupplier({
            _id: "s2",
            name: "CV Mitra",
            deletedAt: "2026-08-01T00:00:00.000Z",
          }),
        ],
        {
          permissions: {
            isSuperAdmin: false,
            permissions: [{ feature: "suppliers", actions: ["read", "restore"] }],
          },
        },
      );

      const live = await openRowMenu();
      expect(
        within(live).getByRole("menuitem", { name: /Lihat detail/ }),
      ).toBeInTheDocument();
      expect(
        within(live).queryByRole("menuitem", { name: /Pulihkan/ }),
      ).toBeNull();
      await userEvent.keyboard("{Escape}");

      const deleted = await openRowMenu("CV Mitra");
      expect(
        within(deleted).getByRole("menuitem", { name: /Pulihkan/ }),
      ).toBeInTheDocument();
      expect(
        within(deleted).queryByRole("menuitem", { name: /Lihat detail/ }),
      ).toBeNull();
    });
  });
});
