import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingForm } from "@/features/booking";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { userService } from "@/services/user.service";
import type {
  Booking,
  CreateBookingResult,
  Customer,
  Pet,
  Service,
  User,
} from "@/types/api";

import { swalToast } from "@/lib/swal";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/service.service");
jest.mock("@/services/user.service");
/*
  THE BRANCH IS PICKED ON THE FORM NOW, not inherited from the session — the
  pattern every other hand-typed document in this app follows. One branch means
  `soleBranch` answers it and no dropdown appears.
*/
jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");
/* The house pattern: the toast is chrome, and the real Swal drags a timer into
   every test that saves. */
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

/*
  THE FORM IS A PAGE NOW, so success navigates instead of closing a dialog. The
  router is mocked rather than rendered through a real one: what these tests are
  about is what gets SENT, and where it goes afterwards is one assertion.
*/
const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
}));

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const customers = customerService as jest.Mocked<typeof customerService>;
const pets = petService as jest.Mocked<typeof petService>;
const services = serviceService as jest.Mocked<typeof serviceService>;
const users = userService as jest.Mocked<typeof userService>;
const branches = branchService as jest.Mocked<typeof branchService>;
const businessLines = businessLineService as jest.Mocked<
  typeof businessLineService
>;

const BRANCH_ID = "branch-1";

const page = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
});

const customer = {
  _id: "cust-1",
  name: "Ibu Rina",
  phone: "0812-3456-7890",
} as Customer;

const pet = {
  _id: "pet-1",
  name: "Bruno",
  /* A pet with no size cannot be booked since 13 September 2026. */
  size: "medium",
  preferences: { text: null, tags: [] },
  medical: {
    allergies: [],
    conditions: [],
    medications: [],
    vaccinations: [],
    vet: { clinicName: null, phone: null },
  },
} as unknown as Pet;

const service = (overrides: Partial<Service> = {}) =>
  ({
    _id: "svc-1",
    name: "Grooming Full Service",
    price: "150000.0000",
    durationMin: 90,
    isActive: true,
    ...overrides,
  }) as Service;

const groomer = { _id: "user-1", fullName: "Mbak Sari" } as User;

/* ONE BOOKING MADE — so the form opens it rather than the list. */
const created = {
  groupId: "grp-1",
  bookings: [{ _id: "bk-1", bookingNumber: "BK-260826-001" } as Booking],
} as CreateBookingResult;

beforeEach(() => {
  jest.clearAllMocks();
  push.mockClear();
  customers.list.mockResolvedValue(page([customer]));
  pets.list.mockResolvedValue(page([pet]));
  services.list.mockResolvedValue(page([service()]));
  users.list.mockResolvedValue(page([groomer]));
  bookings.create.mockResolvedValue(created);
  branches.list.mockResolvedValue(
    page([{ _id: BRANCH_ID, name: "Cibubur" }]) as never,
  );
  /* The lines of business the per-line "Tipe layanan" filter offers. */
  businessLines.list.mockResolvedValue(
    page([
      { _id: "line-groom", name: "Grooming" },
      { _id: "line-hotel", name: "Hotel" },
    ]) as never,
  );
  /*
    FR-4: the groomer dropdown asks who may be booked on the chosen DAY, not who
    exists. `users.list` is no longer what fills it.
  */
  bookings.availability.mockResolvedValue([
    { _id: groomer._id, fullName: groomer.fullName, offReason: null },
  ]);
});

/** Chooses Ibu Rina through the picker the dialog opens. */
async function pickCustomer() {
  await userEvent.click(screen.getByRole("button", { name: /pilih pelanggan/i }));
  await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));
}

