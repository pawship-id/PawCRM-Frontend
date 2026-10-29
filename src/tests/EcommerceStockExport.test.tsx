import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BindSkuDialog } from "@/features/ecommerce/components/BindSkuDialog";
import { StockExportDialog } from "@/features/ecommerce/components/StockExportDialog";
import { marketplaceService } from "@/services/marketplace.service";
import { productService } from "@/services/product.service";
import type { MarketplaceListing, MarketplaceStore } from "@/types/marketplace";
import { saveBlob } from "@/utils/xlsx";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/marketplace.service");
jest.mock("@/services/product.service");
jest.mock("@/utils/xlsx", () => ({ saveBlob: jest.fn() }));
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const marketplace = marketplaceService as jest.Mocked<typeof marketplaceService>;
const products = productService as jest.Mocked<typeof productService>;

const store = (overrides: Partial<MarketplaceStore> = {}): MarketplaceStore => ({
  _id: "store-1",
  marketplace: "shopee",
  name: "pawship.id",
  shopUsername: "pawship.id",
  shopId: "934421260",
  warehouseId: "wh-1",
  warehouseName: "Gudang Pusat",
  branchId: "br-1",
  branchName: "Kertajaya",
  stockBuffer: 2,
  isActive: true,
  template: {
    fileId: "file-1",
    fileName: "mass_update_sales_info_934421260_20261025171334.xlsx",
    stockColumn: "I",
    variantCount: 4953,
    uploadedAt: "2026-10-28T03:00:00.000Z",
    uploadedBy: null,
  },
  lastStockExportAt: null,
  createdAt: "2026-10-28T03:00:00.000Z",
  updatedAt: "2026-10-28T03:00:00.000Z",
  ...overrides,
});

describe("StockExportDialog", () => {
  beforeEach(() => {
    marketplace.previewStockExport.mockResolvedValue({
      warehouseId: "wh-1",
      stockBuffer: 2,
      template: store().template!,
      counts: { changed: 1, same: 1, unbound: 4951 },
      items: [
        {
          listingId: "l1",
          rowNumber: 2952,
          shopeeSku: "HTT005",
          productName: "Head To Tail Dry Ear Powder",
          variationName: "",
          productId: "p1",
          templatePrice: "45000",
          templateStock: 3,
          onHand: 10,
          exportStock: 8,
          change: "changed",
          product: { _id: "p1", name: "Head To Tail", sku: "HTT005" },
        },
      ],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });
    marketplace.generateStockExport.mockResolvedValue({
      batchId: "batch-1",
      fileName: "stok_buloo.xlsx",
      counts: { changed: 1, same: 1, unbound: 4951 },
    });
    marketplace.downloadHistoryFile.mockResolvedValue({
      blob: new Blob(["x"]),
      filename: "stok_buloo.xlsx",
    });
  });

  it("offers only stores with a template, previews, then makes and downloads the file", async () => {
    const user = userEvent.setup();
    const onExported = jest.fn();
    renderWithAuth(
      <StockExportDialog
        stores={[store(), store({ _id: "store-2", name: "Toko baru", template: null })]}
        initialStoreId="store-1"
        onClose={jest.fn()}
        onExported={onExported}
      />,
    );

    expect(screen.getByText("Gudang Pusat")).toBeInTheDocument();
    expect(screen.queryByText(/Toko baru/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(await screen.findByText("Head To Tail Dry Ear Powder")).toBeInTheDocument();
    expect(marketplace.previewStockExport).toHaveBeenCalledWith("store-1", {
      page: 1,
      limit: 25,
      status: "",
    });

    await user.click(screen.getByRole("button", { name: "Buat file" }));

    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    expect(marketplace.generateStockExport).toHaveBeenCalledWith("store-1");
    expect(marketplace.downloadHistoryFile).toHaveBeenCalledWith("batch-1", "stok_buloo.xlsx");
    expect(onExported).toHaveBeenCalled();
    expect(screen.getByText("File siap diupload ke Shopee")).toBeInTheDocument();
  });

  it("explains when no store is ready", () => {
    renderWithAuth(
      <StockExportDialog
        stores={[store({ template: null })]}
        initialStoreId={null}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText(/Belum ada toko aktif dengan template Shopee/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lanjut" })).toBeDisabled();
  });
});

describe("BindSkuDialog", () => {
  const listing: MarketplaceListing = {
    _id: "listing-1",
    storeId: "store-1",
    productCode: "1",
    variationCode: "2",
    productName: "Pawship Snack Anjing",
    variationName: "M",
    parentSku: "",
    variationSku: "BullyStick:M",
    shopeeSku: "BullyStick:M",
    templatePrice: "37400",
    templateStock: "0",
    rowNumber: 10,
    inCurrentTemplate: true,
    productId: "p1",
    status: "bound",
    product: { _id: "p1", name: "Bully Stick M", sku: "BULLYSTICK:M", isActive: true },
    stock: 1,
    exportStock: 0,
  };

  beforeEach(() => {
    products.list.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    } as never);
  });

  it("searches Buloo products by the Shopee SKU and unbinds after confirming", async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();
    marketplace.unbindListing.mockResolvedValue({
      listing: { ...listing, productId: null, product: null, status: "unbound" },
      affectedListings: 2,
    });

    renderWithAuth(
      <BindSkuDialog storeId="store-1" listing={listing} onClose={jest.fn()} onChanged={onChanged} />,
    );

    await waitFor(() =>
      expect(products.list).toHaveBeenCalledWith({ search: "BullyStick:M", holdsStock: true, limit: 20 }),
    );
    expect(screen.getByRole("button", { name: "Ikat SKU" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Lepas ikatan" }));
    await user.click(await screen.findByRole("button", { name: "Lepas ikatan" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(marketplace.unbindListing).toHaveBeenCalledWith("store-1", "listing-1");
    expect(onChanged.mock.calls[0][1]).toBe("unbound");
  });

  it("shows the empty state with a way to Produk & Varian when nothing matches", async () => {
    renderWithAuth(
      <BindSkuDialog
        storeId="store-1"
        listing={{ ...listing, productId: null, product: null, status: "unbound", stock: null }}
        onClose={jest.fn()}
        onChanged={jest.fn()}
      />,
    );

    expect(
      await screen.findByText("Belum ada SKU Buloo yang mirip. Cari dengan nama atau SKU di atas."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buka Produk & Varian" })).toHaveAttribute(
      "href",
      "/dashboard/inventory/products",
    );
    expect(screen.getByRole("button", { name: "Ikat SKU" })).toBeDisabled();
  });
});
