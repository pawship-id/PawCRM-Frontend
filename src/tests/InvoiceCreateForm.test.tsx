import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Swal from "sweetalert2";

import { InvoiceCreateForm } from "@/features/sales";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { customerService } from "@/services/customer.service";
import { branchService } from "@/services/branch.service";
import { warehouseService } from "@/services/warehouse.service";
import { productService } from "@/services/product.service";
import { productBatchService } from "@/services/productBatch.service";
import { serviceService } from "@/services/service.service";
import { tenantService } from "@/services/tenant.service";
import { bookingService } from "@/services/booking.service";
import { petService } from "@/services/pet.service";
import { ApiError } from "@/services/api-error";

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

jest.mock("@/features/auth", () => ({
  useAuth: () => ({ user: { allBranches: true, branchAccess: [] } }),
}));

/**
 * The form that raises an invoice by hand.
 *
 * WHAT IS ASSERTED THROUGHOUT IS THE REQUEST BODY, because what this form sends
 * is more constrained than what it shows: prices and names are read from the
 * catalogue server-side, so a payload carrying either would mean a client could
 * discount a sale without approval.
 */
const page = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
});

const BRANCH = { _id: "br1", name: "Cabang Pusat", code: "PST" };
const WAREHOUSE = {
  _id: "wh1",
  name: "Gudang Pusat",
  defaultBranchId: "br1",
  isActive: true,
};
const CENTRAL = {
  _id: "wh0",
  name: "Gudang Pusat Bersama",
  defaultBranchId: null,
  isActive: true,
};
const OTHER = {
  _id: "wh2",
  name: "Gudang Cabang Lain",
  defaultBranchId: "br2",
  isActive: true,
};
const PRODUCT = {
  _id: "p1",
  name: "Kalung Nylon",
  sku: "KLG",
  sellPrice: "100000",
};
const SERVICE = { _id: "s1", name: "Grooming", price: "150000" };

function mockLookups(overrides: { warehouses?: unknown[] } = {}) {
  jest
    .spyOn(customerService, "list")
    .mockResolvedValue(page([{ _id: "c1", name: "Bu Sari" }]) as never);
  jest.spyOn(branchService, "list").mockResolvedValue(page([BRANCH]) as never);
  jest
    .spyOn(warehouseService, "list")
    .mockResolvedValue(page(overrides.warehouses ?? [WAREHOUSE]) as never);
  jest
    .spyOn(productService, "list")
    .mockResolvedValue(page([PRODUCT]) as never);
  // The stock under a product line's SKU — ten at Gudang Pusat, none elsewhere.
  jest.spyOn(productService, "getById").mockResolvedValue({
    ...PRODUCT,
    stockByWarehouse: [{ warehouseId: "wh1", qty: "10.0000" }],
  } as never);
  jest
    .spyOn(serviceService, "list")
    .mockResolvedValue(page([SERVICE]) as never);
  // The booking panel mounts as soon as a customer is chosen. Stubbed empty so
  // these cases stay about the form rather than about the bridge.
  jest.spyOn(bookingService, "bridge").mockResolvedValue([] as never);
  // PCR-035 — the animals a service line can be billed against.
  jest
    .spyOn(petService, "list")
    .mockResolvedValue(page([{ _id: "pet1", name: "Miko" }]) as never);
  jest.spyOn(tenantService, "me").mockResolvedValue({
    settings: { taxRate: 11, priceIncludesTax: true },
  } as never);
}

/**
 * Opens a labelled picker and chooses the option matching `option`.
 *
 * The trigger is a `button`, not a `combobox` — `FilterTrigger` says why: a
 * div-with-role would be ignored by assistive tech, so the shell is a real
 * button and the popover carries the options.
 */
async function pick(field: RegExp, option: RegExp) {
  await userEvent.click(await screen.findByRole("button", { name: field }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

/**
 * Opens "+ Tambah barang atau jasa", ticks one item on the tab it lives on, and
 * adds it — the same dialog the stock documents open.
 */
async function addItem(name: RegExp, tab: "Barang" | "Jasa" = "Barang") {
  await userEvent.click(
    screen.getByRole("button", { name: /tambah barang atau jasa/i }),
  );
  const dialog = await screen.findByRole("dialog");
  if (tab === "Jasa") {
    await userEvent.click(within(dialog).getByRole("tab", { name: /^Jasa/ }));
  }
  await userEvent.click(await within(dialog).findByRole("checkbox", { name }));
  await userEvent.click(
    within(dialog).getByRole("button", { name: /^tambahkan/i }),
  );
}

/** Fills the header and adds one product line — the shortest valid invoice. */
async function fillMinimal() {
  await pick(/^Pelanggan$/i, /Bu Sari/);
  await pick(/^Cabang$/i, /Cabang Pusat/);
  await pick(/^Gudang$/i, /Gudang Pusat/);
  await addItem(/Kalung Nylon/);
}

const submit = () =>
  userEvent.click(screen.getByRole("button", { name: /^simpan faktur$/i }));

const sent = () =>
  (customerInvoiceService.create as jest.Mock).mock.calls[0][0];

beforeEach(() => {
  push.mockClear();
  (Swal.fire as jest.Mock).mockClear();
  mockLookups();
  jest.spyOn(customerInvoiceService, "create").mockResolvedValue({
    _id: "inv1",
    invoiceNumber: "INV/PST/2608/0001",
  } as never);
});

afterEach(() => jest.restoreAllMocks());

/**
 * The header's customer picker, as the mockup draws it: the phone beside each
 * name, so two customers called Budi can be told apart before one is billed.
 */
describe("the customer picker", () => {
  beforeEach(() => {
    jest.spyOn(customerService, "list").mockResolvedValue(
      page([
        { _id: "c1", name: "Budi Santoso", phone: "0812-1000-16" },
        { _id: "c2", name: "Budi Wijaya", phone: "0812-1000-17" },
      ]) as never,
    );
  });

  it("shows each phone, finds a customer by it, and keeps it on the trigger", async () => {
    render(<InvoiceCreateForm />);

    await userEvent.click(
      await screen.findByRole("button", { name: /^Pelanggan$/i }),
    );
    expect(
      screen.getByRole("option", { name: /Budi Santoso.*0812-1000-16/ }),
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", { name: /cari pelanggan/i }),
      "1000-17",
    );
    expect(
      screen.queryByRole("option", { name: /Budi Santoso/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("option", { name: /Budi Wijaya/ }));
    expect(
      screen.getByRole("button", { name: /^Pelanggan$/i }),
    ).toHaveTextContent("Budi Wijaya — 0812-1000-17");
  });

  /*
    OPEN, THEN SCROLLED UNTIL THE TRIGGER IS BEHIND DashboardShell's HEADER.
    The list hangs below the trigger, so from there on it could only be painted
    over the navbar — it closes instead. jsdom has no layout, so the trigger's
    position is supplied.
  */
  it("closes once the page scrolls its trigger behind the header", async () => {
    render(<InvoiceCreateForm />);

    const trigger = await screen.findByRole("button", {
      name: /^Pelanggan$/i,
    });
    await userEvent.click(trigger);
    const rect = jest.spyOn(trigger, "getBoundingClientRect");

    // Still clear of the 56px header: a scroll leaves it open.
    rect.mockReturnValue({ top: 100, bottom: 144 } as DOMRect);
    fireEvent.scroll(document);
    expect(
      screen.getByRole("option", { name: /Budi Santoso/ }),
    ).toBeInTheDocument();

    rect.mockReturnValue({ top: 0, bottom: 44 } as DOMRect);
    fireEvent.scroll(document);
    await waitFor(() =>
      expect(
        screen.queryByRole("option", { name: /Budi Santoso/ }),
      ).not.toBeInTheDocument(),
    );
  });
});

/**
 * "+ Tambah barang atau jasa" — the dialog the stock documents already open,
 * with a Jasa tab beside the product picker.
 */
/**
 * The Pajak column beside Diskon — each line's slice of the invoice's PPN, drawn
 * as the detail page draws it. The lookups here charge 11%, inclusive.
 */
describe("the tax column", () => {
  it("shows the rate and the tax carried inside an inclusive price", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();

    expect(
      screen.getByRole("columnheader", { name: "Pajak" }),
    ).toBeInTheDocument();
    expect(screen.getByText("PPN 11%")).toBeInTheDocument();
    expect(screen.getByText(/^termasuk /)).toBeInTheDocument();
  });

  it("reads Non-PPN when the tenant charges no tax", async () => {
    jest.spyOn(tenantService, "me").mockResolvedValue({
      settings: { taxRate: 0, priceIncludesTax: true },
    } as never);

    render(<InvoiceCreateForm />);
    await fillMinimal();

    expect(screen.getByText("Non-PPN")).toBeInTheDocument();
    expect(screen.queryByText(/^PPN /)).not.toBeInTheDocument();
  });
});

/*
  THE CAMERA DECODER, replaced: jsdom has no camera and no video frames. The
  stand-in records the callback the dialog hands it, so a test can "show" the
  camera a code, and records whether the stream was stopped.
*/
jest.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromConstraints(...args: unknown[]) {
      mockCamera.callback = args[2] as MockCameraCallback;
      return Promise.resolve({
        stop: () => {
          mockCamera.stopped = true;
        },
      });
    }
  },
}));