/** Picks an option out of one of the cards' selects. */
async function choose(name: RegExp, option: RegExp | string) {
  await userEvent.click(screen.getByRole("combobox", { name }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

/**
 * `/dashboard/booking/new`.
 *
 * Until this form existed the only way to make a booking was to sell it at the
 * till, which cannot answer the phone call that books Thursday. One card is one
 * booking — one animal, one main service — and a save sends them all as
 * `bookings[]` under one header.
 */
describe("BookingForm", () => {
  it("sends who, when, and one booking per card", async () => {
    renderWithAuth(
      <BookingForm />,
    );

    await pickCustomer();

    // One pet, so the first card is filled in — the click removed from every
    // booking a shop with single-dog customers ever takes.
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /^hewan$/i })).toHaveTextContent(
        "Bruno",
      ),
    );

    await choose(/^layanan$/i, /grooming full service/i);

    fireEvent.change(screen.getByLabelText(/tanggal/i), {
      target: { value: "2026-09-03" },
    });
    fireEvent.change(screen.getByLabelText(/jam/i), {
      target: { value: "10:30" },
    });

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith({
        branchId: BRANCH_ID,
        customerId: "cust-1",
        /* Never true on a first attempt — a warning nobody read is not a decision. */
        forceClash: false,
        /*
          ONE ENTRY PER CARD, and no price crosses the wire: the server snapshots
          it from the catalogue. `durationMin` is undefined because nobody typed
          over the catalogue's ninety minutes.
        */
        bookings: [
          {
            petId: "pet-1",
            serviceId: "svc-1",
            /* Nothing ticked, but the key is always sent — the server reads its
               absence and its emptiness the same way, and a shape that changes
               with the data is one more thing for a reader to work out. */
            addonServiceIds: [],
            groomerUserId: null,
            durationMin: undefined,
            /* Two notes, and the key is always sent — same reason as above. */
            internalNotes: null,
            customerNotes: null,
            belongings: [],
          },
        ],
        // The two fields mean WALL-CLOCK TIME in the shop's own zone.
        scheduledAt: new Date("2026-09-03T10:30").toISOString(),
        /* The salon unless somebody says otherwise, and no van booked. */
        location: "in_store",
        pickupRequested: false,
        deliveryRequested: false,
        tripAddress: null,
        /*
          `requested`, NOT `confirmed`, and the default changed on 5 Sep 2026.
          Saving the form ASKS for an appointment; the shop agreeing to it is a
          separate act with a rung of its own. Defaulting to `confirmed` made
          every booking self-approving, which is exactly the distinction
          `requested` exists to draw.
        */
        status: "requested",
        notes: null,
      }),
    );
    // ONE BOOKING CAME BACK, so its own page is the next thing anybody does.
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/booking/bk-1"),
    );
  });

  /*
    BU LISA ARRIVES WITH MOCHI AND COCO: one form, one header, two cards — and
    two bookings in one group, each with its own number, status and bill.
  */
  it("makes one booking per animal and opens the list narrowed to the group", async () => {
    bookings.create.mockResolvedValue({
      groupId: "grp-9",
      bookings: [
        { _id: "bk-1", bookingNumber: "BK-260826-001" },
        { _id: "bk-2", bookingNumber: "BK-260826-002" },
      ] as Booking[],
    });
    pets.list.mockResolvedValue(
      page([
        { _id: "pet-1", name: "Mochi", size: "small" } as Pet,
        { _id: "pet-2", name: "Coco", size: "medium" } as Pet,
      ]),
    );
    services.list.mockResolvedValue(
      page([service(), service({ _id: "svc-2", name: "Bath & Blow", price: "95000.0000" })]),
    );

    renderWithAuth(
      <BookingForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /^hewan$/i });

    await choose(/^hewan$/i, "Mochi");
    await choose(/^layanan$/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /^tambah booking$/i }));

    const cards = screen.getAllByRole("combobox", { name: /^hewan$/i });
    await userEvent.click(cards[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Coco" }));

    const serviceSelects = screen.getAllByRole("combobox", { name: /^layanan$/i });
    await userEvent.click(serviceSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: /bath & blow/i }));

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());

    const sent = bookings.create.mock.calls[0][0];
    expect(sent.bookings).toHaveLength(2);
    expect(sent.bookings.map((entry) => entry.petId)).toEqual(["pet-1", "pet-2"]);
    expect(sent.bookings.map((entry) => entry.serviceId)).toEqual([
      "svc-1",
      "svc-2",
    ]);

    /* TWO CAME BACK — no single page is "the" answer, so Hari Ini on their day. */
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        expect.stringMatching(/^\/dashboard\/booking\?tanggal=\d{4}-\d{2}-\d{2}$/),
      ),
    );
  });

  /*
    THE SAME ANIMAL ON TWO CARDS IS ALLOWED — a bath and a hotel stay are two
    bookings, and the form must not treat the second card as a mistake.
  */
  it("lets the same animal sit on two cards with two different services", async () => {
    services.list.mockResolvedValue(
      page([service(), service({ _id: "svc-2", name: "Penitipan" })]),
    );

    renderWithAuth(<BookingForm />);

    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /^tambah booking$/i }));

    const petSelects = screen.getAllByRole("combobox", { name: /^hewan$/i });
    await userEvent.click(petSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Bruno" }));

    const serviceSelects = screen.getAllByRole("combobox", { name: /^layanan$/i });
    await userEvent.click(serviceSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: /penitipan/i }));

    expect(
      screen.queryByText(/sudah punya layanan yang sama/i),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    const sent = bookings.create.mock.calls[0][0];
    expect(sent.bookings.map((entry) => entry.petId)).toEqual(["pet-1", "pet-1"]);
    expect(sent.bookings.map((entry) => entry.serviceId)).toEqual([
      "svc-1",
      "svc-2",
    ]);
  });

  /*
    THE SAME ANIMAL TWICE FOR THE SAME SERVICE is one grooming booked twice —
    nothing on the day sheet could tell the two apart. The message NAMES the
    animal: with four cards on screen, "one of these is wrong" is a puzzle rather
    than a message (PRD 2.7).
  */
  it("refuses the same animal twice for the same service, and says which", async () => {
    renderWithAuth(
      <BookingForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /^tambah booking$/i }));

    const petSelects = screen.getAllByRole("combobox", { name: /^hewan$/i });
    await userEvent.click(petSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Bruno" }));

    const serviceSelects = screen.getAllByRole("combobox", { name: /^layanan$/i });
    await userEvent.click(serviceSelects[1]);
    await userEvent.click(
      await screen.findByRole("option", { name: /grooming full service/i }),
    );

    expect(
      await screen.findByText(/bruno sudah punya layanan yang sama/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
  });

  /*
    WHEN THE CUSTOMER GETS THEIR ANIMALS BACK — the longest groomer's workload,
    never the sum (PRD 2.9). Two groomers work at once, and a screen promising an
    earlier finish than the shop can manage sends somebody home late.
  */
  it("shows a finish time from the longest groomer, not the sum", async () => {
    pets.list.mockResolvedValue(
      page([
        { _id: "pet-1", name: "Mochi", size: "small" } as Pet,
        { _id: "pet-2", name: "Coco", size: "medium" } as Pet,
      ]),
    );
    services.list.mockResolvedValue(
      page([
        service(),
        service({ _id: "svc-2", name: "Bath & Blow", durationMin: 60 }),
      ]),
    );
    /* FR-4: the dropdown is filled from the availability call now. */
    bookings.availability.mockResolvedValue([
      { _id: groomer._id, fullName: groomer.fullName, offReason: null },
      { _id: "user-2", fullName: "Pak Rio", offReason: null },
    ]);

    renderWithAuth(
      <BookingForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /^hewan$/i });

    fireEvent.change(screen.getByLabelText(/jam/i), { target: { value: "10:00" } });

    await choose(/^hewan$/i, "Mochi");
    await choose(/^layanan$/i, /grooming full service/i);
    await choose(/groomer/i, "Mbak Sari");

    await userEvent.click(screen.getByRole("button", { name: /^tambah booking$/i }));

    const petSelects = screen.getAllByRole("combobox", { name: /^hewan$/i });
    await userEvent.click(petSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Coco" }));

    const serviceSelects = screen.getAllByRole("combobox", { name: /^layanan$/i });
    await userEvent.click(serviceSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: /bath & blow/i }));

    const groomerSelects = screen.getAllByRole("combobox", { name: /groomer/i });
    await userEvent.click(groomerSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Pak Rio" }));

    // 90 and 60 in parallel = 90, so 11.30 — not 12.30.
    expect(await screen.findByText(/selesai sekitar 11\.30/i)).toBeInTheDocument();
  });

  it("names the field that is still missing rather than leaving a dead button", async () => {
    renderWithAuth(
      <BookingForm />,
    );

    expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
    expect(await screen.findByText(/pelanggan belum dipilih/i)).toBeInTheDocument();

    await pickCustomer();

    expect(
      await screen.findByText(/setiap booking harus punya hewan dan layanan/i),
    ).toBeInTheDocument();
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it("sends the groomer somebody assigned", async () => {
    renderWithAuth(
      <BookingForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);
    await choose(/groomer/i, "Mbak Sari");

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bookings: [expect.objectContaining({ groomerUserId: "user-1" })],
        }),
      ),
    );
  });

  /*
    Reading /api/users takes the `users read` permission, which a receptionist
    who books all day has no other reason to hold. Assignment is optional and the
    server names an unassigned slot, so a refusal costs the select, not the form.
  */
  it("still books when the staff list is refused", async () => {
    bookings.availability.mockRejectedValue(new ApiError("Forbidden", 403));

    renderWithAuth(
      <BookingForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    expect(
      screen.queryByRole("combobox", { name: /groomer/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          bookings: [expect.objectContaining({ groomerUserId: null })],
        }),
      ),
    );
  });

  /*
    THE CHECK THAT MATTERS MOST on the server is that the pet belongs to the
    customer — a booking under the wrong owner looks perfectly normal and bills
    the wrong person. Its answer has to reach the person who can fix it.
  */
  it("puts a refusal on the field it is about", async () => {
    bookings.create.mockRejectedValue(
      new ApiError("Validation failed", 400, {
        details: [
          {
            // The animal is on the entry, so the field points into `bookings`.
            field: "body.bookings[0].petId",
            message: "This pet belongs to a different customer",
          },
        ],
      }),
    );

    renderWithAuth(
      <BookingForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);
    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    expect(
      await screen.findByText(/this pet belongs to a different customer/i),
    ).toBeInTheDocument();
  });

  /*
    THE BRANCH IS ASKED FOR ON THE FORM — the pattern every other hand-typed
    document follows. It used to be inherited from `session.currentBranchId`,
    which is the TILL's idea: a terminal stands in one shop all day, and a
    booking taken over the phone is not that.

    THE COST OF THE OLD WAY was not a crash. It was a booking quietly filed to
    whichever branch the session happened to point at — invisible on every screen
    until somebody reconciled a branch's takings.
  */
  it("says which field is missing when the branch has not been chosen", async () => {
    branches.list.mockResolvedValue(
      page([
        { _id: BRANCH_ID, name: "Cibubur" },
        { _id: "branch-2", name: "Bekasi" },
      ]) as never,
    );

    renderWithAuth(<BookingForm />);

    /* Two branches IS a choice, so the picker appears and nothing is guessed. */
    expect(
      await screen.findByRole("button", { name: /cabang/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/cabang belum dipilih/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
  });

  /* ONE BRANCH IS NOT A CHOICE — `soleBranch` answers it, no dropdown appears. */
  it("does not ask when the shop has one branch", async () => {
    renderWithAuth(<BookingForm />);

    /* `soleBranch` lands a tick after the fetch resolves. */
    await waitFor(() =>
      expect(
        screen.queryByText(/cabang belum dipilih/i),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /cabang/i }),
    ).not.toBeInTheDocument();
  });

  it("asks no status at all — the button decides it", async () => {
    /*
      THE SELECT IS GONE, replaced by the two buttons in the action bar.

      "Which status should this start in" is not what a receptionist writing
      down a phone call is deciding; what they are deciding is whether they are
      FINISHED. A field that has to be read and understood before every save is
      one people leave on whatever it happened to say last — and it was a second
      door into the state machine, able to put a booking straight into
      `confirmed` with nobody at the shop having agreed to it.
    */
    renderWithAuth(<BookingForm />);

    await screen.findByRole("button", { name: /simpan booking/i });

    expect(
      screen.queryByRole("combobox", { name: /^status$/i }),
    ).not.toBeInTheDocument();
  });

  it("saves as `requested` from the ordinary button", async () => {
    // Saving ASKS for an appointment; the shop agreeing is its own act, with a
    // rung and a button of its own on the booking page.
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].status).toBe("requested");
  });

  it("saves a draft from the draft button, whatever else is on the form", async () => {
    /*
      SOMEBODY PRESSING IT IS TELLING YOU THEY HAVE NOT FINISHED. A phone rings
      mid-booking, a customer is not sure which day — the button has to mean
      draft outright, not "draft unless something else on the form disagrees".
    */
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    await userEvent.click(
      screen.getByRole("button", { name: /simpan sebagai draf/i }),
    );

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].status).toBe("draft");
  });

  it("offers the draft button while Simpan is still blocked", async () => {
    /*
      THE ONE SITUATION IT EXISTS FOR. The bar greys Simpan out until the
      required fields are answered; a draft is exactly what you save when they
      are not, so gating it on the same rule would make it useless.
    */
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });

    expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /simpan sebagai draf/i }),
    ).toBeEnabled();
  });

  /*
    THE BOOKING WAS ALREADY WRITTEN BY THE TIME THE TOAST RUNS, so a toast that
    fails must not be reported as a save that failed.

    THIS IS NOT HYPOTHETICAL. The toast used to sit inside the same `try` as the
    request; the real Swal threw under jsdom, the catch turned it into "Terjadi
    kesalahan. Coba lagi.", and a booking that had landed was reported as a
    failure — which sends somebody to make it a second time.
  */
  it("still counts as saved when the toast blows up", async () => {
    (swalToast as jest.Mock).mockImplementationOnce(() => {
      throw new Error("toast gagal");
    });

    renderWithAuth(<BookingForm />);

    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/booking/bk-1"),
    );
    expect(screen.queryByText(/terjadi kesalahan/i)).not.toBeInTheDocument();
  });

  /*
    FR-5 KRITERIA 5.13 — the reason the pet profile is worth building at all.

    A groomer does not have to remember to open anything: choosing the animal is
    what makes the shop's own notes appear. A profile that must be sought out is
    a profile nobody opens on a Saturday morning.

    IT APPEARS BEFORE THE SERVICE IS CHOSEN. A severe allergy read afterwards is
    a warning that arrived too late to change anything.
  */
  it("warns about a severe allergy the moment the animal is chosen", async () => {
    pets.list.mockResolvedValue(
      page([
        {
          ...pet,
          medical: {
            ...pet.medical,
            allergies: [
              { name: "Sampo strawberry", severity: "severe", note: null },
            ],
          },
          preferences: { text: "Mandi duluan", tags: ["galak"] },
        } as unknown as Pet,
      ]),
    );

    renderWithAuth(<BookingForm />);

    await pickCustomer();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/alergi/i);
    expect(alert).toHaveTextContent("Sampo strawberry");
    expect(screen.getByText("Mandi duluan")).toBeInTheDocument();
    expect(screen.getByText("#galak")).toBeInTheDocument();
  });

  it("says nothing when the shop knows nothing about the animal", async () => {
    renderWithAuth(<BookingForm />);

    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /* ── FR-4: the roster, finally read ─────────────────────────────────── */

  /*
    A GREYED NAME WITH NO EXPLANATION tells a receptionist to phone somebody;
    "Libur setiap Rabu" tells them to offer Thursday. The reason is part of the
    answer, not a nicety.
  */
  it("disables a groomer who is off, and says why", async () => {
    bookings.availability.mockResolvedValue([
      { _id: "user-1", fullName: "Mbak Sari", offReason: "Libur setiap Rabu" },
    ]);

    renderWithAuth(<BookingForm />);

    await pickCustomer();
    await screen.findByRole("combobox", { name: /groomer/i });
    await userEvent.click(screen.getByRole("combobox", { name: /groomer/i }));

    const option = await screen.findByRole("option", {
      name: /mbak sari — libur setiap rabu/i,
    });
    expect(option).toHaveAttribute("aria-disabled", "true");
  });

  /*
    RE-ASKED WHEN THE DATE CHANGES. Somebody off every Wednesday is offerable on
    Thursday, and a list fetched once on mount would be wrong the moment the
    receptionist moves the appointment.
  */
  it("asks again when the date moves", async () => {
    renderWithAuth(<BookingForm />);

    await pickCustomer();
    await waitFor(() => expect(bookings.availability).toHaveBeenCalled());

    const before = bookings.availability.mock.calls.length;

    fireEvent.change(screen.getByLabelText(/tanggal/i), {
      target: { value: "2026-09-09" },
    });

    await waitFor(() =>
      expect(bookings.availability).toHaveBeenCalledWith("2026-09-09"),
    );
    expect(bookings.availability.mock.calls.length).toBeGreaterThan(before);
  });

  /*
    A CLASH IS A WARNING, NOT A REFUSAL — kriteria 4.5/4.6. Two small dogs at ten
    really can be handled together sometimes, and the shop is the only one who
    knows. A system that forbade it would be beaten in the way that costs most:
    the booking gets written on paper and the day sheet stops being true.

    THE SECOND SAVE IS THE OVERRIDE, and it is only offered after somebody has
    been shown what they are overriding — a warning nobody read is not a
    decision. The SERVER still refuses it without the grant.
  */
  it("shows a clash, then sends the override on the second save", async () => {
    bookings.create
      .mockRejectedValueOnce(
        /* Worded as the server actually words it — see `#describeClash`. */
        new ApiError("Mbak Sari sudah ada pekerjaan di jam yang sama", 409, {
          reason:
            "Bella bentrok dengan Coco (Bath & Blow) jam 10.00, BK-260902-004",
        }),
      )
      .mockResolvedValueOnce(created);

    renderWithAuth(<BookingForm />);

    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    /* The banner carries the whole thing: who, whose animal, and against what. */
    expect(await screen.findByText(/BK-260902-004/)).toBeInTheDocument();
    /*
      ONE ALERT CARRIES THE WHOLE THING — asserted on its text rather than by
      querying each name, because both appear in the alert AND in its wrapper.
    */
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Mbak Sari");
    expect(banner).toHaveTextContent("Bella bentrok dengan Coco");
    expect(bookings.create.mock.calls[0][0].forceClash).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create.mock.calls[1][0].forceClash).toBe(true),
    );
  });
});

