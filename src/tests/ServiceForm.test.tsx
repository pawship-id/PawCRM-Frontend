import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ServiceForm } from "@/features/services";
import { serviceService } from "@/services/service.service";
import { businessLineService } from "@/services/businessLine.service";
import { ApiError } from "@/services/api-error";
import type { Service } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/service.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockedServiceService = serviceService as jest.Mocked<
  typeof serviceService
>;
const mockedBusinessLineService = businessLineService as jest.Mocked<
  typeof businessLineService
>;

const LINE_ID = "5a7f1f77bcf86cd799439077";
const SERVICE_ID = "5a7f1f77bcf86cd799439099";

const serviceFixture: Service = {
  _id: SERVICE_ID,
  tenantId: "507f1f77bcf86cd799439011",
  name: "Grooming Full Service",
  code: "GRM-FULL",
  businessLineId: LINE_ID,
  categoryId: null,
  price: "150000.0000",
  durationMin: 90,
  description: null,
  taxExempt: false,
  isActive: true,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedBusinessLineService.list.mockResolvedValue({
    items: [
      {
        _id: LINE_ID,
        tenantId: "507f1f77bcf86cd799439011",
        name: "Grooming",
        color: "#1E3A6B",
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

/** Renders create mode and waits for the business-line fetch to settle. */
async function renderNew() {
  renderWithAuth(<ServiceForm />);
  await waitFor(() =>
    expect(mockedBusinessLineService.list).toHaveBeenCalled(),
  );
}

describe("ServiceForm — creating", () => {
  it("refuses to submit without a name, a line and a price", async () => {
    await renderNew();

    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/nama layanan wajib diisi/i)).toBeVisible();
    expect(screen.getByText(/pilih lini bisnisnya dulu/i)).toBeVisible();
    expect(screen.getByText(/harga wajib diisi/i)).toBeVisible();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });

  it("sends the price as a STRING, exactly as typed", async () => {
    // The string form is what keeps a price exact all the way to the ledger — a
    // Number(price) anywhere in the chain reintroduces the float this avoids.
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Grooming");
    await userEvent.click(
      screen.getByRole("button", { name: /pilih lini bisnis/i }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Grooming" }));
    await userEvent.type(screen.getByLabelText(/^harga/i), "199999");
    await userEvent.type(screen.getByLabelText(/durasi/i), "90");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() =>
      expect(mockedServiceService.create).toHaveBeenCalledWith(
        expect.objectContaining({ price: "199999" }),
      ),
    );
    const [payload] = mockedServiceService.create.mock.calls[0];
    expect(typeof payload.price).toBe("string");
  });

  it("refuses a thousands separator — 150.000 means 150 rupiah to a parser", async () => {
    /*
      THE ONE THAT MATTERS. In Indonesian, `.` is the thousands separator, so
      somebody typing "150.000" means a hundred and fifty thousand. Read as a
      decimal it is 150 rupiah — and it would be stored silently, with the form
      showing exactly what they typed. The box takes digits only.
    */
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Grooming");
    await userEvent.type(screen.getByLabelText(/^harga/i), "150.000");
    await userEvent.type(screen.getByLabelText(/durasi/i), "90");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/tanpa titik atau koma/i)).toBeVisible();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });

  it("refuses a comma separator for the same reason", async () => {
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Grooming");
    await userEvent.type(screen.getByLabelText(/^harga/i), "150,000");
    await userEvent.type(screen.getByLabelText(/durasi/i), "90");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/tanpa titik atau koma/i)).toBeVisible();
  });

  it("refuses a negative price", async () => {
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Grooming");
    await userEvent.type(screen.getByLabelText(/^harga/i), "-1");
    await userEvent.type(screen.getByLabelText(/durasi/i), "90");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/tanpa titik atau koma/i)).toBeVisible();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });

  it("accepts a price of zero — a free service is a real thing", async () => {
    mockedServiceService.create.mockResolvedValue(serviceFixture);
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Potong kuku");
    await userEvent.click(
      screen.getByRole("button", { name: /pilih lini bisnis/i }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Grooming" }));
    await userEvent.type(screen.getByLabelText(/^harga/i), "0");
    await userEvent.type(screen.getByLabelText(/durasi/i), "90");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    await waitFor(() =>
      expect(mockedServiceService.create).toHaveBeenCalledWith(
        expect.objectContaining({ price: "0" }),
      ),
    );
  });

  it("refuses a duration longer than a day, saying what to do instead", async () => {
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Penitipan");
    await userEvent.type(screen.getByLabelText(/^harga/i), "90000");
    await userEvent.type(screen.getByLabelText(/durasi/i), "90");
    await userEvent.type(screen.getByLabelText(/durasi/i), "1441");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(await screen.findByText(/per malam/i)).toBeVisible();
  });

  it("binds a duplicate-code 409 to the code field, not to a banner", async () => {
    mockedServiceService.create.mockRejectedValue(
      new ApiError("Code 'GRM-FULL' already exists", 409),
    );
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Grooming");
    await userEvent.type(screen.getByLabelText(/^kode/i), "grm-full");
    await userEvent.click(
      screen.getByRole("button", { name: /pilih lini bisnis/i }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Grooming" }));
    await userEvent.type(screen.getByLabelText(/^harga/i), "150000");
    await userEvent.type(screen.getByLabelText(/durasi/i), "90");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    expect(
      await screen.findByText(/sudah dipakai layanan lain/i),
    ).toBeVisible();
  });

  it("does not offer the availability switch when creating", async () => {
    // A service is created because it will be sold; "make this and retire it
    // immediately" answers a question nobody asked.
    await renderNew();

    expect(
      screen.queryByLabelText(/masih ditawarkan/i),
    ).not.toBeInTheDocument();
  });
});

describe("ServiceForm — editing", () => {
  beforeEach(() => {
    mockedServiceService.getById.mockResolvedValue(serviceFixture);
    mockedServiceService.update.mockResolvedValue(serviceFixture);
  });

  it("trims the stored four decimals out of the price box", async () => {
    // "150000.0000" is how the ledger stores it and noise for whoever is reading
    // the form.
    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    expect(await screen.findByDisplayValue("150000")).toBeVisible();
  });

  it("loads the rest of the service into the fields", async () => {
    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    expect(
      await screen.findByDisplayValue("Grooming Full Service"),
    ).toBeVisible();
    expect(screen.getByDisplayValue("GRM-FULL")).toBeVisible();
    expect(screen.getByDisplayValue("90")).toBeVisible();
  });

  it("offers the availability switch when editing", async () => {
    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    expect(await screen.findByLabelText(/masih ditawarkan/i)).toBeVisible();
  });

  it("saves and returns to the list", async () => {
    renderWithAuth(<ServiceForm serviceId={SERVICE_ID} />);

    await screen.findByDisplayValue("Grooming Full Service");
    await userEvent.clear(screen.getByLabelText(/nama layanan/i));
    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Mandi");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan layanan/i }),
    );

    await waitFor(() =>
      expect(mockedServiceService.update).toHaveBeenCalledWith(
        SERVICE_ID,
        expect.objectContaining({ name: "Mandi" }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/master/layanan");
  });

  /*
    ─── THE DURATION IS REQUIRED — 3 September 2026 ──────────────────────────

    Asked for by the BO during end-to-end testing: the calendar cannot draw a
    block without one, so it guesses half an hour — and a guess on a calendar is
    read as fact by everybody downstream, including the clash check.
  */
  it("refuses to save a service with no duration", async () => {
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama layanan/i), "Grooming");
    await userEvent.click(
      screen.getByRole("button", { name: /pilih lini bisnis/i }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Grooming" }));
    await userEvent.type(screen.getByLabelText(/^harga/i), "150000");
    await userEvent.click(screen.getByRole("button", { name: /buat layanan/i }));

    /*
      THE REASON, NOT JUST "WAJIB DIISI". Somebody typing a price has no idea the
      calendar exists; saying which part of the shop reads this field is what
      makes the rule land as sense rather than as an obstacle.
    */
    expect(
      await screen.findByText(/kalender dan pengecekan bentrok/i),
    ).toBeInTheDocument();
    expect(mockedServiceService.create).not.toHaveBeenCalled();
  });
});