type MockCameraCallback = (result?: { getText: () => string }) => void;
const mockCamera: { callback: MockCameraCallback | null; stopped: boolean } = {
  callback: null,
  stopped: false,
};

/** A product the scanner may put on a bill. */
const SCANNED = {
  ...PRODUCT,
  productType: "standalone",
  isActive: true,
  barcode: "8991234500123",
};

/**
 * Scanning a barcode straight onto the bill — a counter scanner typing into
 * the field, or the camera. Decided 12 Sep 2026: both, and no picker between
 * the scan and the row.
 */
describe("scanning a barcode", () => {
  it("adds the scanned product, and one more of it on a second scan", async () => {
    jest
      .spyOn(productService, "getByBarcode")
      .mockResolvedValue(SCANNED as never);
    render(<InvoiceCreateForm />);

    const field = await screen.findByRole("textbox", { name: /scan barcode/i });

    // A scanner types the code and ends it with Enter.
    await userEvent.type(field, "8991234500123{Enter}");
    expect(
      await screen.findByRole("button", { name: /Hapus Kalung Nylon/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /jumlah kalung nylon/i }),
    ).toHaveValue("1");
    expect(field).toHaveValue("");

    await userEvent.type(field, "8991234500123{Enter}");
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: /jumlah kalung nylon/i }),
      ).toHaveValue("2"),
    );
    expect(
      screen.getAllByRole("button", { name: /Hapus Kalung Nylon/ }),
    ).toHaveLength(1);
    expect(productService.getByBarcode).toHaveBeenCalledWith("8991234500123");
    // The Enter the scanner sends did not submit the invoice.
    expect(customerInvoiceService.create).not.toHaveBeenCalled();
  });

  it("says why a code cannot be billed, and adds nothing", async () => {
    jest
      .spyOn(productService, "getByBarcode")
      .mockRejectedValueOnce(new ApiError("No product with barcode '000'", 404))
      .mockResolvedValueOnce({ ...SCANNED, productType: "bundle" } as never)
      .mockResolvedValueOnce({ ...SCANNED, isActive: false } as never);
    // Not a lot code either — both lookups have been asked before "no match".
    jest
      .spyOn(productBatchService, "lookup")
      .mockRejectedValue(new ApiError("No batch carries that code", 404));
    render(<InvoiceCreateForm />);

    const field = await screen.findByRole("textbox", { name: /scan barcode/i });

    await userEvent.type(field, "000{Enter}");
    expect(
      await screen.findByText(
        "Kode 000 tidak cocok dengan barcode produk maupun kode batch mana pun.",
      ),
    ).toBeInTheDocument();

    await userEvent.type(field, "111{Enter}");
    expect(
      await screen.findByText(/Kalung Nylon adalah paket \(bundle\)/),
    ).toBeInTheDocument();

    await userEvent.type(field, "222{Enter}");
    expect(
      await screen.findByText(/Kalung Nylon sudah nonaktif/),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /Hapus Kalung Nylon/ }),
    ).not.toBeInTheDocument();
  });

  /**
   * A LOT LABEL — the code Cetak label batch prints. Not a product barcode, so
   * the field falls through to the lot lookup; the lot names its product, and
   * that product goes on the bill. Invoices carry no lot: stock is drawn FEFO
   * when the invoice posts, as at the till.
   */
  describe("a batch label", () => {
    const LOT = {
      _id: "lot1",
      productId: "p1",
      warehouseId: "wh1",
      warehouseName: "Gudang Pusat",
      batchCode: "KLG-B26-0001",
      qtyRemaining: "5",
      expiryDate: null,
    };

    beforeEach(() => {
      jest
        .spyOn(productService, "getByBarcode")
        .mockRejectedValue(new ApiError("No product with barcode", 404));
      jest.spyOn(productService, "getById").mockResolvedValue(SCANNED as never);
    });

    /** The header a lot has to agree with: Cabang Pusat, Gudang Pusat. */
    async function chooseWarehouse() {
      await pick(/^Cabang$/i, /Cabang Pusat/);
      await pick(/^Gudang$/i, /Gudang Pusat/);
    }

    it("adds the lot's product when the invoice's warehouse holds it", async () => {
      jest.spyOn(productBatchService, "lookup").mockResolvedValue(LOT as never);
      render(<InvoiceCreateForm />);
      await chooseWarehouse();

      await userEvent.type(
        screen.getByRole("textbox", { name: /scan barcode/i }),
        "KLG-B26-0001{Enter}",
      );

      expect(
        await screen.findByRole("button", { name: /Hapus Kalung Nylon/ }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Kalung Nylon (batch KLG-B26-0001) masuk ke faktur."),
      ).toBeInTheDocument();
      expect(productBatchService.lookup).toHaveBeenCalledWith("KLG-B26-0001");
      expect(productService.getById).toHaveBeenCalledWith("p1");
    });

    /*
      A LOT LIVES AT ONE WAREHOUSE. With none chosen there is nothing to compare
      it with; with another chosen, billing it would cut stock from a shelf the
      carton never left.
    */
    it("refuses a lot with no warehouse chosen, or from another one", async () => {
      jest.spyOn(productBatchService, "lookup").mockResolvedValue({
        ...LOT,
        warehouseId: "wh2",
        warehouseName: "Gudang Cabang Lain",
      } as never);
      render(<InvoiceCreateForm />);

      const field = await screen.findByRole("textbox", {
        name: /scan barcode/i,
      });
      await userEvent.type(field, "KLG-B26-0001{Enter}");
      expect(await screen.findByText(/^Pilih gudang dulu/)).toBeInTheDocument();

      await chooseWarehouse();
      await userEvent.type(field, "KLG-B26-0001{Enter}");
      expect(
        await screen.findByText(
          "Batch KLG-B26-0001 ada di Gudang Cabang Lain, bukan di Gudang Pusat.",
        ),
      ).toBeInTheDocument();

      expect(productService.getById).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("button", { name: /Hapus Kalung Nylon/ }),
      ).not.toBeInTheDocument();
    });

    it("refuses an expired lot", async () => {
      jest.spyOn(productBatchService, "lookup").mockResolvedValue({
        ...LOT,
        expiryDate: "2020-01-31T00:00:00.000Z",
      } as never);
      render(<InvoiceCreateForm />);
      await chooseWarehouse();

      await userEvent.type(
        screen.getByRole("textbox", { name: /scan barcode/i }),
        "KLG-B26-0001{Enter}",
      );

      expect(
        await screen.findByText(/Batch KLG-B26-0001 sudah kedaluwarsa/),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Hapus Kalung Nylon/ }),
      ).not.toBeInTheDocument();
    });

    /*
      THE CARTON IS IN SOMEBODY'S HAND, so a lot the books call empty still puts
      its product on — and says so, because the shelf and the books disagree.
    */
    it("still adds the product from a lot recorded empty, and says so", async () => {
      jest
        .spyOn(productBatchService, "lookup")
        .mockResolvedValue({ ...LOT, qtyRemaining: "0" } as never);
      render(<InvoiceCreateForm />);
      await chooseWarehouse();

      await userEvent.type(
        screen.getByRole("textbox", { name: /scan barcode/i }),
        "KLG-B26-0001{Enter}",
      );

      expect(
        await screen.findByRole("button", { name: /Hapus Kalung Nylon/ }),
      ).toBeInTheDocument();
      expect(screen.getByText(/tercatat habis/)).toBeInTheDocument();
    });
  });

  describe("with the camera", () => {
    beforeEach(() => {
      mockCamera.callback = null;
      mockCamera.stopped = false;
      // jsdom has no `mediaDevices`; a secure browser context does.
      Object.defineProperty(window.navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: jest.fn() },
      });
    });

    afterEach(() => {
      Object.defineProperty(window.navigator, "mediaDevices", {
        configurable: true,
        value: undefined,
      });
    });

    /*
      THE DECODER REPORTS A CODE ON EVERY FRAME it can see it. Two frames of one
      barcode in a row are one scan, not two bags.
    */
    it("adds what the camera reads once, and stops the camera on close", async () => {
      jest
        .spyOn(productService, "getByBarcode")
        .mockResolvedValue(SCANNED as never);
      render(<InvoiceCreateForm />);

      await userEvent.click(
        await screen.findByRole("button", { name: /scan pakai kamera/i }),
      );
      const dialog = await screen.findByRole("dialog");
      await waitFor(() => expect(mockCamera.callback).not.toBeNull());

      act(() => {
        mockCamera.callback?.({ getText: () => "8991234500123" });
        mockCamera.callback?.({ getText: () => "8991234500123" });
      });

      expect(
        await within(dialog).findByText("Kalung Nylon masuk ke faktur."),
      ).toBeInTheDocument();
      expect(productService.getByBarcode).toHaveBeenCalledTimes(1);

      await userEvent.click(
        within(dialog).getByRole("button", { name: "Selesai" }),
      );

      expect(mockCamera.stopped).toBe(true);
      expect(
        screen.getByRole("textbox", { name: /jumlah kalung nylon/i }),
      ).toHaveValue("1");
    });

    it("explains when the browser cannot open a camera", async () => {
      Object.defineProperty(window.navigator, "mediaDevices", {
        configurable: true,
        value: undefined,
      });
      render(<InvoiceCreateForm />);

      await userEvent.click(
        await screen.findByRole("button", { name: /scan pakai kamera/i }),
      );

      expect(
        await within(await screen.findByRole("dialog")).findByText(
          /lewat HTTPS/,
        ),
      ).toBeInTheDocument();
    });
  });
});

