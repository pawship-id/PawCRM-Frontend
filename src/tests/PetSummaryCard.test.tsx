import { render, screen } from "@testing-library/react";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customer.service");

import { PetSummaryCard } from "@/features/pets";
import type { Pet } from "@/types/api";

/**
 * WHAT A GROOMER READS BEFORE TOUCHING THE ANIMAL — FR-5 kriteria 5.13.
 *
 * This component IS the feature. The profile page is where the facts are
 * entered; this is where they are read, and it is the half that changes what
 * happens in the shop.
 */
const pet = (overrides: Partial<Pet> = {}): Pet =>
  ({
    _id: "pet-1",
    name: "Mochi",
    preferences: { text: null, tags: [] },
    medical: {
      allergies: [],
      conditions: [],
      medications: [],
      vaccinations: [],
      vet: { clinicName: null, phone: null },
    },
    ...overrides,
  }) as Pet;

describe("PetSummaryCard", () => {
  /*
    AN EMPTY BOX UNDER EVERY PET teaches people to stop looking at the box, and
    the day it matters is the day it is ignored.
  */
  it("draws nothing when there is nothing to say", () => {
    const { container } = render(<PetSummaryCard pet={pet()} />);

    expect(container).toBeEmptyDOMElement();
  });

  /*
    THE ONE THAT STOPS A WASH GOING WRONG. `role="alert"` and the word "Alergi"
    together: a coloured box with a name in it is something somebody has to
    decode, and the label is what makes it readable at arm's length.
  */
  it("shouts about a severe allergy", () => {
    render(
      <PetSummaryCard
        pet={pet({
          medical: {
            allergies: [
              { name: "Sampo strawberry", severity: "severe", note: null },
            ],
            conditions: [],
            medications: [],
            vaccinations: [],
            vet: { clinicName: null, phone: null },
          },
        })}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/alergi/i);
    expect(alert).toHaveTextContent("Sampo strawberry");
  });

  /* A mild one is a thing to know, not a thing to stop for. */
  it("does not shout about a mild one", () => {
    render(
      <PetSummaryCard
        pet={pet({
          medical: {
            allergies: [{ name: "Debu", severity: "mild", note: null }],
            conditions: [],
            medications: [],
            vaccinations: [],
            vet: { clinicName: null, phone: null },
          },
        })}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/debu/i)).toBeInTheDocument();
  });

  /*
    DOSE AND FREQUENCY TOGETHER OR NOT AT ALL. "Apoquel 1 tablet" without
    "2x sehari" is the half of the instruction that gets somebody in trouble.
  */
  it("keeps a medication's dose beside its frequency", () => {
    render(
      <PetSummaryCard
        pet={pet({
          medical: {
            allergies: [],
            conditions: [],
            medications: [
              {
                name: "Apoquel",
                dose: "1 tablet",
                frequency: "2x sehari",
                since: null,
              },
            ],
            vaccinations: [],
            vet: { clinicName: null, phone: null },
          },
        })}
      />,
    );

    expect(
      screen.getByText(/Apoquel · 1 tablet · 2x sehari/),
    ).toBeInTheDocument();
  });

  it("shows the preference note and the tags", () => {
    render(
      <PetSummaryCard
        pet={pet({
          preferences: {
            text: "Mandi duluan, jangan blow keras",
            tags: ["galak", "trauma-vet"],
          },
        })}
      />,
    );

    expect(
      screen.getByText("Mandi duluan, jangan blow keras"),
    ).toBeInTheDocument();
    expect(screen.getByText("#galak")).toBeInTheDocument();
    expect(screen.getByText("#trauma-vet")).toBeInTheDocument();
  });
});

/**
 * THE OWNER IS A NAME, NOT AN ID — and this is a regression test for something
 * a shop owner actually saw on screen.
 *
 * `/dashboard/master/pets/:id` used to mount the EDIT FORM as its landing tab.
 * A form answers in field values, so the owner rendered as a disabled select
 * holding a customer id: somebody opening a profile to see whose dog this is
 * read `6a9797bacc28e96138ba7764`.
 */
describe("PetInfoTab — the owner", () => {
  it("shows the owner's name, never the id", async () => {
    const { customerService } = jest.requireMock("@/services/customer.service");
    customerService.getById.mockResolvedValue({
      _id: "cust-1",
      name: "Ibu Rina",
    });

    const { PetInfoTab } = jest.requireActual<
      typeof import("@/features/pets/components/PetInfoTab")
    >("@/features/pets/components/PetInfoTab");

    /* `Can` reads the session, so this one needs the provider. */
    renderWithAuth(
      <PetInfoTab
        pet={pet({ customerId: "cust-1", breed: "domestic" }) as Pet}
      />,
    );

    expect(await screen.findByText("Ibu Rina")).toBeInTheDocument();
    expect(screen.queryByText("cust-1")).not.toBeInTheDocument();
  });
});
