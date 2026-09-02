import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PetForm } from "@/features/pets";
import { petService } from "@/services/pet.service";
import { customerService } from "@/services/customer.service";

jest.mock("@/services/pet.service");
jest.mock("@/services/customer.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const CUSTOMER_ID = "5a7f1f77bcf86cd799439022";
const PET_ID = "5a7f1f77bcf86cd799439033";

const mockedPetService = petService as jest.Mocked<typeof petService>;
const mockedCustomerService = customerService as jest.Mocked<
  typeof customerService
>;

const petFixture = {
  _id: PET_ID,
  tenantId: "507f1f77bcf86cd799439011",
  customerId: CUSTOMER_ID,
  name: "Bella",
  species: "dog" as const,
  sex: "female" as const,
  breed: "Golden Retriever",
  birthDate: "2022-03-14T00:00:00.000Z",
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
};

beforeEach(() => {
  jest.clearAllMocks();
  /*
    A LOCKED OWNER FIELD NOW FETCHES THE ONE CUSTOMER BY ID so it can show a
    NAME. Without this the edit screen rendered the raw `customerId` — which is
    what a shop owner saw where a person's name belongs.
  */
  mockedCustomerService.getById.mockResolvedValue({
    _id: CUSTOMER_ID,
    name: "Ibu Rina",
    phone: "0812-3456-7890",
  } as never);
  mockedCustomerService.list.mockResolvedValue({
    items: [
      {
        _id: CUSTOMER_ID,
        tenantId: "507f1f77bcf86cd799439011",
        name: "Ibu Rina",
        email: null,
        phone: "0812-3456-7890",
        address: null,
        vipTier: null,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    pagination: { page: 1, limit: 200, total: 1, totalPages: 1 },
  });
});

/**
 * Renders the create form and waits for the owner picker's fetch to settle.
 *
 * Without the wait, `PetOwnerField`'s setState lands after the test body has
 * finished and React warns that it was not wrapped in act() — the fetch is real
 * behaviour, so the test has to wait for it rather than the component having to
 * pretend it is synchronous.
 */
async function renderNew() {
  render(<PetForm />);
  await waitFor(() => expect(mockedCustomerService.list).toHaveBeenCalled());
}

describe("PetForm — registering", () => {
  it("refuses to submit without a name, an owner and a species", async () => {
    await renderNew();

    await userEvent.click(
      screen.getByRole("button", { name: /daftarkan hewan/i }),
    );

    expect(await screen.findByText(/nama hewan wajib diisi/i)).toBeVisible();
    expect(screen.getByText(/pilih pemiliknya dulu/i)).toBeVisible();
    expect(screen.getByText(/pilih jenis hewannya/i)).toBeVisible();
    expect(mockedPetService.create).not.toHaveBeenCalled();
  });

  it("refuses a birth date in the future, pointing at the field", async () => {
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama hewan/i), "Bella");
    await userEvent.type(
      screen.getByLabelText(/tanggal lahir/i),
      "2999-01-01",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /daftarkan hewan/i }),
    );

    expect(
      await screen.findByText(/tanggal lahir tidak bisa di masa depan/i),
    ).toBeVisible();
    expect(mockedPetService.create).not.toHaveBeenCalled();
  });

  it("shows the owner picker — a pet cannot be registered without one", async () => {
    await renderNew();

    expect(
      screen.getByRole("button", { name: /pilih pemilik hewan/i }),
    ).toBeVisible();
  });

  it("asks for no more customers than the API's page cap allows", async () => {
    // The backend refuses `limit` above 100 with a 400 — it does not clamp. This
    // field first shipped asking for 200, so the list came back empty with the
    // server's English "Validation failed" underneath it. A number is easy to
    // raise by accident; this is the guard.
    await renderNew();

    const [query] = mockedCustomerService.list.mock.calls[0];
    expect(query?.limit).toBeLessThanOrEqual(100);
  });

  it("shows our own sentence when the customer list fails, never the server's", async () => {
    // "Validation failed" under a picker tells a shop owner nothing they can act
    // on — it is written for whoever reads the logs. ui-rules §12.
    mockedCustomerService.list.mockRejectedValueOnce(
      new Error("Validation failed"),
    );

    render(<PetForm />);

    expect(
      await screen.findByText(/daftar pelanggan tidak bisa dimuat/i),
    ).toBeVisible();
    expect(screen.queryByText(/validation failed/i)).not.toBeInTheDocument();
  });
});

describe("PetForm — editing", () => {
  beforeEach(() => {
    mockedPetService.getById.mockResolvedValue(petFixture);
    mockedPetService.update.mockResolvedValue(petFixture);
  });

  it("loads the pet into the fields", async () => {
    render(<PetForm petId={PET_ID} />);

    expect(await screen.findByDisplayValue("Bella")).toBeVisible();
    expect(screen.getByDisplayValue("Golden Retriever")).toBeVisible();
    // The ISO instant is trimmed to the date half an <input type=date> wants.
    expect(screen.getByDisplayValue("2022-03-14")).toBeVisible();
  });

  it("locks the owner — reassigning would move the pet's history", async () => {
    render(<PetForm petId={PET_ID} />);

    await screen.findByDisplayValue("Bella");

    expect(
      screen.getByRole("button", { name: /pilih pemilik hewan/i }),
    ).toBeDisabled();
    // And the customer list is never fetched for a field nobody can change.
    expect(mockedCustomerService.list).not.toHaveBeenCalled();
  });

  it("offers the care switch only when editing", async () => {
    render(<PetForm petId={PET_ID} />);

    expect(await screen.findByLabelText(/masih dirawat/i)).toBeVisible();
  });

  it("does not offer the care switch when registering", async () => {
    await renderNew();

    expect(screen.queryByLabelText(/masih dirawat/i)).not.toBeInTheDocument();
  });

  it("saves the edit and returns to the list", async () => {
    render(<PetForm petId={PET_ID} />);

    await screen.findByDisplayValue("Bella");
    await userEvent.clear(screen.getByLabelText(/nama hewan/i));
    await userEvent.type(screen.getByLabelText(/nama hewan/i), "Milo");
    await userEvent.click(screen.getByRole("button", { name: /simpan hewan/i }));

    await waitFor(() =>
      expect(mockedPetService.update).toHaveBeenCalledWith(
        PET_ID,
        expect.objectContaining({ name: "Milo" }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/master/pets");
  });
});