describe("adding lines through the dialog", () => {
  it("adds a product and a service in one pass", async () => {
    render(<InvoiceCreateForm />);

    await userEvent.click(
      await screen.findByRole("button", { name: /tambah barang atau jasa/i }),
    );
    const dialog = await screen.findByRole("dialog");

    await userEvent.click(
      await within(dialog).findByRole("checkbox", { name: /Kalung Nylon/ }),
    );
    await userEvent.click(within(dialog).getByRole("tab", { name: /^Jasa/ }));
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: /Grooming/ }),
    );

    // Ticks on the other tab are kept, and counted on it.
    expect(
      within(dialog).getByRole("tab", { name: "Barang (1)" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Tambahkan 2 item" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Hapus Kalung Nylon/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Hapus Grooming/ }),
    ).toBeInTheDocument();
  });

  /*
    A SECOND ROW OF ONE PRODUCT is a quantity somebody meant to type, so it is
    not offered again — as on every stock document. A SERVICE is: two cats get
    two groomings.
  */
  it("hides a product already on the bill but offers a service again", async () => {
    render(<InvoiceCreateForm />);
    await screen.findByRole("button", { name: /tambah barang atau jasa/i });

    await addItem(/Kalung Nylon/);
    await addItem(/Grooming/, "Jasa");

    await userEvent.click(
      screen.getByRole("button", { name: /tambah barang atau jasa/i }),
    );
    const dialog = await screen.findByRole("dialog");

    expect(
      await within(dialog).findByText(
        /semua produk yang cocok sudah ditambahkan/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("checkbox", { name: /Kalung Nylon/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("tab", { name: /^Jasa/ }));
    expect(
      within(dialog).getByRole("checkbox", { name: /Grooming/ }),
    ).toBeInTheDocument();
  });
});

/**
 * PCR-035 — a service line can name the animal it is for.
 *
 * WHAT THIS IS ACTUALLY FOR is not the label on the invoice. Naming the animal
 * is what lets the SERVER raise a booking for the work: a grooming billed with
 * no pet reaches no day sheet, nobody is assigned, and the only record that the
 * work is owed is a line on a bill the customer takes home.
 */
describe("the animal a service is for", () => {
  /** Header, then one SERVICE line — the shortest bill that can carry a pet. */
  async function fillService() {
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await addItem(/Grooming/, "Jasa");
  }

  it("sends the pet on the service line", async () => {
    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);
    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent().items[0]).toMatchObject({ kind: "service", petId: "pet1" });
  });

  /*
    REQUIRED, AND THE FORM SAYS SO BEFORE THE SERVER HAS TO. A grooming billed
    with no animal reaches no day sheet: nobody is assigned, and the only record
    that the work is owed is a line on a bill the customer took home. The server
    refuses it too — this is a courtesy over that refusal, not the rule itself.
  */
  it("will not issue a service line with no animal", async () => {
    render(<InvoiceCreateForm />);
    await fillService();

    expect(
      screen.getByRole("button", { name: /^simpan faktur$/i }),
    ).toBeDisabled();
    expect(screen.getByText(/belum dipilih hewannya/i)).toBeInTheDocument();
    expect(customerInvoiceService.create).not.toHaveBeenCalled();
  });

  it("unblocks once the animal is chosen", async () => {
    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    expect(
      screen.getByRole("button", { name: /^simpan faktur$/i }),
    ).toBeEnabled();
  });

  /*
    ─── A SERVICE PRICED BY THE ANIMAL, ON A FORM THAT PICKS ONE SECOND ───────

    The line snapshotted `service.price` when it was ADDED, and a variant-priced
    service has none — the axes it varies by are the pet's own facts, and the
    animal is chosen afterwards. So the row read Rp 0 and the save came back
    `items[0].unitPrice is not a valid amount`, about a field the person filling
    the form never touched. The figure has to be re-derived when the pet changes.
  */
  it("prices a variant service once the animal is chosen", async () => {
    jest.spyOn(serviceService, "list").mockResolvedValue(
      page([
        {
          _id: "s1",
          name: "Grooming",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [
            { sizeCategory: "small", price: "120000" },
            { sizeCategory: "large", price: "140000" },
          ],
        },
      ]) as never,
    );
    jest
      .spyOn(petService, "list")
      .mockResolvedValue(
        page([{ _id: "pet1", name: "Miko", size: "large" }]) as never,
      );

    render(<InvoiceCreateForm />);
    await fillService();

    /* No animal yet — a dash, not "Rp 0", which reads as free. The Pajak cell
       dashes too while there is no price to tax, so each is named by its
       column: Item, Hewan, Harga, Jumlah, Diskon, Pajak, Total. */
    const cells = within(
      await screen.findByRole("row", { name: /Grooming/ }),
    ).getAllByRole("cell");
    expect(cells[2]).toHaveTextContent("—");
    expect(cells[5]).toHaveTextContent("—");

    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    /*
      Miko is large — 140.000, not the 120.000 of the first variant. It appears
      in the row and again in the recap below, which is the point: the total is
      built from the same figure.
    */
    expect(await screen.findAllByText("Rp 140.000")).not.toHaveLength(0);
    expect(screen.queryByText("Rp 120.000")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^simpan faktur$/i }),
    ).toBeEnabled();
  });

  /*
    AND IT BLOCKS BY NAMING THE MISSING FACT, rather than letting the save come
    back with a message about `unitPrice`.
  */
  it("blocks, naming the animal's missing fact, when it cannot be priced", async () => {
    jest.spyOn(serviceService, "list").mockResolvedValue(
      page([
        {
          _id: "s1",
          name: "Grooming",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [{ sizeCategory: "small", price: "120000" }],
        },
      ]) as never,
    );
    jest
      .spyOn(petService, "list")
      .mockResolvedValue(
        page([{ _id: "pet1", name: "Miko", size: null }]) as never,
      );

    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    expect(
      screen.getByRole("button", { name: /^simpan faktur$/i }),
    ).toBeDisabled();
    /*
      THE BLOCKED SAVE'S OWN SENTENCE. "Lengkapi ukuran Miko" now appears twice —
      here and in the row's note below — so this asserts the half only this one
      carries.
    */
    expect(
      await screen.findByText(/ditentukan dari situ/i),
    ).toBeInTheDocument();
  });

  /*
    AND THE ROW SAYS IT TOO (16 September 2026, on request). The blocked Simpan
    names the missing fact at the head of the form; somebody reading the line
    sees a dash in Harga and Rp 0 in Total with nothing to explain either. The
    note sits under the animal — the field that answers it — and carries the same
    way out the booking form and the till offer.
  */
  it("says under the animal why the price is a dash, and links to that pet", async () => {
    jest.spyOn(serviceService, "list").mockResolvedValue(
      page([
        {
          _id: "s1",
          name: "Grooming",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [{ sizeCategory: "small", price: "120000" }],
        },
      ]) as never,
    );
    jest
      .spyOn(petService, "list")
      .mockResolvedValue(
        page([{ _id: "pet1", name: "Miko", size: null }]) as never,
      );

    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    const row = within(await screen.findByRole("row", { name: /Grooming/ }));

    /*
      THE LINK IS THE WHOLE NOTE: it names the animal and the missing field, and
      opens that pet in A NEW TAB so the half-built invoice survives the detour.
    */
    expect(
      row.getByRole("link", { name: /lengkapi ukuran miko/i }),
    ).toHaveAttribute("href", "/dashboard/master/pets/pet1/edit");
  });

  /*
    AND IT NOTICES WHEN THE FACT IS FILLED IN (16 September 2026, on request).
    The link opens that pet in another tab, so the answer arrives somewhere this
    form cannot see. Coming back re-reads the animals and re-prices the rows,
    without the reload that would throw the half-built invoice away.
  */
  it("prices the row on the way back from the pet's form, with no reload", async () => {
    jest.spyOn(serviceService, "list").mockResolvedValue(
      page([
        {
          _id: "s1",
          name: "Grooming",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [{ sizeCategory: "small", price: "120000" }],
        },
      ]) as never,
    );
    const pets = jest
      .spyOn(petService, "list")
      .mockResolvedValue(
        page([{ _id: "pet1", name: "Miko", size: null }]) as never,
      );

    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    expect(
      within(await screen.findByRole("row", { name: /Grooming/ })).getByRole(
        "link",
        { name: /lengkapi ukuran miko/i },
      ),
    ).toBeInTheDocument();

    /* Miko's size is filled in in the other tab, and this one comes forward. */
    pets.mockResolvedValue(
      page([{ _id: "pet1", name: "Miko", size: "small" }]) as never,
    );
    fireEvent(document, new Event("visibilitychange"));

    await waitFor(() =>
      expect(
        within(screen.getByRole("row", { name: /Grooming/ })).queryByRole(
          "link",
          { name: /lengkapi/i },
        ),
      ).not.toBeInTheDocument(),
    );

    const row = within(screen.getByRole("row", { name: /Grooming/ }));
    expect(row.getAllByText("Rp 120.000").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /^simpan faktur$/i }),
    ).toBeEnabled();
  });

  /*
    ONE ANSWER AT A TIME. A service priced by two facts names the first one
    missing; filling that in leaves the row still unpriced, and a note that
    simply disappeared would read as "done" over a dash. It names the NEXT one.
  */
  it("names the next missing fact once the first one is filled in", async () => {
    jest.spyOn(serviceService, "list").mockResolvedValue(
      page([
        {
          _id: "s1",
          name: "Grooming",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory", "furType"],
          variants: [
            { sizeCategory: "small", furType: "short", price: "120000" },
          ],
        },
      ]) as never,
    );
    const pets = jest.spyOn(petService, "list").mockResolvedValue(
      page([
        { _id: "pet1", name: "Miko", size: null, furType: null },
      ]) as never,
    );

    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    expect(
      within(await screen.findByRole("row", { name: /Grooming/ })).getByRole(
        "link",
        { name: /lengkapi ukuran miko/i },
      ),
    ).toBeInTheDocument();

    /* The size is answered; the coat is not. */
    pets.mockResolvedValue(
      page([
        { _id: "pet1", name: "Miko", size: "small", furType: null },
      ]) as never,
    );
    fireEvent(document, new Event("visibilitychange"));

    await waitFor(() =>
      expect(
        within(screen.getByRole("row", { name: /Grooming/ })).getByRole("link", {
          name: /lengkapi jenis bulu miko/i,
        }),
      ).toBeInTheDocument(),
    );
  });

  /*
    A SWITCHED-OFF VARIANT HAS A PRICE, so it never read as unpriced — and the
    save went out to be refused (13 September 2026). It blocks in its own words.
  */
  it("blocks a switched-off variant with its own sentence, not as unpriced", async () => {
    jest.spyOn(serviceService, "list").mockResolvedValue(
      page([
        {
          _id: "s1",
          name: "Grooming",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [
            {
              sizeCategory: "large",
              price: "140000",
              durationMin: 90,
              isActive: false,
            },
          ],
        },
      ]) as never,
    );
    jest
      .spyOn(petService, "list")
      .mockResolvedValue(
        page([{ _id: "pet1", name: "Miko", size: "large" }]) as never,
      );

    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    expect(
      screen.getByRole("button", { name: /^simpan faktur$/i }),
    ).toBeDisabled();
    expect(
      await screen.findByText(/varian grooming untuk miko sedang nonaktif/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Varian nonaktif")).toBeInTheDocument();
    expect(screen.queryByText(/belum punya harga/i)).not.toBeInTheDocument();
  });

  /*
    A DIFFERENT JOB, SAID DIFFERENTLY. "Ada baris jasa yang belum dipilih
    hewannya" in front of an empty dropdown is an instruction nobody can follow —
    the pet has to be registered first, which is a different screen.
  */
  it("says to register a pet when the customer has none", async () => {
    jest.spyOn(petService, "list").mockResolvedValue(page([]) as never);

    render(<InvoiceCreateForm />);
    await fillService();

    expect(await screen.findByText(/belum punya hewan/i)).toBeInTheDocument();
  });

  /*
    THE RULE IS ABOUT SERVICES ONLY. A bill for goods must not be held up by a
    field it does not have — the server refuses a pet on a product line anyway.
  */
  it("does not block an invoice of only products", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();

    expect(
      screen.getByRole("button", { name: /^simpan faktur$/i }),
    ).toBeEnabled();
  });

  it("asks only for that customer's animals", async () => {
    render(<InvoiceCreateForm />);
    await fillService();

    await waitFor(() => expect(petService.list).toHaveBeenCalled());
    expect(petService.list).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "c1" }),
    );
  });

  /*
    NO COLUMN AT ALL on a bill for goods. A column of dashes on an invoice for
    two bags of food is a question the reader never asked — and a product line
    cannot carry a pet anyway: the server refuses one, because a collar has no
    grooming.
  */
  it("shows no animal column on an invoice of only products", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();

    expect(
      screen.queryByRole("columnheader", { name: /^Hewan$/i }),
    ).not.toBeInTheDocument();
  });

  /*
    THE CHECK booking.service.js CALLS THE ONE THAT MATTERS MOST, met here before
    the server has to. A pet picked under the previous customer would raise a
    booking against somebody else's animal — refused, but only after the whole
    form was filled in.
  */
  it("drops the animal when the customer changes", async () => {
    jest.spyOn(customerService, "list").mockResolvedValue(
      page([
        { _id: "c1", name: "Bu Sari" },
        { _id: "c2", name: "Pak Budi" },
      ]) as never,
    );

    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    await pick(/^Pelanggan$/i, /Pak Budi/);

    /*
      AND THE FORM IS BLOCKED AGAIN, which is the half that matters. Clearing the
      field on its own would just move the problem: a service line silently
      reverting to "no animal" and issuing anyway is the exact case the required
      rule exists to stop.
    */
    expect(
      screen.getByRole("button", { name: /^simpan faktur$/i }),
    ).toBeDisabled();
    expect(screen.getByText(/belum dipilih hewannya/i)).toBeInTheDocument();
  });

  /*
    AND ONLY WHEN IT ACTUALLY CHANGES. Re-picking the same customer must not
    throw the choice away — the handler returns early, and this is what keeps
    that early return from being deleted as redundant.
  */
  it("keeps the animal when the same customer is re-picked", async () => {
    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent().items[0].petId).toBe("pet1");
  });
});

