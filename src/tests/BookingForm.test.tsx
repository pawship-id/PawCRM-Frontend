import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingForm } from "@/features/booking";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { userService } from "@/services/user.service";
import type { Booking, Customer, Pet, Service, User } from "@/types/api";

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

const created = { _id: "bk-1", bookingNumber: "BK-260826-001" } as Booking;

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
 * till, which cannot answer the phone call that books Thursday. It was a DIALOG
 * on the list until a booking could hold several animals — three animals is
 * three cards of five controls each, and a dialog holding that is a form
 * scrolling inside a scrolling page.
 */
describe("BookingForm", () => {
  it("sends who, which animals, what services and when", async () => {
    renderWithAuth(
      <BookingForm />,
    );

    await pickCustomer();

    // One pet, so the first card is filled in — the click removed from every
    // booking a shop with single-dog customers ever takes.
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /hewan/i })).toHaveTextContent(
        "Bruno",
      ),
    );

    await choose(/layanan/i, /grooming full service/i);

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
          THE ANIMAL IS ON THE ROW since PCR-040, and no price crosses the wire:
          the server snapshots it from the catalogue. `durationMin` is undefined
          because nobody typed over the catalogue's ninety minutes.
        */
        items: [
          {
            petId: "pet-1",
            serviceId: "svc-1",
            groomerUserId: null,
            durationMin: undefined,
            notes: null,
          },
        ],
        // The two fields mean WALL-CLOCK TIME in the shop's own zone.
        scheduledAt: new Date("2026-09-03T10:30").toISOString(),
        status: "confirmed",
        notes: null,
      }),
    );
    // Back to the list, which re-asks the server rather than splicing a row in.
    // Back to the list, which re-asks the server rather than splicing a row in.
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/booking"));
  });

  /*
    THE CASE PCR-041 EXISTS FOR. Bu Lisa arrives with Mochi and Coco: one form,
    one booking, one number. Before this the dialog made two — two rounds of the
    same six fields, and two rows on a day sheet that could not tell they were
    one arrival.
  */
  it("sends two animals on one booking", async () => {
    pets.list.mockResolvedValue(
      page([
        { _id: "pet-1", name: "Mochi" } as Pet,
        { _id: "pet-2", name: "Coco" } as Pet,
      ]),
    );
    services.list.mockResolvedValue(
      page([service(), service({ _id: "svc-2", name: "Bath & Blow", price: "95000.0000" })]),
    );

    renderWithAuth(
      <BookingForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /hewan/i });

    await choose(/hewan/i, "Mochi");
    await choose(/layanan/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /^tambah hewan$/i }));

    const cards = screen.getAllByRole("combobox", { name: /hewan/i });
    await userEvent.click(cards[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Coco" }));

    const serviceSelects = screen.getAllByRole("combobox", { name: /layanan/i });
    await userEvent.click(serviceSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: /bath & blow/i }));

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());

    const sent = bookings.create.mock.calls[0][0];
    expect(sent.items).toHaveLength(2);
    expect(sent.items.map((item) => item.petId)).toEqual(["pet-1", "pet-2"]);
    expect(sent.items.map((item) => item.serviceId)).toEqual(["svc-1", "svc-2"]);
  });

  /*
    THE SAME ANIMAL TWICE FOR THE SAME SERVICE is two identical rows — nothing on
    the day sheet could tell them apart, and each would need its own groomer. The
    message NAMES the animal: with four cards on screen, "one of these is wrong"
    is a puzzle rather than a message (PRD 2.7).
  */
  it("refuses the same animal twice for the same service, and says which", async () => {
    renderWithAuth(
      <BookingForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /layanan/i });
    await choose(/layanan/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /^tambah hewan$/i }));

    const petSelects = screen.getAllByRole("combobox", { name: /hewan/i });
    await userEvent.click(petSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Bruno" }));

    const serviceSelects = screen.getAllByRole("combobox", { name: /layanan/i });
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
        { _id: "pet-1", name: "Mochi" } as Pet,
        { _id: "pet-2", name: "Coco" } as Pet,
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
    await screen.findByRole("combobox", { name: /hewan/i });

    fireEvent.change(screen.getByLabelText(/jam/i), { target: { value: "10:00" } });

    await choose(/hewan/i, "Mochi");
    await choose(/layanan/i, /grooming full service/i);
    await choose(/groomer/i, "Mbak Sari");

    await userEvent.click(screen.getByRole("button", { name: /^tambah hewan$/i }));

    const petSelects = screen.getAllByRole("combobox", { name: /hewan/i });
    await userEvent.click(petSelects[1]);
    await userEvent.click(await screen.findByRole("option", { name: "Coco" }));

    const serviceSelects = screen.getAllByRole("combobox", { name: /layanan/i });
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
      await screen.findByText(/setiap hewan harus punya layanan/i),
    ).toBeInTheDocument();
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it("sends the groomer somebody assigned", async () => {
    renderWithAuth(
      <BookingForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /layanan/i });
    await choose(/layanan/i, /grooming full service/i);
    await choose(/groomer/i, "Mbak Sari");

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [expect.objectContaining({ groomerUserId: "user-1" })],
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
    await screen.findByRole("combobox", { name: /layanan/i });
    await choose(/layanan/i, /grooming full service/i);

    expect(
      screen.queryByRole("combobox", { name: /groomer/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [expect.objectContaining({ groomerUserId: null })],
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
            // AFTER FR-1 the animal is a row, so the field points at `items`.
            field: "body.items",
            message: "This pet belongs to a different customer",
          },
        ],
      }),
    );

    renderWithAuth(
      <BookingForm />,
    );

    await pickCustomer();
    await screen.findByRole("combobox", { name: /layanan/i });
    await choose(/layanan/i, /grooming full service/i);
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

  it("offers only the two states a booking can start in", async () => {
    renderWithAuth(
      <BookingForm />,
    );

    await userEvent.click(screen.getByRole("combobox", { name: /status/i }));

    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "Dikonfirmasi" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Draft" })).toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: /selesai|batal/i })).toBeNull();
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
    await screen.findByRole("combobox", { name: /layanan/i });
    await choose(/layanan/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/booking"));
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
    await screen.findByRole("combobox", { name: /layanan/i });

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
    await screen.findByRole("combobox", { name: /layanan/i });
    await choose(/layanan/i, /grooming full service/i);

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
    items: [
      {
        _id: "it-1",
        petId: "pet-1",
        serviceId: "svc-1",
        name: "Grooming Full Service",
        price: "150000.0000",
        durationMin: 90,
        notes: null,
        groomerUserId: null,
        groomerName: "Belum ditentukan",
        pulledToCartAt: null,
        pulledToInvoiceAt: null,
      },
    ],
  } as unknown as Booking;

  beforeEach(() => {
    bookings.getById.mockResolvedValue(existing);
    customers.getById.mockResolvedValue(customer);
    bookings.update.mockResolvedValue(existing);
  });

  it("loads the booking into the form and saves through update, not create", async () => {
    renderWithAuth(<BookingForm bookingId="bk-9" />);

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /layanan/i })).toHaveTextContent(
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
      screen.getByRole("button", { name: /simpan perubahan/i }),
    );

    await waitFor(() => expect(bookings.update).toHaveBeenCalled());
    expect(bookings.create).not.toHaveBeenCalled();

    const [id, patch] = bookings.update.mock.calls[0];
    expect(id).toBe("bk-9");
    expect(patch.customerId).toBe("cust-1");
    expect(patch.items).toEqual([
      {
        petId: "pet-1",
        serviceId: "svc-1",
        groomerUserId: null,
        durationMin: 90,
        notes: null,
      },
    ]);
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
      expect(screen.getByRole("combobox", { name: /layanan/i })).toHaveTextContent(
        "Grooming Full Service",
      ),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /simpan perubahan/i }),
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

  it("locks a row that has already been billed and refuses to let it go", async () => {
    bookings.getById.mockResolvedValue({
      ...existing,
      items: [
        { ...existing.items[0], pulledToInvoiceAt: "2026-09-01T04:00:00.000Z" },
        {
          ...existing.items[0],
          _id: "it-2",
          serviceId: "svc-2",
          name: "Potong Kuku",
        },
      ],
    } as unknown as Booking);
    services.list.mockResolvedValue(
      page([service(), service({ _id: "svc-2", name: "Potong Kuku" })]),
    );

    renderWithAuth(<BookingForm bookingId="bk-9" />);

    expect(await screen.findByText(/sudah ditagih/i)).toBeInTheDocument();

    /*
      NO REMOVE BUTTON ON THE BILLED ROW, and one on the other. PRD 2.12: work
      already on a bill cannot leave the booking it was billed from, or the
      appointment and the invoice stop agreeing about what was done.
    */
    const cards = screen.getAllByRole("listitem");
    expect(
      within(cards[0]).queryByRole("button", { name: /hapus/i }),
    ).not.toBeInTheDocument();
    expect(
      within(cards[1]).getByRole("button", { name: /hapus/i }),
    ).toBeInTheDocument();

    /* And the owner is pinned: emptying his animals would empty the billed one. */
    expect(screen.getByRole("button", { name: /ganti/i })).toBeDisabled();
  });

  it("does not ask for a status, which moves through its own route", async () => {
    renderWithAuth(<BookingForm bookingId="bk-9" />);

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /layanan/i })).toHaveTextContent(
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
    await screen.findByRole("combobox", { name: /layanan/i });
    await choose(/layanan/i, /grooming full service/i);

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].items[0].groomerUserId).toBeNull();
  });
});
