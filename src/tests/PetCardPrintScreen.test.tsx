import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PetCardPrintScreen } from "@/features/pets";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import type { Pet } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/pet.service");
jest.mock("@/services/customer.service");

const pets = petService as jest.Mocked<typeof petService>;
const customers = customerService as jest.Mocked<typeof customerService>;

const pet = (overrides: Partial<Pet> = {}): Pet =>
  ({
    _id: "pet-1",
    customerId: "cust-1",
    name: "Bruno",
    species: "dog",
    sex: "male",
    breed: "Golden Retriever",
    weightKg: 24,
    isActive: true,
    deletedAt: null,
    preferences: { text: "Takut hairdryer, pakai handuk", tags: ["galak"] },
    medical: {
      allergies: [
        { name: "Sampo berparfum", severity: "severe", note: "Kulit merah" },
        { name: "Ayam", severity: "mild", note: null },
      ],
      conditions: [{ name: "Displasia panggul", foundAt: null, note: null }],
      medications: [{ name: "Glukosamin", dose: "1x sehari" }],
      vaccinations: [],
      vet: { clinicName: "Klinik Sehat", phone: "021-555-0100" },
    },
    ...overrides,
  }) as unknown as Pet;

beforeEach(() => {
  jest.clearAllMocks();
  pets.getById.mockResolvedValue(pet());
  pets.timeline.mockResolvedValue({
    entries: [
      {
        kind: "booking",
        at: "2026-08-20T02:00:00.000Z",
        title: "Grooming Full Service",
        reference: "BK-260820-001",
        amount: "150000.0000",
        groomerName: "Sinta",
      },
    ],
  } as never);
  customers.getById.mockResolvedValue({
    _id: "cust-1",
    name: "Ibu Rina",
    phone: "0812-3456-7890",
  } as never);
  window.print = jest.fn();
});

/**
 * KARTU PROFIL HEWAN — kriteria 5.12, the sheet handed to the groomer.
 *
 * The groomer is standing at a wet table with a dog in both hands. They are not
 * going to unlock a phone, and the shop's one tablet is at the counter taking
 * the next booking.
 */
describe("PetCardPrintScreen", () => {
  it("puts a severe allergy first, and labels it in words", async () => {
    /*
      ON SCREEN `PetSummaryCard` CAN LEAN ON RED. A sheet is often printed in
      black and white, so the box and the word carry what the colour cannot.
    */
    renderWithAuth(<PetCardPrintScreen petId="pet-1" />);

    const heading = await screen.findByRole("heading", {
      name: /alergi berat/i,
    });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText(/sampo berparfum/i)).toBeInTheDocument();
  });

  it("carries the two phone numbers somebody would need in a hurry", async () => {
    // The owner's, and the vet's. The moment either is needed, nobody is going
    // to go looking for a screen.
    renderWithAuth(<PetCardPrintScreen petId="pet-1" />);

    expect(await screen.findByText("0812-3456-7890")).toBeInTheDocument();
    expect(screen.getByText("021-555-0100")).toBeInTheDocument();
  });

  it("shows how to handle the animal, and when it was last groomed", async () => {
    renderWithAuth(<PetCardPrintScreen petId="pet-1" />);

    expect(
      await screen.findByText(/takut hairdryer/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Sinta/)).toBeInTheDocument();
  });

  it("still prints when the owner lookup fails", async () => {
    /*
      NEITHER THE OWNER NOR THE TIMELINE IS WHAT THE CARD IS FOR. A sheet with
      the allergies and no phone number still does its job; one that refused to
      print because a lookup timed out would send somebody to the wet table with
      nothing at all.
    */
    customers.getById.mockRejectedValue(new Error("offline"));
    pets.timeline.mockRejectedValue(new Error("offline"));

    renderWithAuth(<PetCardPrintScreen petId="pet-1" />);

    expect(await screen.findByText("Bruno")).toBeInTheDocument();
    expect(screen.getByText(/sampo berparfum/i)).toBeInTheDocument();
    expect(screen.getByText(/belum pernah tercatat/i)).toBeInTheDocument();
  });

  it("shows no allergy box at all when there are none", async () => {
    /*
      THE BOX IS AN ALARM, and an alarm that fires for every animal is one nobody
      reads. A dog with nothing wrong with it gets a card with no box.
    */
    pets.getById.mockResolvedValue(
      pet({
        medical: {
          allergies: [],
          conditions: [],
          medications: [],
          vaccinations: [],
          vet: { clinicName: null, phone: null },
        },
      } as never),
    );

    renderWithAuth(<PetCardPrintScreen petId="pet-1" />);

    await screen.findByText("Bruno");
    expect(
      screen.queryByRole("heading", { name: /alergi berat/i }),
    ).not.toBeInTheDocument();
  });

  it("prints", async () => {
    renderWithAuth(<PetCardPrintScreen petId="pet-1" />);

    await screen.findByText("Bruno");
    await userEvent.click(screen.getByRole("button", { name: /cetak kartu/i }));

    expect(window.print).toHaveBeenCalled();
  });

  it("says plainly when the animal is not there", async () => {
    const { ApiError } = jest.requireActual("@/services/api-error");
    pets.getById.mockRejectedValue(new ApiError("Not found", 404));

    renderWithAuth(<PetCardPrintScreen petId="pet-1" />);

    expect(
      await screen.findByText(/tidak ada, atau bukan milik toko anda/i),
    ).toBeInTheDocument();
  });
});