/*
  ADD-ONS (14 September 2026). A main service's row offers its add-ons once the
  animal is chosen; a tick puts the add-on on the bill directly under the row, on
  the same animal and priced for it. Nothing is sent as a parent — the server
  files the add-on under its service from the catalogue.
*/
describe("add-ons under a service", () => {
  const MAIN = {
    _id: "s1",
    name: "Grooming",
    price: "150000",
    serviceType: "main",
    addonServiceIds: ["a1", "a2"],
  };
  const PARFUM = {
    _id: "a1",
    name: "Parfum",
    price: "25000",
    serviceType: "addon",
    addonServiceIds: [],
  };
  /* Priced for a LARGE animal only — Miko is small. */
  const SISIR = {
    _id: "a2",
    name: "Sisir Bulu",
    price: null,
    hasVariants: true,
    variantAxes: ["sizeCategory"],
    variants: [{ sizeCategory: "large", price: "40000" }],
    serviceType: "addon",
    addonServiceIds: [],
  };

  beforeEach(() => {
    jest
      .spyOn(serviceService, "list")
      .mockResolvedValue(page([PARFUM, MAIN, SISIR]) as never);
    jest.spyOn(petService, "list").mockResolvedValue(
      page([
        { _id: "pet1", name: "Miko", size: "small" },
        { _id: "pet2", name: "Coco", size: "large" },
      ]) as never,
    );
  });

  async function fillService() {
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await addItem(/^Grooming/, "Jasa");
  }

  /** Opens the add-on dialog on the Grooming row and returns it. */
  async function openAddons() {
    await userEvent.click(
      screen.getByRole("button", { name: /^Add-on untuk Grooming/ }),
    );
    return screen.findByRole("dialog");
  }

  async function tick(addon: RegExp) {
    const dialog = await openAddons();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: addon }));
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Simpan add-on" }),
    );
  }

  it("lists add-ons after the main services in the dialog, labelled", async () => {
    render(<InvoiceCreateForm />);
    await userEvent.click(
      await screen.findByRole("button", { name: /tambah barang atau jasa/i }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("tab", { name: /^Jasa/ }));

    expect(
      within(dialog)
        .getAllByRole("checkbox")
        .map((box) => box.getAttribute("id")),
    ).toEqual(["pick-service-s1", "pick-service-a1", "pick-service-a2"]);
    expect(within(dialog).getAllByText("Add-on")).toHaveLength(2);
  });

  it("offers the add-ons only once the animal is chosen", async () => {
    render(<InvoiceCreateForm />);
    await fillService();

    expect(
      screen.getByRole("button", { name: /^Add-on untuk Grooming/ }),
    ).toBeDisabled();
    expect(screen.getByText("Pilih hewan dulu")).toBeInTheDocument();

    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    expect(
      screen.getByRole("button", { name: /^Add-on untuk Grooming/ }),
    ).toBeEnabled();
  });

  it("puts a ticked add-on under its service, on its animal, and sends no parent", async () => {
    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    const dialog = await openAddons();
    /* Nobody can price the comb-out for Miko, so it cannot be ticked. */
    expect(
      within(dialog).getByRole("checkbox", { name: /Sisir Bulu/ }),
    ).toBeDisabled();
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: /Parfum/ }),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Simpan add-on" }),
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const rows = screen.getAllByRole("row").map((row) => row.textContent ?? "");
    const groomingAt = rows.findIndex((text) => text.startsWith("Grooming"));
    expect(rows[groomingAt + 1]).toContain("Parfum");
    expect(
      within(screen.getByRole("row", { name: /Parfum/ })).getByText("Miko"),
    ).toBeInTheDocument();

    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent().items).toEqual([
      { kind: "service", refId: "s1", qty: "1", discount: null, petId: "pet1" },
      { kind: "service", refId: "a1", qty: "1", discount: null, petId: "pet1" },
    ]);
  });

  it("moves an add-on to its service's new animal, re-priced", async () => {
    jest.spyOn(serviceService, "list").mockResolvedValue(
      page([
        MAIN,
        {
          ...SISIR,
          variants: [
            { sizeCategory: "small", price: "30000" },
            { sizeCategory: "large", price: "40000" },
          ],
        },
      ]) as never,
    );

    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);
    await tick(/Sisir Bulu/);

    expect(
      within(screen.getByRole("row", { name: /Sisir Bulu/ })).getAllByText(
        "Rp 30.000",
      ),
    ).not.toHaveLength(0);

    await pick(/^Hewan untuk Grooming$/i, /Coco/);

    const row = screen.getByRole("row", { name: /Sisir Bulu/ });
    expect(within(row).getByText("Coco")).toBeInTheDocument();
    expect(within(row).getAllByText("Rp 40.000")).not.toHaveLength(0);
  });

  /* A DRAFT UNTIL SAVED — Batal leaves the bill exactly as it was. */
  it("puts nothing on the bill when the dialog is cancelled", async () => {
    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);

    const dialog = await openAddons();
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: /Parfum/ }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Batal" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("row", { name: /Parfum/ }),
    ).not.toBeInTheDocument();
  });

  it("reopens with what the bill carries, and takes off what is unticked", async () => {
    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);
    await tick(/Parfum/);

    const dialog = await openAddons();
    const parfum = within(dialog).getByRole("checkbox", { name: /Parfum/ });
    expect(parfum).toBeChecked();

    await userEvent.click(parfum);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Simpan add-on" }),
    );

    expect(
      screen.queryByRole("row", { name: /Parfum/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add-on untuk Grooming" }),
    ).toBeInTheDocument();
  });

  it("takes its add-ons off with the service", async () => {
    render(<InvoiceCreateForm />);
    await fillService();
    await pick(/^Hewan untuk Grooming$/i, /Miko/);
    await tick(/Parfum/);

    await userEvent.click(
      screen.getByRole("button", { name: /^Hapus Grooming$/ }),
    );

    expect(
      screen.queryByRole("row", { name: /Parfum/ }),
    ).not.toBeInTheDocument();
  });
});