/**
 * `/dashboard/booking/:id/edit` — the same form, correcting a booking.
 *
 * ONE COMPONENT DOES BOTH, the shape `PetForm` already uses. What these tests
 * pin is the three things that differ: `update` rather than `create`, no
 * `status` in the body, and a row already billed that cannot be touched.
 */
/**
 * ─── WHAT A CARD CARRIES ────────────────────────────────────────────────────
 *
 * One main service, the add-ons under it, a price that follows the animal, and
 * what it brought with it.
 */
describe("BookingForm — layanan, add-on dan varian", () => {
  const main = service({
    _id: "svc-1",
    name: "Grooming Full Service",
    serviceType: "main",
    addonServiceIds: ["svc-addon"],
    businessLineId: "line-1",
  });
  const addon = service({
    _id: "svc-addon",
    name: "Parfum",
    price: "20000.0000",
    durationMin: 10,
    serviceType: "addon",
  });

  beforeEach(() => {
    services.list.mockResolvedValue(page([main, addon]));
  });

  it("narrows its card's service list when a type is chosen", async () => {
    /*
      THE FILTER IS PER CARD: one visit may take a Grooming booking and a Hotel
      one, each on its own card.
    */
    services.list.mockResolvedValue(
      page([
        service({ _id: "svc-groom", name: "Full Grooming", businessLineId: "line-groom" }),
        service({ _id: "svc-hotel", name: "Penitipan", businessLineId: "line-hotel" }),
      ]),
    );

    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });

    await choose(/tipe layanan/i, "Grooming");
    await userEvent.click(screen.getByRole("combobox", { name: /^layanan$/i }));

    expect(
      await screen.findByRole("option", { name: /full grooming/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /penitipan/i }),
    ).not.toBeInTheDocument();
  });

  it("clears a service the new type no longer offers", async () => {
    // Leaving a name the list below cannot show is worse than asking again.
    services.list.mockResolvedValue(
      page([
        service({ _id: "svc-groom", name: "Full Grooming", businessLineId: "line-groom" }),
        service({ _id: "svc-hotel", name: "Penitipan", businessLineId: "line-hotel" }),
      ]),
    );

    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });

    await choose(/^layanan$/i, /full grooming/i);
    expect(
      screen.getByRole("combobox", { name: /^layanan$/i }),
    ).toHaveTextContent("Full Grooming");

    await choose(/tipe layanan/i, "Hotel");

    expect(
      screen.getByRole("combobox", { name: /^layanan$/i }),
    ).not.toHaveTextContent("Full Grooming");
  });

  it("keeps an add-on off the service list — it is not something to book alone", async () => {
    // The server refuses an add-on booked on its own, so offering it here would
    // be a choice that fails on save.
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });

    await userEvent.click(screen.getByRole("combobox", { name: /^layanan$/i }));

    expect(
      await screen.findByRole("option", { name: /grooming full service/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /^parfum$/i }),
    ).not.toBeInTheDocument();
  });

  it("offers the add-ons the chosen service lists, and sends the ticked ones on it", async () => {
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });

    await choose(/^layanan$/i, /grooming full service/i);
    await userEvent.click(await screen.findByLabelText(/parfum/i));
    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].bookings).toEqual([
      expect.objectContaining({
        serviceId: "svc-1",
        addonServiceIds: ["svc-addon"],
      }),
    ]);
  });

  it("offers ONE main service per card — a second is a card of its own", async () => {
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });

    expect(
      screen.getAllByRole("combobox", { name: /^layanan$/i }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /^tambah layanan$/i }),
    ).not.toBeInTheDocument();
  });

  it("prices a variant service from the animal's own size", async () => {
    pets.list.mockResolvedValue(
      page([{ _id: "pet-1", name: "Bruno", size: "large" } as unknown as Pet]),
    );
    services.list.mockResolvedValue(
      page([
        service({
          _id: "svc-1",
          name: "Full Grooming",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [
            { petType: null, sizeCategory: "small", furType: null, price: "100000.0000" },
            { petType: null, sizeCategory: "large", furType: null, price: "180000.0000" },
          ],
        } as unknown as Partial<Service>),
      ]),
    );

    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /full grooming/i);

    /*
      The price on the card is the LARGE one, because Bruno is large — and it
      appears TWICE: on the line, and in the action bar's total. That the two
      agree is the point, so both are asserted rather than one.
    */
    expect(await screen.findAllByText(/Rp\s?180[.,]000/)).toHaveLength(2);
    expect(screen.getByText(/varian besar/i)).toBeInTheDocument();
  });

  it("refuses to save when the animal lacks the fact the price varies by", async () => {
    // The server would refuse it; the button says which animal rather than
    // letting somebody press Simpan and read it off a banner.
    pets.list.mockResolvedValue(
      page([{ _id: "pet-1", name: "Bruno", size: null } as unknown as Pet]),
    );
    services.list.mockResolvedValue(
      page([
        service({
          _id: "svc-1",
          name: "Full Grooming",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [
            { petType: null, sizeCategory: "small", furType: null, price: "100000.0000" },
          ],
        } as unknown as Partial<Service>),
      ]),
    );

    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /full grooming/i);

    expect(await screen.findByText(/belum punya ukuran/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it("refuses to book an animal with no size, even on a flat-priced service", async () => {
    /*
      13 September 2026: commission is read against the animal's size, so the
      server refuses ANY booking for one without it — not only a service priced
      by size. The card names the animal and links to its form; Simpan says why.
    */
    pets.list.mockResolvedValue(page([{ ...pet, size: null } as unknown as Pet]));

    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    expect(await screen.findByText(/bruno belum punya ukuran/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /lengkapi ukuran bruno/i }),
    ).toHaveAttribute("target", "_blank");
    expect(screen.getByText(/ukuran bruno belum diisi/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
  });

  it("offers the way to fix it, opening beside the half-filled booking", async () => {
    /*
      Naming the missing fact still leaves somebody to find the animal through a
      menu, a search and a form they have never opened. The link is the door —
      and it opens in a NEW TAB because this form holds unsaved state and no
      draft: navigating away loses the customer and every service ticked so far.
    */
    pets.list.mockResolvedValue(
      page([{ _id: "pet-1", name: "Bruno", size: null } as unknown as Pet]),
    );
    services.list.mockResolvedValue(
      page([
        service({
          _id: "svc-1",
          name: "Full Grooming",
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [
            { petType: null, sizeCategory: "small", furType: null, price: "100000.0000" },
          ],
        } as unknown as Partial<Service>),
      ]),
    );

    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /full grooming/i);

    const fix = await screen.findByRole("link", { name: /lengkapi ukuran bruno/i });
    expect(fix).toHaveAttribute("href", "/dashboard/master/pets/pet-1/edit");
    expect(fix).toHaveAttribute("target", "_blank");
  });

  /*
    ─── A VARIANT SWITCHED OFF, AND ITS OWN LENGTH (13 September 2026) ────────

    The server refuses a NEW line whose variant is inactive, and a variant
    service has no duration of its own — each variant carries one.
  */
  const bySize = (large: { isActive: boolean }) =>
    service({
      _id: "svc-1",
      name: "Full Grooming",
      price: null,
      durationMin: null,
      hasVariants: true,
      variantAxes: ["sizeCategory"],
      variants: [
        {
          petType: null,
          sizeCategory: "small",
          furType: null,
          price: "100000.0000",
          durationMin: 60,
          isActive: true,
        },
        {
          petType: null,
          sizeCategory: "large",
          furType: null,
          price: "180000.0000",
          durationMin: 120,
          isActive: large.isActive,
        },
      ],
    } as unknown as Partial<Service>);

  it("refuses a new line on a switched-off variant, naming the service and the animal", async () => {
    pets.list.mockResolvedValue(
      page([{ _id: "pet-1", name: "Bruno", size: "large" } as unknown as Pet]),
    );
    services.list.mockResolvedValue(page([bySize({ isActive: false })]));

    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /full grooming/i);

    /* A word on the card, not a colour, and not the figure as a quote. */
    expect(await screen.findByText("Varian nonaktif")).toBeInTheDocument();
    expect(screen.queryByText(/Rp\s?180[.,]000/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/varian full grooming untuk bruno sedang nonaktif/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
  });

  it("shows the animal's own variant length, and finishes by it", async () => {
    pets.list.mockResolvedValue(
      page([{ _id: "pet-1", name: "Bruno", size: "large" } as unknown as Pet]),
    );
    services.list.mockResolvedValue(page([bySize({ isActive: true })]));

    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /full grooming/i);

    expect(
      await screen.findByRole("button", { name: /durasi 120 mnt/i }),
    ).toBeInTheDocument();
    /* The service itself has no length; without the variant's there is no
       finish time to show at all. */
    expect(screen.getByText(/selesai sekitar/i)).toBeInTheDocument();
  });
});

/**
 * ─── WHOSE FIELD IS THIS? ───────────────────────────────────────────────────
 *
 * The first version of the card was flat: a small grey caption over eight
 * controls, repeated. The question it produced from somebody using it was "ini
 * input buat hewan 1 atau hewan 2?" — so these pin what answers it.
 */
describe("BookingForm — telling one card from another", () => {
  beforeEach(() => {
    pets.list.mockResolvedValue(
      page([
        { _id: "pet-1", name: "Mochi", size: "small" } as Pet,
        { _id: "pet-2", name: "Coco", size: "medium" } as Pet,
      ]),
    );
  });

  it("numbers a card that has no animal yet, so it still says which it is", async () => {
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^hewan$/i });

    await userEvent.click(screen.getByRole("button", { name: /^tambah booking$/i }));

    expect(
      screen.getByRole("heading", { name: "Booking ke-1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Booking ke-2" }),
    ).toBeInTheDocument();
  });

  it("titles each card with its own animal once one is chosen", async () => {
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^hewan$/i });

    await choose(/^hewan$/i, "Mochi");
    await userEvent.click(screen.getByRole("button", { name: /^tambah booking$/i }));

    const pickers = screen.getAllByRole("combobox", { name: /^hewan$/i });
    await userEvent.click(pickers[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Coco" }));

    /*
      THE HEADER IS THE ANSWER. Each card carries its animal's name as its own
      title, so the fields under it need no repeating label to be placed.
    */
    const cards = screen.getAllByRole("listitem");
    /*
      ASKED FOR AS A HEADING, which is what the card's title now is — the name
      also appears inside each picker (and in the hidden native select Radix
      renders for form support), so plain text would match either.
    */
    expect(
      within(cards[0]).getByRole("heading", { name: "Mochi" }),
    ).toBeInTheDocument();
    expect(
      within(cards[1]).getByRole("heading", { name: "Coco" }),
    ).toBeInTheDocument();
  });

  it("keeps the note and the belongings folded away until they are wanted", async () => {
    // Most visits have neither, and eight controls per animal is what made the
    // card hard to read.
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^hewan$/i });

    /* The booking's own Catatan is always there; the ANIMAL's two are not. */
    expect(screen.getAllByLabelText(/^catatan$/i)).toHaveLength(1);
    expect(
      screen.queryByLabelText(/catatan internal/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/tambah barang bawaan/i),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getAllByRole("button", { name: /catatan & barang bawaan/i })[0],
    );

    /*
      TWO BOXES, EACH NAMING ITS AUDIENCE. The split is worth nothing if the
      person typing cannot tell from the label which one the owner reads.
    */
    expect(screen.getByLabelText(/catatan internal/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/catatan untuk pelanggan/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/tambah barang bawaan/i)).toBeInTheDocument();
  });

  it("opens the fold by itself when the booking already has something in it", async () => {
    /*
      Editing must not hide what was written last time behind a fold nobody knows
      to open.
    */
    bookings.getById.mockResolvedValue({
      _id: "bk-9",
      bookingNumber: "BK-260901-007",
      customerId: "cust-1",
      branchId: BRANCH_ID,
      scheduledAt: new Date("2026-09-03T09:00:00").toISOString(),
      status: "confirmed",
      notes: null,
      petId: "pet-1",
      belongings: [],
      internalNotes: "Takut hairdryer",
      customerNotes: null,
      pulledToCartAt: null,
      pulledToInvoiceAt: null,
      service: {
        serviceId: "svc-1",
        name: "Grooming Full Service",
        price: "150000.0000",
        durationMin: 90,
        sessions: [],
        addons: [],
      },
    } as unknown as Booking);
    customers.getById.mockResolvedValue(customer);

    renderWithAuth(<BookingForm bookingId="bk-9" />);

    expect(await screen.findByDisplayValue("Takut hairdryer")).toBeInTheDocument();
  });

  it("shows the catalogue's duration on a button rather than a box", async () => {
    // A receptionist disagreeing with the catalogue is the exception; the field
    // was in the way of every booking that agreed with it.
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    expect(screen.queryByLabelText(/durasi/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /durasi 90 mnt/i }));

    expect(screen.getByLabelText(/durasi/i)).toBeInTheDocument();
  });
});

