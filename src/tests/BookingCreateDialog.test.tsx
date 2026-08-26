import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingCreateDialog } from "@/features/booking";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { userService } from "@/services/user.service";
import type { Booking, Customer, Pet, Service, User } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/service.service");
jest.mock("@/services/user.service");

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const customers = customerService as jest.Mocked<typeof customerService>;
const pets = petService as jest.Mocked<typeof petService>;
const services = serviceService as jest.Mocked<typeof serviceService>;
const users = userService as jest.Mocked<typeof userService>;

const page = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
});

const customer = {
  _id: "cust-1",
  name: "Ibu Rina",
  phone: "0812-3456-7890",
} as Customer;

const pet = { _id: "pet-1", name: "Bruno" } as Pet;

const service = (overrides: Partial<Service> = {}) =>
  ({
    _id: "svc-1",
    name: "Grooming Full Service",
    price: "150000.0000",
    isActive: true,
    ...overrides,
  }) as Service;

const groomer = { _id: "user-1", fullName: "Mbak Sari" } as User;

const created = { _id: "bk-1", bookingNumber: "BK-260826-001" } as Booking;

beforeEach(() => {
  jest.clearAllMocks();
  customers.list.mockResolvedValue(page([customer]));
  pets.list.mockResolvedValue(page([pet]));
  services.list.mockResolvedValue(page([service()]));
  users.list.mockResolvedValue(page([groomer]));
  bookings.create.mockResolvedValue(created);
});

/** Chooses Ibu Rina through the picker the dialog opens. */
async function pickCustomer() {
  await userEvent.click(screen.getByRole("button", { name: /pilih pelanggan/i }));
  await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));
}

/**
 * Until this dialog existed the only way to make a booking was to sell it at the
 * till, which cannot answer the phone call that books Thursday.
 */
describe("BookingCreateDialog", () => {
  it("sends who, which animal, what service and when", async () => {
    const onCreated = jest.fn();
    renderWithAuth(
      <BookingCreateDialog open onOpenChange={jest.fn()} onCreated={onCreated} />,
    );

    await pickCustomer();

    // One pet, so it is pre-selected — the click removed from every booking.
    expect(
      await screen.findByRole("button", { name: "Bruno", pressed: true }),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByLabelText("Grooming Full Service"));

    fireEvent.change(screen.getByLabelText(/tanggal/i), {
      target: { value: "2026-09-03" },
    });
    fireEvent.change(screen.getByLabelText(/jam/i), {
      target: { value: "10:30" },
    });

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith({
        customerId: "cust-1",
        petId: "pet-1",
        // No price crosses the wire: the server snapshots it from the catalogue.
        items: [{ serviceId: "svc-1", groomerUserId: null }],
        // The two fields mean WALL-CLOCK TIME in the shop's own zone.
        scheduledAt: new Date("2026-09-03T10:30").toISOString(),
        status: "confirmed",
        notes: null,
      }),
    );
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("names the field that is still missing rather than leaving a dead button", async () => {
    renderWithAuth(
      <BookingCreateDialog open onOpenChange={jest.fn()} onCreated={jest.fn()} />,
    );

    expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
    expect(screen.getByText(/pelanggan belum dipilih/i)).toBeInTheDocument();

    await pickCustomer();

    expect(
      await screen.findByText(/belum ada layanan yang dipilih/i),
    ).toBeInTheDocument();
    expect(bookings.create).not.toHaveBeenCalled();
  });

  it("sends the groomer somebody assigned", async () => {
    renderWithAuth(
      <BookingCreateDialog open onOpenChange={jest.fn()} onCreated={jest.fn()} />,
    );

    await pickCustomer();
    await userEvent.click(await screen.findByLabelText("Grooming Full Service"));

    await userEvent.click(
      screen.getByRole("combobox", { name: /groomer untuk grooming full service/i }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Mbak Sari" }),
    );

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ serviceId: "svc-1", groomerUserId: "user-1" }],
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
    users.list.mockRejectedValue(new ApiError("Forbidden", 403));

    renderWithAuth(
      <BookingCreateDialog open onOpenChange={jest.fn()} onCreated={jest.fn()} />,
    );

    await pickCustomer();
    await userEvent.click(await screen.findByLabelText("Grooming Full Service"));

    expect(screen.queryByText(/groomer/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [{ serviceId: "svc-1", groomerUserId: null }],
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
            field: "body.petId",
            message: "This pet belongs to a different customer",
          },
        ],
      }),
    );

    renderWithAuth(
      <BookingCreateDialog open onOpenChange={jest.fn()} onCreated={jest.fn()} />,
    );

    await pickCustomer();
    await userEvent.click(await screen.findByLabelText("Grooming Full Service"));
    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    expect(
      await screen.findByText(/this pet belongs to a different customer/i),
    ).toBeInTheDocument();
  });

  /* A booking is booked to the session's branch, and a user who reaches every
     branch signs in pointed at none of them. */
  it("says to pick a branch before anything else", () => {
    renderWithAuth(
      <BookingCreateDialog open onOpenChange={jest.fn()} onCreated={jest.fn()} />,
      { session: { currentBranchId: null } },
    );

    expect(screen.getByText(/pilih cabang dulu/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
  });

  it("offers only the two states a booking can start in", async () => {
    renderWithAuth(
      <BookingCreateDialog open onOpenChange={jest.fn()} onCreated={jest.fn()} />,
    );

    await userEvent.click(screen.getByRole("combobox", { name: /status/i }));

    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByRole("option", { name: "Dikonfirmasi" })).toBeInTheDocument();
    expect(within(listbox).getByRole("option", { name: "Draft" })).toBeInTheDocument();
    expect(within(listbox).queryByRole("option", { name: /selesai|batal/i })).toBeNull();
  });
});