/*
  OTHER CHARGES (14 September 2026) — ongkir and the like, under Diskon faktur as
  at the till. Typed straight into a row with nothing to confirm: it counts
  toward the total as it is typed, and is sent itemised.
*/
describe("other charges", () => {
  const addRow = () =>
    userEvent.click(screen.getByRole("button", { name: "+ Tambah biaya lain" }));

  const totalShows = (amount: string) =>
    expect(
      within(screen.getByText(/^Total tagihan$/i).closest("div")!).getByText(
        amount,
      ),
    ).toBeInTheDocument();

  it("counts a charge toward the total as it is typed, and sends it", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await addRow();
    await userEvent.type(screen.getByLabelText("Nama biaya 1"), "Ongkos kirim");
    await userEvent.type(screen.getByLabelText("Nominal biaya 1"), "20000");

    // 100.000 on a price that already includes tax, + 20.000 ongkir.
    totalShows("Rp 120.000");

    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent().otherCharges).toEqual([
      { label: "Ongkos kirim", amount: "20000" },
    ]);
  });

  it("adds the next charge straight away, with nothing to confirm", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await addRow();
    await userEvent.type(screen.getByLabelText("Nama biaya 1"), "Ongkos kirim");
    await userEvent.type(screen.getByLabelText("Nominal biaya 1"), "20000");
    await addRow();
    await userEvent.type(screen.getByLabelText("Nama biaya 2"), "Packaging");
    await userEvent.type(screen.getByLabelText("Nominal biaya 2"), "5000");

    totalShows("Rp 125.000");
  });

  /* In Indonesian "10.000" is ten thousand — a dot must not make it ten. */
  it("keeps the amount to digits", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await addRow();
    await userEvent.type(screen.getByLabelText("Nominal biaya 1"), "10.000");

    expect(screen.getByLabelText("Nominal biaya 1")).toHaveValue("10000");
  });

  it("will not save a charge with an amount but no name", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await addRow();
    await userEvent.type(screen.getByLabelText("Nominal biaya 1"), "20000");

    expect(
      screen.getByRole("button", { name: /^simpan faktur$/i }),
    ).toBeDisabled();
    expect(screen.getByText(/Beri nama biaya lain/)).toBeInTheDocument();
  });

  it("ignores a row left blank, and takes a row back off", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await addRow();
    await addRow();
    await userEvent.type(screen.getByLabelText("Nama biaya 2"), "Ongkos kirim");
    await userEvent.type(screen.getByLabelText("Nominal biaya 2"), "20000");

    await userEvent.click(
      screen.getByRole("button", { name: "Hapus biaya lain 2" }),
    );
    totalShows("Rp 100.000");
    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent()).not.toHaveProperty("otherCharges");
  });
});