/**
 * ─── COMING BACK FROM THE PET'S PAGE ────────────────────────────────────────
 *
 * The card offers a link to fill in a missing coat length, and it opens in
 * another tab because this form holds unsaved state. Without a refresh, the
 * booking tab is still holding the animal as it was loaded — the price stays
 * unquotable and Simpan stays disabled, and the only way out is a reload that
 * costs the whole booking.
 */
describe("BookingForm — re-reading an animal that was just corrected", () => {
  const withoutSize = { _id: "pet-1", name: "Bruno", size: null } as unknown as Pet;
  const withSize = { _id: "pet-1", name: "Bruno", size: "large" } as unknown as Pet;

  const variantService = () =>
    service({
      _id: "svc-1",
      name: "Full Grooming",
      price: null,
      hasVariants: true,
      variantAxes: ["sizeCategory"],
      variants: [
        { petType: null, sizeCategory: "large", furType: null, price: "180000.0000" },
      ],
    } as unknown as Partial<Service>);

  it("re-reads the animals when the tab is looked at again", async () => {
    services.list.mockResolvedValue(page([variantService()]));
    pets.list.mockResolvedValueOnce(page([withoutSize]));

    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /full grooming/i);

    expect(await screen.findByText(/belum punya ukuran/i)).toBeInTheDocument();

    /* The size is filled in on the other tab… */
    pets.list.mockResolvedValue(page([withSize]));
    /* …and somebody comes back to this one. */
    document.dispatchEvent(new Event("visibilitychange"));

    expect(await screen.findAllByText(/Rp\s?180[.,]000/)).not.toHaveLength(0);
    expect(screen.queryByText(/belum punya ukuran/i)).not.toBeInTheDocument();
  });

  it("re-reads them when an animal is picked, too", async () => {
    pets.list.mockResolvedValue(
      page([
        { _id: "pet-1", name: "Mochi", size: "small" } as Pet,
        { _id: "pet-2", name: "Coco", size: "medium" } as Pet,
      ]),
    );

    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^hewan$/i });

    const before = pets.list.mock.calls.length;
    await choose(/^hewan$/i, "Coco");

    await waitFor(() =>
      expect(pets.list.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it("does not blank the half-filled cards while it refreshes", async () => {
    /*
      THE TRAP THIS AVOIDS. The loader that runs when a customer is picked sets
      `loadingPets`, and the render swaps the whole list of animal cards for a
      spinner while it is true — so refreshing through it would wipe the services
      ticked and the notes typed, on a form somebody is in the middle of.
    */
    services.list.mockResolvedValue(page([service()]));
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    /* A refresh that never resolves: the cards must survive it regardless. */
    pets.list.mockReturnValue(new Promise(() => {}) as never);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(
      screen.getByRole("combobox", { name: /^layanan$/i }),
    ).toHaveTextContent("Grooming Full Service");
    expect(screen.queryByText(/memuat hewan/i)).not.toBeInTheDocument();
  });
});

describe("BookingForm — lokasi, antar-jemput dan barang bawaan", () => {
  it("asks about antar-jemput for a salon visit and sends it", async () => {
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    await userEvent.click(screen.getByLabelText(/dijemput/i));
    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0]).toMatchObject({
      location: "in_store",
      pickupRequested: true,
      deliveryRequested: false,
    });
  });

  it("stops asking about antar-jemput once the visit is a house call", async () => {
    // The salon is already going to the animal; collecting it first is a
    // journey to nowhere, and the server forces both flags off anyway.
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });

    await choose(/lokasi layanan/i, /di rumah pelanggan/i);

    expect(screen.queryByLabelText(/dijemput/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/diantar pulang/i)).not.toBeInTheDocument();
  });

  it("sends the belongings under the animal that brought them", async () => {
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    /* Behind the fold: most visits have neither a note nor anything handed
       over, so the card does not show either until asked. */
    await userEvent.click(
      screen.getByRole("button", { name: /catatan & barang bawaan/i }),
    );
    await userEvent.type(
      screen.getByLabelText(/tambah barang bawaan/i),
      "Carrier biru",
    );
    await userEvent.click(screen.getByRole("button", { name: /^tambah$/i }));
    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    /* ON THE CARD'S OWN ENTRY — no `petId` to name, the entry already has one. */
    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].bookings[0].belongings).toEqual([
      { name: "Carrier biru" },
    ]);
  });

  it("keeps the two apart in the payload", async () => {
    /*
      THE ONE FAILURE THAT WOULD MATTER. If the card wired both boxes to one
      field, or crossed them, an internal remark would be stored in the half the
      product intends to show an owner — and nothing downstream could tell.
    */
    renderWithAuth(<BookingForm />);
    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    await userEvent.click(
      screen.getByRole("button", { name: /catatan & barang bawaan/i }),
    );
    await userEvent.type(
      screen.getByLabelText(/catatan internal/i),
      "Pemiliknya suka ngeyel soal harga",
    );
    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].bookings[0]).toMatchObject({
      internalNotes: "Pemiliknya suka ngeyel soal harga",
      customerNotes: null,
    });
  });
});

