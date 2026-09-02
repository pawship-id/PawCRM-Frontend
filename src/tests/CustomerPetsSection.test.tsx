import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CustomerPetsSection } from "@/features/pets";
import { petService } from "@/services/pet.service";
import type { Pet } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/pet.service");

const mockedPetService = petService as jest.Mocked<typeof petService>;

const CUSTOMER_ID = "5a7f1f77bcf86cd799439022";

const pet = (overrides: Partial<Pet> = {}): Pet => ({
  _id: "5a7f1f77bcf86cd799439033",
  tenantId: "507f1f77bcf86cd799439011",
  customerId: CUSTOMER_ID,
  name: "Bella",
  species: "dog",
  sex: "female",
  breed: "Golden Retriever",
  birthDate: null,
  weightKg: 12.4,
  color: null,
  microchipNo: null,
  notes: null,
  preferences: { text: null, tags: [] },
  medical: {
    allergies: [],
    conditions: [],
    medications: [],
    vaccinations: [],
    vet: { clinicName: null, phone: null },
  },
  photo: null,
  isActive: true,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

function listReturns(items: Pet[], total = items.length) {
  mockedPetService.list.mockResolvedValue({
    items,
    pagination: { page: 1, limit: 20, total, totalPages: 1 },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("CustomerPetsSection", () => {
  it("asks only for this customer's animals", async () => {
    listReturns([pet()]);

    renderWithAuth(<CustomerPetsSection customerId={CUSTOMER_ID} />);

    await waitFor(() =>
      expect(mockedPetService.list).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: CUSTOMER_ID }),
      ),
    );
  });

  it("lists the pets with their species", async () => {
    listReturns([pet(), pet({ _id: "b", name: "Milo", species: "cat" })]);

    renderWithAuth(<CustomerPetsSection customerId={CUSTOMER_ID} />);

    expect(await screen.findByText("Bella")).toBeVisible();
    expect(screen.getByText("Milo")).toBeVisible();
    expect(screen.getByText("Anjing")).toBeVisible();
    expect(screen.getByText("Kucing")).toBeVisible();
  });

  it("shows retired pets too — they still belong to this owner", async () => {
    // Hiding them would make this section disagree with the delete guard, which
    // counts them and refuses to remove the customer.
    listReturns([pet({ isActive: false })]);

    renderWithAuth(<CustomerPetsSection customerId={CUSTOMER_ID} />);

    expect(await screen.findByText("Bella")).toBeVisible();
    expect(screen.getByText("Tidak aktif")).toBeVisible();
  });

  it("does not badge the ordinary case — every row saying Dirawat is noise", async () => {
    listReturns([pet({ isActive: true })]);

    renderWithAuth(<CustomerPetsSection customerId={CUSTOMER_ID} />);

    await screen.findByText("Bella");
    expect(screen.queryByText("Dirawat")).not.toBeInTheDocument();
  });

  it("says what is missing rather than 'no data'", async () => {
    listReturns([]);

    renderWithAuth(<CustomerPetsSection customerId={CUSTOMER_ID} />);

    expect(
      await screen.findByText(/belum ada hewan terdaftar/i),
    ).toBeVisible();
  });

  it("states how many are not shown when the owner has more than a page", async () => {
    listReturns([pet()], 24);

    renderWithAuth(<CustomerPetsSection customerId={CUSTOMER_ID} />);

    expect(await screen.findByText(/23 hewan lainnya/i)).toBeVisible();
  });

  it("refetches after a quick-add rather than splicing the row in locally", async () => {
    listReturns([]);
    mockedPetService.create.mockResolvedValue(pet());

    renderWithAuth(
      <CustomerPetsSection customerId={CUSTOMER_ID} customerName="Ibu Rina" />,
    );

    await screen.findByText(/belum ada hewan terdaftar/i);
    await userEvent.click(screen.getByRole("button", { name: /tambah hewan/i }));

    expect(await screen.findByRole("dialog")).toBeVisible();
    // The owner is stated in the dialog, so nobody has to trust it is implied.
    expect(screen.getByText(/ibu rina/i)).toBeVisible();

    await userEvent.type(screen.getByLabelText(/nama hewan/i), "Bella");
    await userEvent.click(
      screen.getByRole("combobox", { name: /jenis/i }),
    );
    await userEvent.click(await screen.findByRole("option", { name: "Anjing" }));
    await userEvent.click(
      screen.getByRole("button", { name: /^tambah hewan$/i }),
    );

    await waitFor(() =>
      expect(mockedPetService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: CUSTOMER_ID,
          name: "Bella",
          species: "dog",
        }),
      ),
    );
    // Two calls: the initial load and the one after the create.
    await waitFor(() => expect(mockedPetService.list).toHaveBeenCalledTimes(2));
  });

  it("offers no add button for a deleted customer", async () => {
    listReturns([pet()]);

    renderWithAuth(<CustomerPetsSection customerId={CUSTOMER_ID} disabled />);

    await screen.findByText("Bella");
    expect(
      screen.queryByRole("button", { name: /tambah hewan/i }),
    ).not.toBeInTheDocument();
  });
});
