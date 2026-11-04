import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConnectStoreDialog } from "@/features/ecommerce/components/ConnectStoreDialog";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { marketplaceService } from "@/services/marketplace.service";
import { warehouseService } from "@/services/warehouse.service";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/marketplace.service");
jest.mock("@/services/warehouse.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const page = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
});

describe("ConnectStoreDialog", () => {
  it("asks where payouts land, defaulting to a new Saldo Shopee account", async () => {
    const user = userEvent.setup();
    (warehouseService.list as jest.Mock).mockResolvedValue(page([{ _id: "wh-1", name: "Gudang Pusat" }]));
    (chartOfAccountsService.list as jest.Mock).mockResolvedValue(
      page([{ _id: "acc-1102", code: "1102", name: "Bank", accountCategory: "cash_bank" }]),
    );
    (marketplaceService.createStore as jest.Mock).mockResolvedValue({ _id: "s1", name: "pawship.id" });
    const onCreated = jest.fn();

    renderWithAuth(<ConnectStoreDialog onClose={jest.fn()} onCreated={onCreated} />);

    await user.type(screen.getByLabelText(/Nama toko/), "pawship.id");
    expect(screen.getByText("Akun baru: Saldo Shopee – pawship.id")).toBeInTheDocument();
    expect(chartOfAccountsService.list).toHaveBeenCalledWith(
      expect.objectContaining({ accountCategory: "cash_bank" }),
    );
    expect(screen.queryByLabelText(/Username Shopee/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Buffer stok/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Gudang sumber stok/ }));
    await user.click(await screen.findByRole("option", { name: /Gudang Pusat/ }));
    await user.click(screen.getByRole("button", { name: "Hubungkan toko" }));

    await waitFor(() =>
      expect(marketplaceService.createStore).toHaveBeenCalledWith({
        marketplace: "shopee",
        name: "pawship.id",
        warehouseId: "wh-1",
        saldoAccount: "new",
      }),
    );
    expect(onCreated).toHaveBeenCalled();
  });
});