describe("BookingForm — mengubah booking", () => {
  const existing = {
    _id: "bk-9",
    bookingNumber: "BK-260901-007",
    customerId: "cust-1",
    branchId: BRANCH_ID,
    // 09:00 local. Read through UTC this lands the previous day east of London.
    scheduledAt: new Date("2026-09-03T09:00:00").toISOString(),
    status: "confirmed",
    notes: "Alergi sampo biasa",
    petId: "pet-1",
    belongings: [],
    internalNotes: null,
    customerNotes: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    groomerName: "Belum ditentukan",
    service: {
      serviceId: "svc-1",
      name: "Grooming Full Service",
      price: "150000.0000",
      durationMin: 90,
      sessions: [],
      addons: [],
    },
  } as unknown as Booking;

  beforeEach(() => {
    bookings.getById.mockResolvedValue(existing);
    customers.getById.mockResolvedValue(customer);
    bookings.update.mockResolvedValue(existing);
  });

  it("does not offer 'simpan sebagai draf' when editing", async () => {
    /*
      PUSHING A LIVE BOOKING BACK DOWN TO A DRAFT is a move the ladder does not
      have, and `PATCH` carries no status at all — a button that looked like it
      could would be refused every time it was pressed.
    */
    renderWithAuth(<BookingForm bookingId="bk-9" />);

    await screen.findByRole("button", { name: /simpan booking/i });

    expect(
      screen.queryByRole("button", { name: /simpan sebagai draf/i }),
    ).not.toBeInTheDocument();
  });

  it("shows exactly one card, and no way to add another", async () => {
    /*
      THE EDIT PAGE CORRECTS ONE BOOKING. A second animal for the same visit is a
      booking of its own, made from the new-booking form.
    */
    renderWithAuth(<BookingForm bookingId="bk-9" />);

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /^layanan$/i })).toHaveTextContent(
        "Grooming Full Service",
      ),
    );

    expect(screen.getAllByRole("combobox", { name: /^hewan$/i })).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /tambah booking/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^hapus/i }),
    ).not.toBeInTheDocument();
  });

  it("loads the booking into the form and saves through update, not create", async () => {
    renderWithAuth(<BookingForm bookingId="bk-9" />);

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /^layanan$/i })).toHaveTextContent(
        "Grooming Full Service",
      ),
    );

    /*
      THE WALL CLOCK, NOT UTC. The calendar shipped with exactly this bug once:
      splitting a stored instant through `toISOString` moves a Jakarta morning to
      the previous day, and the form would save the booking a day early.
    */
    expect(screen.getByLabelText(/tanggal/i)).toHaveValue("2026-09-03");
    expect(screen.getByLabelText(/jam/i)).toHaveValue("09:00");
    expect(screen.getByText(/ibu rina/i)).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /simpan booking/i }),
    );

    await waitFor(() => expect(bookings.update).toHaveBeenCalled());
    expect(bookings.create).not.toHaveBeenCalled();

    const [id, patch] = bookings.update.mock.calls[0];
    expect(id).toBe("bk-9");
    /* FLAT FIELDS — one booking, so no `bookings[]` and no `items[]`. */
    expect(patch).toMatchObject({
      customerId: "cust-1",
      petId: "pet-1",
      serviceId: "svc-1",
      /* Loaded with none ticked, and sent back the same — the round trip that
         must not quietly drop an add-on. See bookingDraft.test.ts. */
      addonServiceIds: [],
      groomerUserId: null,
      durationMin: 90,
      internalNotes: null,
      customerNotes: null,
      belongings: [],
    });
    expect(patch).not.toHaveProperty("bookings");
    /*
      `status` MUST NOT BE IN THE BODY. PATCH has no such field — a transition
      has rules a `$set` cannot express, so it moves through its own route. Joi
      would refuse the whole save over a key nobody meant to send.
    */
    expect(patch).not.toHaveProperty("status");
  });

  it("goes back to the booking it corrected, not to the list", async () => {
    renderWithAuth(<BookingForm bookingId="bk-9" />);

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /^layanan$/i })).toHaveTextContent(
        "Grooming Full Service",
      ),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /simpan booking/i }),
    );

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/booking/bk-9"),
    );
  });

  it("says that saving re-prices at today's rates", async () => {
    renderWithAuth(<BookingForm bookingId="bk-9" />);

    /*
      SAID BEFORE IT HAPPENS. The server re-snapshots every unbilled row at the
      current catalogue price, so a booking taken before a price rise and
      corrected after one costs the customer more — including rows nobody
      touched. Discovering that on the bill is how a shop loses an argument.
    */
    expect(
      await screen.findByText(/harga layanan hari ini/i),
    ).toBeInTheDocument();
  });

  it("locks a booking that has already been billed", async () => {
    bookings.getById.mockResolvedValue({
      ...existing,
      pulledToInvoiceAt: "2026-09-01T04:00:00.000Z",
    } as unknown as Booking);

    renderWithAuth(<BookingForm bookingId="bk-9" />);

    /*
      PRD 2.12: work already on a bill cannot change under the bill, or the
      appointment and the invoice stop agreeing about what was done. The card
      says so, and its service and animal cannot be changed.
    */
    const card = (await screen.findAllByRole("listitem"))[0];
    expect(within(card).getAllByText(/sudah ditagih/i).length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(
        within(card).getByRole("combobox", { name: /^layanan$/i }),
      ).toBeDisabled(),
    );
    expect(within(card).getByRole("combobox", { name: /^hewan$/i })).toBeDisabled();

    /* And the owner is pinned: emptying the animal would empty the billed one. */
    expect(screen.getByRole("button", { name: /ganti/i })).toBeDisabled();
  });

  /*
    THE SERVER LETS A PAIR ALREADY ON THE BOOKING THROUGH when its variant was
    switched off since (13 September 2026). Blocking it here would refuse the
    correction of an old booking's time over a service nobody touched.
  */
  it("keeps a service already on the booking whose variant was switched off since", async () => {
    services.list.mockResolvedValue(
      page([
        service({
          _id: "svc-1",
          name: "Grooming Full Service",
          price: null,
          durationMin: null,
          hasVariants: true,
          variantAxes: ["sizeCategory"],
          variants: [
            {
              petType: null,
              sizeCategory: "medium",
              furType: null,
              price: "150000.0000",
              durationMin: 90,
              isActive: false,
            },
          ],
        } as unknown as Partial<Service>),
      ]),
    );

    renderWithAuth(<BookingForm bookingId="bk-9" />);

    expect(
      await screen.findByText(/varian nonaktif, tetap berlaku di booking ini/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/sedang nonaktif/i)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /simpan booking/i }),
      ).toBeEnabled(),
    );
  });

  it("does not ask for a status, which moves through its own route", async () => {
    renderWithAuth(<BookingForm bookingId="bk-9" />);

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /^layanan$/i })).toHaveTextContent(
        "Grooming Full Service",
      ),
    );

    expect(
      screen.queryByRole("combobox", { name: /^status$/i }),
    ).not.toBeInTheDocument();
  });
});

/**
 * NOBODY MARKED AS A GROOMER — a dead end with a signpost.
 *
 * The dropdown reads `users.isGroomer`, and a tenant that has never ticked the
 * box for anybody gets an empty list. An empty dropdown with no explanation is
 * the worst version of this: it looks broken, and the fix — one checkbox on a
 * staff page — is nowhere in sight.
 */
describe("BookingForm — when no staff are marked as groomers", () => {
  it("says so, and says where to fix it", async () => {
    bookings.availability.mockResolvedValue([]);

    renderWithAuth(<BookingForm />);

    expect(
      await screen.findByText(/ditandai sebagai/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/master data/i)).toBeInTheDocument();
  });

  it("still lets the booking be taken", async () => {
    /*
      NOT A BLOCKER. "Belum ditentukan" is a real state (FR-3) — a booking taken
      over the phone on Monday for Thursday often has no groomer decided yet.
    */
    bookings.availability.mockResolvedValue([]);

    renderWithAuth(<BookingForm />);

    await pickCustomer();
    await screen.findByRole("combobox", { name: /^layanan$/i });
    await choose(/^layanan$/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].bookings[0].groomerUserId).toBeNull();
  });
});
