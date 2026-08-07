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
    pic: "Bu Rina",
    phone: "031-8877-221",
    email: "sales@sumber.co.id",
    address: "Jl. Rungkut Industri 21",
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
        // Nothing late in this fixture — the supplier column under test reads
        // `outstanding`, and the overdue split belongs to the payables screens.
        overdueInvoiceCount: 0,
        overdueOutstanding: "0",
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
    onChanged?: () => void;
    permissions?: Parameters<typeof renderWithAuth>[1];
  } = {},
) {
  return renderWithAuth(
    <SuppliersTable
      suppliers={suppliers}
      outstanding={options.outstanding ?? new Map()}
      purchases={options.purchases ?? new Map()}
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
    it("hides the whole menu from a read-only role", () => {
      renderTable([makeSupplier()], {
        permissions: {
          isSuperAdmin: false,
          permissions: [{ feature: "suppliers", actions: ["read"] }],
        },
      });

      // No trigger at all: a menu that opens onto nothing is worse than none.
      expect(
        screen.queryByRole("button", { name: /Aksi untuk/ }),
      ).toBeNull();
      // The column goes with it — an empty Actions header is noise.
      expect(screen.queryByRole("columnheader", { name: "Aksi" })).toBeNull();
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
     * The mixed case the per-row trigger exists for: with "show deleted" on, a
     * restore-only role has something to offer on the deleted rows and nothing
     * on the live ones. A single column-level decision would give every row a
     * trigger, half of them empty.
     */
    it("gives a restore-only role a menu on deleted rows only", () => {
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

      expect(
        screen.queryByRole("button", { name: "Aksi untuk PT Sumber Pangan" }),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: "Aksi untuk CV Mitra" }),
      ).toBeInTheDocument();
    });
  });
});
