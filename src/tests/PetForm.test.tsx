import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PetForm } from "@/features/pets";
import { petService } from "@/services/pet.service";
import { customerService } from "@/services/customer.service";
import { petOptionService } from "@/services/petOption.service";

import {
  PET_OPTION_FIXTURES,
  makePetOption,
  petOptionFields,
  petOptionId,
  primePetOptions,
} from "./helpers/petOptions";

jest.mock("@/services/pet.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/petOption.service");
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
  sex: "female" as const,
  /*
    THE FOUR OPTION FIELDS, AS IDS, with the label and code the server resolves
    beside each (25 September 2026) — see `petOptionFields`.

    ⚠️ UKURAN AND JENIS BULU ARE BOTH FILLED IN, and that is not incidental
    detail. Both became REQUIRED on 23 September 2026, so a fixture with either
    blank is a pet the edit screen refuses to save — every test below that
    submits would fail on two fields it is not about. A pet registered under the
    current rule has both. The pet that does NOT is its own test.
  */
  ...petOptionFields({
    species: "dog",
    breed: "domestic",
    furType: "short hair",
    size: "medium",
  }),
  birthDate: "2022-03-14T00:00:00.000Z",
  weightKg: 12.4,
  color: null,
  microchipNo: null,
  description: null,
  internalNotes: null,
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
  primePetOptions(petOptionService.list);
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

  /*
    UKURAN AND JENIS BULU ARE ANSWERS, NOT OFFERS (23 September 2026, on request)
    — a variant-priced grooming is priced BY size and coat, so a pet registered
    without them cannot be quoted until somebody comes back to this form.

    ⚠️ THE API STILL ACCEPTS NEITHER. The rule is the form's, not the server's:
    the quick-add dialog with `requireTraits` off legitimately sends null, and
    tightening `pet.validation.js` would break the till.
  */
  it("refuses to submit without a size and a coat, pointing at each", async () => {
    await renderNew();

    await userEvent.click(
      screen.getByRole("button", { name: /daftarkan hewan/i }),
    );

    expect(await screen.findByText(/pilih ukurannya/i)).toBeVisible();
    expect(screen.getByText(/pilih jenis bulunya/i)).toBeVisible();
    expect(mockedPetService.create).not.toHaveBeenCalled();
  });

  it("refuses a birth date in the future, pointing at the field", async () => {
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama hewan/i), "Bella");
    await userEvent.type(screen.getByLabelText(/tanggal lahir/i), "2999-01-01");
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

  /*
    THE SPECIES ARE THE SHOP'S OWN LIST since 14 Sep 2026, not a hardcoded cat
    and dog. A species the tenant added is offered; one it retired is not — a
    retired option stops being chosen for a new animal.
  */
  it("offers the species the shop added, and not the ones it retired", async () => {
    primePetOptions(petOptionService.list, [
      ...PET_OPTION_FIXTURES,
      makePetOption({
        type: "species",
        code: "kelinci",
        label: "Kelinci",
        sortOrder: 2,
      }),
      makePetOption({
        type: "species",
        code: "hamster",
        label: "Hamster",
        sortOrder: 3,
        isActive: false,
      }),
    ]);

    await renderNew();

    const picker = screen.getByRole("combobox", { name: "Jenis" });
    await waitFor(() => expect(picker).toBeEnabled());
    await userEvent.click(picker);

    expect(
      await screen.findByRole("option", { name: "Kelinci" }),
    ).toBeVisible();
    expect(screen.getByRole("option", { name: "Kucing" })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: /hamster/i }),
    ).not.toBeInTheDocument();
  });

  /*
    A BREED BELONGS TO AN ANIMAL (18 September 2026). A cat's form stops
    offering "Golden Retriever"; a breed that says nothing stays offered for
    every animal, which is what every breed was before the field.
  */
  it("offers only the chosen animal's breeds, and the ones that say nothing", async () => {
    primePetOptions(petOptionService.list, [
      ...PET_OPTION_FIXTURES.filter((option) => option.type !== "breed"),
      makePetOption({
        type: "breed",
        code: "poodle",
        label: "Poodle",
        speciesId: petOptionId("species", "dog"),
      }),
      makePetOption({
        type: "breed",
        code: "persia",
        label: "Persia",
        speciesId: petOptionId("species", "cat"),
        sortOrder: 1,
      }),
      makePetOption({ type: "breed", code: "mix", label: "Mix", sortOrder: 2 }),
    ]);

    await renderNew();

    const species = screen.getByRole("combobox", { name: "Jenis" });
    await waitFor(() => expect(species).toBeEnabled());
    await userEvent.click(species);
    await userEvent.click(
      await screen.findByRole("option", { name: "Kucing" }),
    );

    await userEvent.click(screen.getByRole("combobox", { name: "Ras" }));

    expect(await screen.findByRole("option", { name: "Persia" })).toBeVisible();
    expect(screen.getByRole("option", { name: "Mix" })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "Poodle" }),
    ).not.toBeInTheDocument();
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
    expect(screen.getByRole("combobox", { name: "Ras" })).toHaveTextContent(
      "Domestic",
    );
    // The ISO instant is trimmed to the date half an <input type=date> wants.
    expect(screen.getByDisplayValue("2022-03-14")).toBeVisible();
  });

  /*
    A RETIRED VALUE THE PET ALREADY HOLDS STAYS ON THE FORM. Without it the
    select has no item for its value, renders blank, and the next save clears a
    fact nobody chose to change — while the server would have accepted it.
  */
  it("keeps a retired species the pet already has, marked nonaktif", async () => {
    primePetOptions(petOptionService.list, [
      ...PET_OPTION_FIXTURES,
      makePetOption({
        type: "species",
        code: "kelinci",
        label: "Kelinci",
        sortOrder: 2,
        isActive: false,
      }),
    ]);
    mockedPetService.getById.mockResolvedValue({
      ...petFixture,
      species: petOptionId("species", "kelinci"),
      speciesLabel: "Kelinci",
      /* The PET's resolved code — unrelated to a breed's `speciesId`. */
      speciesCode: "kelinci",
    });

    render(<PetForm petId={PET_ID} />);

    await screen.findByDisplayValue("Bella");
    const picker = screen.getByRole("combobox", { name: "Jenis" });
    await waitFor(() => expect(picker).toHaveTextContent("Kelinci (nonaktif)"));

    await userEvent.click(
      screen.getByRole("button", { name: /simpan hewan/i }),
    );

    await waitFor(() =>
      expect(mockedPetService.update).toHaveBeenCalledWith(
        PET_ID,
        expect.objectContaining({ species: petOptionId("species", "kelinci") }),
      ),
    );
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
    await userEvent.click(
      screen.getByRole("button", { name: /simpan hewan/i }),
    );

    await waitFor(() =>
      expect(mockedPetService.update).toHaveBeenCalledWith(
        PET_ID,
        expect.objectContaining({ name: "Milo" }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/master/pets");
  });

  /*
    ⚠️ THE PHOTO IS THE ONE FIELD SENT AS A DIFF, and this is what stops it being
    "tidied up" back into the payload with everything else. Two separate failures
    hide behind that:

      1. THE SAVE WOULD FAIL OUTRIGHT for any pet that has a picture. The API
         strips the upload's `token` before storing, so the asset a GET returns
         has none — and `MediaService.assertOwned` refuses an asset without one.
      2. THE BYTES WOULD BE AT RISK. The API deletes what an update drops, so
         sending the field on a patch that did not touch it is one dropped
         connection away from losing the photo.
  */
  it("leaves the photo out of a patch that did not touch it", async () => {
    mockedPetService.getById.mockResolvedValue({
      ...petFixture,
      photo: {
        mediaType: "image",
        url: "https://cdn.test/full.webp",
        storageKey: "tenant-1/pet/2026/09/abc.webp",
        driver: "local",
        mimeType: "image/webp",
        thumbUrl: "https://cdn.test/thumb.webp",
      },
    } as never);

    render(<PetForm petId={PET_ID} />);

    await screen.findByDisplayValue("Bella");
    await userEvent.clear(screen.getByLabelText(/nama hewan/i));
    await userEvent.type(screen.getByLabelText(/nama hewan/i), "Milo");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan hewan/i }),
    );

    await waitFor(() => expect(mockedPetService.update).toHaveBeenCalled());

    const [, payload] = mockedPetService.update.mock.calls[0];
    // Absent, not null — `null` is how a photo is taken OFF, so the two cannot
    // be conflated here.
    expect(payload).not.toHaveProperty("photo");
  });

  /*
    THE PICTURE SURVIVES A SAVE somebody makes for another reason. The edit
    screen loads it, so a shop owner who opens a pet to fix its weight sees the
    photo already there rather than an empty slot that looks like it was lost.
  */
  it("loads the stored photo into the field", async () => {
    mockedPetService.getById.mockResolvedValue({
      ...petFixture,
      photo: {
        mediaType: "image",
        url: "https://cdn.test/full.webp",
        storageKey: "tenant-1/pet/2026/09/abc.webp",
        driver: "local",
        mimeType: "image/webp",
        thumbUrl: "https://cdn.test/thumb.webp",
      },
    } as never);

    render(<PetForm petId={PET_ID} />);

    await screen.findByDisplayValue("Bella");
    expect(screen.getByRole("img", { name: "Foto Bella" })).toHaveAttribute(
      "src",
      "https://cdn.test/thumb.webp",
    );
    // The button says REPLACE rather than choose, which is how the slot shows
    // it is already filled.
    expect(
      screen.getByRole("button", { name: /ganti gambar/i }),
    ).toBeInTheDocument();
  });

  /*
    ⚠️ AN OLDER PET HAS TO ANSWER THEM BEFORE IT CAN BE SAVED. Ukuran and Jenis
    bulu were optional until 23 September 2026, so a pet registered before that
    loads with both blank — and somebody opening it to fix a weight is asked for
    a size and a coat first.

    THAT IS THE RULE DOING WHAT IT WAS ASKED TO DO, not a bug, and it is pinned
    here so the behaviour is a decision somebody can find rather than a surprise
    a shop reports. It is also why `PetFixLink` still exists and still points at
    this form.
  */
  it("blocks a pet registered before the rule until its blanks are answered", async () => {
    mockedPetService.getById.mockResolvedValue({
      ...petFixture,
      size: null,
      furType: null,
    } as never);

    render(<PetForm petId={PET_ID} />);

    await screen.findByDisplayValue("Bella");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan hewan/i }),
    );

    expect(await screen.findByText(/pilih ukurannya/i)).toBeVisible();
    expect(screen.getByText(/pilih jenis bulunya/i)).toBeVisible();
    expect(mockedPetService.update).not.toHaveBeenCalled();
  });

  /*
    NOT PINNED HERE: that a create omits `photo` when nobody picked one. No test
    in this suite completes a create — the owner is a dialog-based picker with no
    harness for it — and standing that up for one `not.toHaveProperty` is more
    machinery than the assertion is worth. The create path is one spread in
    `handleSubmit` beside the patch's, which is what these two cover.
  */
});