/*
  STOCK UNDER A PRODUCT LINE'S SKU (14 September 2026) — at the warehouse the
  header chose. That is the `productstocks` row the save is refused against: one
  per product per warehouse, already the sum of the product's batches there.
*/
describe("stock under a product line", () => {
  const productRow = () => screen.getByRole("row", { name: /Kalung Nylon/ });

  it("shows what the chosen warehouse holds", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();

    expect(await within(productRow()).findByText("Stok 10")).toBeInTheDocument();
    expect(productService.getById).toHaveBeenCalledWith("p1");
  });

  it("asks for a warehouse before it can say", async () => {
    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await addItem(/Kalung Nylon/);

    expect(
      within(productRow()).getByText("Pilih gudang untuk melihat stok"),
    ).toBeInTheDocument();
  });

  it("says when the line wants more than the warehouse holds", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await userEvent.clear(screen.getByLabelText(/^Jumlah Kalung Nylon$/i));
    await userEvent.type(screen.getByLabelText(/^Jumlah Kalung Nylon$/i), "12");

    expect(
      await within(productRow()).findByText("Stok 10 — kurang"),
    ).toBeInTheDocument();
  });

  it("follows the warehouse without asking again — none held at another", async () => {
    mockLookups({ warehouses: [WAREHOUSE, CENTRAL] });

    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await pick(/^Gudang$/i, /^Gudang Pusat$/);
    await addItem(/Kalung Nylon/);
    expect(await within(productRow()).findByText("Stok 10")).toBeInTheDocument();

    await pick(/^Gudang$/i, /Gudang Pusat Bersama/);

    expect(within(productRow()).getByText("Stok 0")).toBeInTheDocument();
    expect(productService.getById).toHaveBeenCalledTimes(1);
  });
});

describe("what the form sends", () => {
  it("sends the line, and no price with it", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent().items).toEqual([
      { kind: "product", refId: "p1", qty: "1", discount: null },
    ]);
    // A price a client can set is a discount nobody approved.
    expect(sent().items[0]).not.toHaveProperty("unitPrice");
    expect(sent().items[0]).not.toHaveProperty("name");
  });

  it("goes to the new invoice and toasts its number", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await submit();

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/sales/inv1"),
    );
  });

  it("sends a line discount as typed, not as resolved", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await userEvent.type(screen.getByLabelText(/^Diskon Kalung Nylon$/i), "10");
    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent().items[0].discount).toEqual({ mode: "percent", value: "10" });
    expect(sent().items[0].discount).not.toHaveProperty("resolvedAmount");
  });

  /*
    A GROOMING BILL SHIPS NOTHING, so no warehouse is sent — and none is
    demanded. Sending one would claim goods left a shelf that nothing came off.
  */
  /*
    `manual` IS THE DEFAULT, and it is the PRD's word: every invoice raised on
    this form was typed by somebody. `marketplace` is for orders that sync in
    once that module exists.
  */
  /*
    BOOKINGS GO AS IDS, never as lines. The server reads each booking's own
    frozen prices, its animal and its groomer — a client that could send those
    could bill a grooming at a price nobody quoted, against somebody else's pet.
  */
  it("sends chosen bookings as ids", async () => {
    jest.spyOn(bookingService, "bridge").mockResolvedValue([
      {
        _id: "bk1",
        bookingNumber: "BK-260828-001",
        petName: "Miko",
        service: {
          serviceId: "svc1",
          name: "Grooming",
          price: "150000",
          addons: [],
        },
        groomerName: "Rina",
      },
    ] as never);

    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await userEvent.click(await screen.findByRole("checkbox"));
    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent().bookingIds).toEqual(["bk1"]);
    // No prices, no names, no pet ids — only which bookings.
    expect(sent().items).toEqual([]);
  });

  it("leaves bookingIds out entirely when none was chosen", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent()).not.toHaveProperty("bookingIds");
  });

  it("sends the channel, defaulting to manual", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent().channel).toBe("manual");
  });

  it("omits the warehouse when nothing is a product", async () => {
    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await addItem(/Grooming/, "Jasa");
    // A service names its animal (PCR-035), or the form will not submit at all.
    await pick(/^Hewan untuk Grooming$/i, /Miko/);
    await submit();

    await waitFor(() =>
      expect(customerInvoiceService.create).toHaveBeenCalled(),
    );
    expect(sent()).not.toHaveProperty("warehouseId");
  });
});

describe("what the form shows", () => {
  it("shows the catalogue price, read-only", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();

    // Two of them at qty 1 — the unit price and the line total. Nudged to 2 so
    // the two columns carry DIFFERENT figures and each can be asserted for what
    // it is, rather than passing on whichever happened to match.
    await userEvent.clear(screen.getByLabelText(/^Jumlah Kalung Nylon$/i));
    await userEvent.type(screen.getByLabelText(/^Jumlah Kalung Nylon$/i), "2");

    const row = screen.getByRole("row", { name: /Kalung Nylon/ });
    expect(within(row).getByText("Rp 100.000")).toBeInTheDocument();
    expect(within(row).getByText("Rp 200.000")).toBeInTheDocument();
    // The price is TEXT, never an input: a price a client can set is a discount
    // nobody approved.
    expect(within(row).queryByLabelText(/harga/i)).not.toBeInTheDocument();
  });

  it("adds up the total as lines are added", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await userEvent.clear(screen.getByLabelText(/^Jumlah Kalung Nylon$/i));
    await userEvent.type(screen.getByLabelText(/^Jumlah Kalung Nylon$/i), "3");

    const recap = screen.getByText(/^Total tagihan$/i).closest("div")!;
    expect(within(recap).getByText("Rp 300.000")).toBeInTheDocument();
  });

  /*
    THE INVOICE DISCOUNT IS MEASURED AFTER THE LINE ONES, which changes the
    answer — and the screen has to agree with the server about which.
  */
  it("measures the invoice discount against what the line discounts left", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();
    await userEvent.type(screen.getByLabelText(/^Diskon Kalung Nylon$/i), "10");
    await userEvent.type(screen.getByLabelText(/^Diskon faktur$/i), "10");

    // 100.000 − 10% = 90.000; then 10% of 90.000 = 9.000; total 81.000.
    const recap = screen.getByText(/^Total tagihan$/i).closest("div")!;
    expect(within(recap).getByText("Rp 81.000")).toBeInTheDocument();
  });

  /*
    THE RECAP COUNTS BOOKINGS. They are SENT as ids, but the server prices them
    identically to typed lines — so leaving them out of the preview left the
    recap reading Rp 0 with two groomings ticked, and would have understated
    every invoice discount that touched them.
  */
  it("adds pulled bookings into the recap, add-ons included", async () => {
    jest.spyOn(bookingService, "bridge").mockResolvedValue([
      {
        _id: "bk1",
        bookingNumber: "BK-260828-001",
        petName: "Cici",
        service: {
          serviceId: "svc1",
          name: "Grooming",
          price: "120000.0000",
          addons: [],
        },
        groomerName: "Rina",
      },
      {
        _id: "bk2",
        bookingNumber: "BK-260828-002",
        petName: "Cilang",
        service: {
          serviceId: "svc1",
          name: "Grooming",
          price: "120000.0000",
          // Billed as a line of its own, so it has to reach the total too.
          addons: [
            {
              itemId: "ad1",
              serviceId: "svc9",
              name: "Potong kuku",
              price: "20000.0000",
            },
          ],
        },
        groomerName: "Rina",
      },
    ] as never);

    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);

    // A chosen booking leaves the panel, so the next one is always first.
    await userEvent.click((await screen.findAllByRole("checkbox"))[0]);
    await userEvent.click(await screen.findByRole("checkbox"));

    // Scoped to the Total row: with no discount the subtotal carries the same
    // figure, and a list-wide query would pass on whichever rendered first.
    const totalRow = screen.getByText(/^Total tagihan$/i).closest("div")!;
    expect(within(totalRow).getByText("Rp 260.000")).toBeInTheDocument();
  });

  /*
    A CHOSEN BOOKING MOVES INTO BARIS FAKTUR (17 September 2026): off the panel,
    onto the rows the total adds up — and back to the panel when removed.
  */
  it("moves a chosen booking into the rows, and back when removed", async () => {
    jest.spyOn(bookingService, "bridge").mockResolvedValue([
      {
        _id: "bk1",
        bookingNumber: "BK-260828-001",
        petName: "Cici",
        service: {
          serviceId: "svc1",
          name: "Grooming",
          price: "120000.0000",
          addons: [
            {
              itemId: "ad1",
              serviceId: "svc9",
              name: "Potong kuku",
              price: "20000.0000",
            },
          ],
        },
        groomerName: "Rina",
      },
    ] as never);

    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await userEvent.click(await screen.findByRole("checkbox"));

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const row = screen.getByRole("row", { name: /Booking BK-260828-001/ });
    expect(within(row).getByText("Cici")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Potong kuku/ })).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /Hapus booking BK-260828-001/ }),
    );

    expect(
      screen.queryByRole("row", { name: /Booking BK-260828-001/ }),
    ).not.toBeInTheDocument();
    expect(await screen.findByRole("checkbox")).toBeInTheDocument();
  });

  /*
    THE DISCOUNTS SPLIT AS THE BOOKING CARD SPLITS THEM: each line's own under
    Diskon, and the booking's share of "Diskon seluruh booking" once, on a
    "Diskon booking" row after its last line.
  */
  it("splits a pulled booking's discounts the way the card does", async () => {
    jest.spyOn(bookingService, "bridge").mockResolvedValue([
      {
        _id: "bk1",
        bookingNumber: "BK-260828-001",
        petName: "Mochi",
        service: {
          serviceId: "svc1",
          name: "Basic Grooming",
          price: "120000.0000",
          discount: { mode: "amount", value: "5000.0000", resolvedAmount: "5000.0000" },
          discountAmount: "9356.0000",
          addons: [
            {
              itemId: "ad1",
              serviceId: "svc9",
              name: "Extra Handling",
              price: "20000.0000",
              discount: { mode: "amount", value: "3000.0000", resolvedAmount: "3000.0000" },
              discountAmount: "3644.0000",
            },
          ],
        },
        groomerName: "Rina",
      },
    ] as never);

    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await userEvent.click(await screen.findByRole("checkbox"));

    const main = screen.getByRole("row", { name: /Booking BK-260828-001/ });
    expect(within(main).getByText("−Rp 5.000")).toBeInTheDocument();
    const addon = screen.getByRole("row", { name: /Extra Handling/ });
    expect(within(addon).getByText("−Rp 3.000")).toBeInTheDocument();
    const share = screen.getByRole("row", { name: /^Diskon booking/ });
    expect(within(share).getByText("−Rp 5.000")).toBeInTheDocument();
  });

  /*
    AND THE INVOICE DISCOUNT REACHES THEM. A discount that applied only to typed
    lines would show one number on screen and bill another.
  */
  it("discounts booking lines like any other", async () => {
    jest.spyOn(bookingService, "bridge").mockResolvedValue([
      {
        _id: "bk1",
        bookingNumber: "BK-260828-001",
        petName: "Cici",
        service: {
          serviceId: "svc1",
          name: "Grooming",
          price: "100000.0000",
          addons: [],
        },
        groomerName: "Rina",
      },
    ] as never);

    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.type(screen.getByLabelText(/^Diskon faktur$/i), "10");

    const totalRow = screen.getByText(/^Total tagihan$/i).closest("div")!;
    expect(within(totalRow).getByText("Rp 90.000")).toBeInTheDocument();
  });

  /* The note under the recap says what saving does (14 September 2026). */
  it("says the invoice saves as Belum Lunas, editable until the first payment", async () => {
    render(<InvoiceCreateForm />);
    expect(
      await screen.findByText(/tersimpan berstatus Belum Lunas/i),
    ).toBeInTheDocument();
  });

  /*
    THE RECAP HAS TO ADD UP. It ran Subtotal Rp 100.000 → Total Rp 111.000 with
    nothing between them, and the only clue where the difference came from was a
    sentence underneath — a caption is not an explanation of an arithmetic
    somebody is checking line by line.
  */
  it("shows the tax as its own row when it is added on top", async () => {
    jest.spyOn(tenantService, "me").mockResolvedValue({
      settings: { taxRate: 11, priceIncludesTax: false },
    } as never);

    render(<InvoiceCreateForm />);
    await fillMinimal();

    // `dl`, not `div`: "Total tagihan" sits in its own flex row, so the row is
    // the wrong scope for a sibling line.
    const recap = screen.getByText(/^Total tagihan$/i).closest("dl")!;
    expect(within(recap).getByText("PPN 11%")).toBeInTheDocument();
    expect(within(recap).getByText("Rp 11.000")).toBeInTheDocument();
    // 100.000 + 11.000, and the two visible rows account for the whole of it.
    expect(within(recap).getByText("Rp 111.000")).toBeInTheDocument();
  });

  /*
    NO ROW WHERE PRICES ALREADY INCLUDE THE TAX. There IS tax on such an invoice
    — it is simply inside the subtotal already — so a row reading "PPN Rp 0"
    would deny a tax that was charged.
  */
  /*
    A PPN ROW STANDS ON ITS BASE (14 September 2026, the BO mockup): Dasar
    pengenaan pajak directly above it, after both discounts, so the tax can be
    checked against what it was charged on.
  */
  it("shows the base the added tax was charged on, after the discounts", async () => {
    jest.spyOn(tenantService, "me").mockResolvedValue({
      settings: { taxRate: 11, priceIncludesTax: false },
    } as never);

    render(<InvoiceCreateForm />);
    await fillMinimal();
    await userEvent.type(screen.getByLabelText(/^Diskon Kalung Nylon$/i), "10");

    const recap = screen.getByText(/^Total tagihan$/i).closest("dl")!;
    // 100.000 − 10% = 90.000 taxed; 11% of it is 9.900.
    const base = within(recap)
      .getByText("Dasar pengenaan pajak")
      .closest("div")!;
    expect(within(base).getByText("Rp 90.000")).toBeInTheDocument();
    expect(within(recap).getByText("Rp 9.900")).toBeInTheDocument();
    expect(within(recap).getByText("Rp 99.900")).toBeInTheDocument();
  });

  it("shows no tax row when the price already includes it", async () => {
    render(<InvoiceCreateForm />);
    await fillMinimal();

    const recap = screen.getByText(/^Total tagihan$/i).closest("dl")!;
    expect(within(recap).queryByText(/^PPN/)).not.toBeInTheDocument();
    expect(
      within(recap).queryByText("Dasar pengenaan pajak"),
    ).not.toBeInTheDocument();
  });
});

describe("what the form refuses to submit", () => {
  /**
   * ONE REASON AT A TIME, and the FIRST unanswered question — somebody filling a
   * form top to bottom wants to know what to do next, not an inventory of
   * everything they have not reached.
   *
   * Asserted through "Belum bisa disimpan", not by searching the page for the
   * sentence: "Pilih pelanggan" is also the picker's own placeholder, and a bare
   * text query would pass on the placeholder while the bar said nothing.
   */
  it("names the first missing answer, and no more", async () => {
    render(<InvoiceCreateForm />);
    await screen.findByRole("button", { name: /^simpan faktur$/i });

    expect(
      screen.getByRole("button", { name: /^simpan faktur$/i }),
    ).toBeDisabled();
    expect(screen.getByText(/belum bisa disimpan/i)).toHaveTextContent(
      /pilih pelanggan dulu/i,
    );
    // Not also complaining about the branch and the lines it has not reached.
    expect(screen.getByText(/belum bisa disimpan/i)).not.toHaveTextContent(
      /cabang/i,
    );
  });

  /*
    A BOOKING IS A LINE. An invoice may be nothing but pulled groomings, and
    demanding a typed item as well would make the panel useless for the case it
    exists to serve.
  */
  it("lets a booking alone satisfy the form", async () => {
    jest.spyOn(bookingService, "bridge").mockResolvedValue([
      {
        _id: "bk1",
        bookingNumber: "BK-260828-001",
        petName: "Miko",
        service: {
          serviceId: "svc1",
          name: "Grooming",
          price: "150000",
          addons: [],
        },
        groomerName: "Rina",
      },
    ] as never);

    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await userEvent.click(await screen.findByRole("checkbox"));

    expect(
      screen.getByRole("button", { name: /^simpan faktur$/i }),
    ).toBeEnabled();
  });

  it("asks for a warehouse once a product line exists", async () => {
    render(<InvoiceCreateForm />);
    await pick(/^Pelanggan$/i, /Bu Sari/);
    await pick(/^Cabang$/i, /Cabang Pusat/);
    await addItem(/Kalung Nylon/);

    expect(screen.getByText(/belum bisa disimpan/i)).toHaveTextContent(
      /pilih gudang/i,
    );
    expect(
      screen.getByRole("button", { name: /^simpan faktur$/i }),
    ).toBeDisabled();
  });
});

describe("the warehouse list", () => {
  /*
    A CENTRAL WAREHOUSE BELONGS TO NOBODY AND SERVES EVERYONE — the one shape a
    same-value filter would have wrongly excluded, and the same rule the server
    enforces when it pairs a branch with a shelf.
  */
  it("offers this branch's warehouses and the central ones, not another branch's", async () => {
    mockLookups({ warehouses: [WAREHOUSE, CENTRAL, OTHER] });
    render(<InvoiceCreateForm />);

    await pick(/^Cabang$/i, /Cabang Pusat/);
    await userEvent.click(screen.getByRole("button", { name: /^Gudang$/i }));

    expect(
      await screen.findByRole("option", { name: /Gudang Pusat$/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Bersama/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Cabang Lain/ }),
    ).not.toBeInTheDocument();
  });
});

describe("when the server refuses", () => {
  /*
    A TOAST, NOT AN INLINE ALERT — a deliberate departure from ui-rules §9. This
    form is long: the refusals that matter here arrive while the cursor is in a
    table halfway down the page, where an alert pinned to the top is a message
    nobody sees.
  */
  it("toasts the reason, and keeps the form", async () => {
    jest
      .spyOn(customerInvoiceService, "create")
      .mockRejectedValue(
        new ApiError("Branch 'Cabang Pusat' has no code yet", 400),
      );

    render(<InvoiceCreateForm />);
    await fillMinimal();
    await submit();

    await waitFor(() => expect(Swal.fire).toHaveBeenCalled());
    const options = (Swal.fire as jest.Mock).mock.calls.at(-1)?.[0];
    expect(options).toMatchObject({
      icon: "error",
      title: "Branch 'Cabang Pusat' has no code yet",
      // 8s rather than 3: every refusal here carries an instruction.
      timer: 8000,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("unlocks the button so the form can be corrected and resubmitted", async () => {
    // The form stays mounted after a refusal, so a button locked forever is
    // worse than the error that locked it.
    jest
      .spyOn(customerInvoiceService, "create")
      .mockRejectedValue(new ApiError("Not enough stock", 400));

    render(<InvoiceCreateForm />);
    await fillMinimal();
    await submit();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^simpan faktur$/i }),
      ).toBeEnabled(),
    );
  });
});
