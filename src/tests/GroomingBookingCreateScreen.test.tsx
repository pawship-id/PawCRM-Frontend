import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomingBookingCreateScreen } from "@/features/grooming";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import { businessLineService } from "@/services/businessLine.service";
import { customerService } from "@/services/customer.service";
import { membershipService } from "@/services/membership.service";
import { petService } from "@/services/pet.service";
import { ApiError } from "@/services/api-error";
import { serviceService } from "@/services/service.service";
import { tenantService } from "@/services/tenant.service";
import { variantOptionService } from "@/services/variantOption.service";
import { zoneService } from "@/services/zone.service";
import type {
  Booking,
  CreateBookingResult,
  Customer,
  Pet,
  Service,
  Tenant,
  Zone,
} from "@/types/api";
import type {
  BenefitCandidate,
  BenefitQuoteResponse,
  BookingBenefitQuoteInput,
  PetMembership,
} from "@/types/membership";
import { swalToast } from "@/lib/swal";

import { petOptionService } from "@/services/petOption.service";

import { petOptionId, primePetOptions } from "./helpers/petOptions";
import { renderWithAuth } from "./helpers/renderWithAuth";
import {
  BUILT_IN_VARIANT_OPTIONS,
  makeVariantOption,
  primeVariantOptions,
} from "./helpers/variantOptions";

jest.mock("@/services/booking.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/service.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/services/variantOption.service");
jest.mock("@/services/zone.service");
jest.mock("@/services/tenant.service");
jest.mock("@/services/petOption.service");
jest.mock("@/services/membership.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: jest.fn() }),
  usePathname: () => "/dashboard/service/grooming/new",
}));

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const customers = customerService as jest.Mocked<typeof customerService>;
const pets = petService as jest.Mocked<typeof petService>;
const services = serviceService as jest.Mocked<typeof serviceService>;
const branches = branchService as jest.Mocked<typeof branchService>;
const businessLines = businessLineService as jest.Mocked<typeof businessLineService>;
const tenants = tenantService as jest.Mocked<typeof tenantService>;
const memberships = membershipService as jest.Mocked<typeof membershipService>;

const BRANCH_ID = "branch-1";

const page = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
});

const customer = { _id: "cust-1", name: "Ibu Rina", phone: "0812-3456-7890" } as Customer;

const pet = {
  _id: "pet-1",
  name: "Bruno",
  size: "opt-size-sedang",
  breed: null,
  furType: null,
  weightKg: 6,
  preferences: { text: null, tags: [] },
  medical: {
    allergies: [],
    conditions: [],
    medications: [],
    vaccinations: [],
    vet: { clinicName: null, phone: null },
  },
} as unknown as Pet;

const grooming = {
  _id: "svc-1",
  name: "Basic Grooming",
  price: "150000.0000",
  durationMin: 90,
  isActive: true,
  hasVariants: false,
  variants: [],
  variantAxes: [],
  serviceType: "main",
  /* What the Layanan picker narrows by — never the lini bisnis. */
  serviceKind: "grooming",
  businessLineId: "line-groom",
  serviceLocations: [],
  addonServiceIds: [],
} as unknown as Service;

const created = {
  groupId: "grp-1",
  bookings: [{ _id: "bk-1", bookingNumber: "BK-260915-001" } as Booking],
} as CreateBookingResult;

beforeEach(() => {
  jest.clearAllMocks();
  customers.list.mockResolvedValue(page([customer]));
  pets.list.mockResolvedValue(page([pet]));
  services.list.mockResolvedValue(page([grooming]));
  bookings.create.mockResolvedValue(created);
  bookings.availability.mockResolvedValue([]);
  tenants.me.mockResolvedValue({ settings: {} } as Tenant);
  /* Nobody holds a card unless a test says so — the field stays hidden. */
  memberships.listMemberships.mockResolvedValue(page([]) as never);
  memberships.quoteBooking.mockResolvedValue({ cards: [], lines: [] });
  branches.list.mockResolvedValue(page([{ _id: BRANCH_ID, name: "Cibubur" }]) as never);
  businessLines.list.mockResolvedValue(
    page([{ _id: "line-groom", name: "Grooming" }]) as never,
  );
  /*
    THE TENANT'S VOCABULARY HAS TO BE LOADED, because a variant's axes are
    pet-option IDS since 25 September 2026 and an id resolves to a word only
    through this list. There used to be a table of seeded labels to fall back
    on; with ids there is nothing to fall back to, which is why the app loads
    the list on mount and why this suite now has to as well.
  */
  primePetOptions(petOptionService.list);
  primeVariantOptions(variantOptionService.list, zoneService.list);
});

/** Ibu Rina, Bruno, Basic Grooming — the smallest booking there is. */
async function fillIn() {
  await userEvent.click(
    screen.getByRole("button", { name: /cari nama atau nomor whatsapp/i }),
  );
  await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));

  await userEvent.click(await screen.findByRole("button", { name: /bruno/i }));

  await userEvent.click(screen.getByRole("button", { name: "Layanan" }));
  await userEvent.click(await screen.findByRole("option", { name: /basic grooming/i }));

  fireEvent.change(screen.getByLabelText(/tanggal/i), { target: { value: "2026-09-16" } });
  fireEvent.change(screen.getByLabelText(/jam mulai/i), { target: { value: "10:30" } });
}

/**
 * Layanan › Grooming › Booking baru — `/dashboard/service/grooming/new`.
 *
 * WHAT IS PINNED HERE:
 *  - one `bookings[]` entry per picked animal, and no price or discount crosses
 *    the wire when nobody typed one;
 *  - somebody holding `bookings:setPrice` sends what they TYPED;
 *  - somebody without it sees the catalogue's price, and nothing to type into.
 */
describe("GroomingBookingCreateScreen", () => {
  it("sends one booking per animal, as requested, without prices nobody typed", async () => {
    renderWithAuth(<GroomingBookingCreateScreen />);

    await fillIn();
    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() =>
      expect(bookings.create).toHaveBeenCalledWith({
        customerId: "cust-1",
        branchId: BRANCH_ID,
        scheduledAt: new Date("2026-09-16T10:30").toISOString(),
        status: "requested",
        location: "in_store",
        forceClash: false,
        bookingDiscount: null,
        bookings: [
          {
            petId: "pet-1",
            serviceId: "svc-1",
            addonServiceIds: [],
            groomerUserId: null,
            internalNotes: null,
            price: null,
            discount: null,
            plannedBenefit: null,
          },
        ],
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/booking/bk-1"));
  });

  it("sends the typed price and discount for somebody holding bookings:setPrice", async () => {
    renderWithAuth(<GroomingBookingCreateScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["create", "read", "setPrice"] }],
    });

    await fillIn();

    fireEvent.change(screen.getByLabelText("Harga dasar"), { target: { value: "120.000" } });
    fireEvent.change(screen.getByLabelText("Diskon"), { target: { value: "5.000" } });

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].bookings[0]).toMatchObject({
      price: "120000",
      discount: { mode: "amount", value: "5000" },
    });
  });

  /*
    THE PAGE STAYS SCROLLABLE WHILE A LIST IS OPEN (15 September 2026). Radix
    Select locked it; the popover does not, and closes as soon as the page moves
    — but not while somebody scrolls the list itself.
  */
  it("closes the groomer list when the page scrolls, not when the list does", async () => {
    bookings.availability.mockResolvedValue([
      { _id: "user-1", fullName: "Sinta", groomerLevel: "senior", offReason: null },
    ]);
    renderWithAuth(<GroomingBookingCreateScreen />);

    await fillIn();

    /*
      jsdom measures every element as 0×0 at the top of the page, which reads to
      `useCloseBehindShellHeader` as a trigger already under the navbar — so ANY
      scroll would close the list. Put the trigger mid-screen, where it is in a
      browser, so this tests the page-scroll rule and nothing else.
    */
    const rect = jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockReturnValue({
        top: 400,
        bottom: 444,
        left: 0,
        right: 600,
        width: 600,
        height: 44,
        x: 0,
        y: 400,
        toJSON: () => ({}),
      } as DOMRect);

    try {
      await userEvent.click(await screen.findByRole("button", { name: "Groomer" }));
      const list = await screen.findByRole("listbox");

      /* The level rides beside the name, as the mockup writes it. */
      expect(screen.getByRole("option", { name: "Sinta · Senior" })).toBeInTheDocument();

      fireEvent.scroll(list);
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      fireEvent.scroll(document);
      await waitFor(() =>
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
      );
    } finally {
      rect.mockRestore();
    }
  });

  /* Under "Bruno · Basic Grooming": the variant, coat before size, in smaller type. */
  it("names the variant in the summary — coat, then size", async () => {
    services.list.mockResolvedValue(
      page([
        {
          ...grooming,
          price: null,
          hasVariants: true,
          variantAxes: ["sizeCategory", "furType"],
          variants: [
            {
              petType: null,
              sizeCategory: petOptionId("size", "Sedang"),
              furType: petOptionId("furType", "Bulu panjang"),
              price: "180000.0000",
              durationMin: 90,
              isActive: true,
            },
          ],
        } as unknown as Service,
      ]),
    );
    pets.list.mockResolvedValue(
      page([
        {
          ...pet,
          furType: petOptionId("furType", "Bulu panjang"),
          furTypeLabel: "Bulu panjang",
        } as Pet,
      ]),
    );

    renderWithAuth(<GroomingBookingCreateScreen />);

    await fillIn();

    /*
      THE TENANT'S OWN WORDS, from the fixture list — there is no table of
      seeded labels to fall back to since options lost their codes
      (25 September 2026), and a label is the only word an option has.
    */
    expect(
      await screen.findByText("Bulu panjang · Sedang"),
    ).toBeInTheDocument();
  });

  it("shows the catalogue's price read-only without bookings:setPrice", async () => {
    renderWithAuth(<GroomingBookingCreateScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["create", "read"] }],
    });

    await fillIn();

    expect(screen.queryByLabelText("Harga dasar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Diskon seluruh booking")).not.toBeInTheDocument();
    expect(screen.getByText("Harga katalog")).toBeInTheDocument();
  });

  /* ─── PRICED BEYOND THE PET (17 September 2026) ─────────────────────────── */

  describe("a service priced by zone and a staff card", () => {
    const LOKASI = "vo-lokasi";

    const lokasi = makeVariantOption({
      _id: LOKASI,
      name: "Lokasi",
      source: "staff",
      axisKey: LOKASI,
      sortOrder: 3,
      values: [
        { code: "toko", label: "Di Toko", sortOrder: 0, isActive: true },
        { code: "rumah", label: "Di Rumah", sortOrder: 1, isActive: true },
      ],
    });

    const zone = (id: string, name: string, minKm: number, maxKm: number): Zone => ({
      _id: id,
      tenantId: "t1",
      name,
      nameKey: name.toLowerCase(),
      description: null,
      minKm,
      maxKm,
      createdBy: null,
      deletedAt: null,
      createdAt: "2026-09-17T00:00:00.000Z",
      updatedAt: "2026-09-17T00:00:00.000Z",
    });

    const variantRow = (zoneId: string, code: string, price: string) => ({
      petType: null,
      sizeCategory: null,
      furType: null,
      zoneId,
      choices: [{ optionId: LOKASI, code }],
      price,
      durationMin: 90,
      isActive: true,
    });

    const homeGrooming = {
      ...grooming,
      _id: "svc-home",
      name: "Grooming Rumah",
      price: null,
      hasVariants: true,
      variantAxes: ["zone", LOKASI],
      variants: [
        variantRow("zone-a", "toko", "150000.0000"),
        variantRow("zone-a", "rumah", "180000.0000"),
        variantRow("zone-b", "toko", "160000.0000"),
        variantRow("zone-b", "rumah", "210000.0000"),
      ],
    } as unknown as Service;

    /* ~2,2 km north of the branch — Zona A. */
    const pinned = {
      ...customer,
      location: { lat: -6.18, lng: 106.8, source: "manual" },
    } as Customer;

    beforeEach(() => {
      primeVariantOptions(variantOptionService.list, zoneService.list, {
        cards: [...BUILT_IN_VARIANT_OPTIONS, lokasi],
        zones: [zone("zone-a", "Zona A", 0, 5), zone("zone-b", "Zona B", 5, 10)],
      });
      services.list.mockResolvedValue(page([homeGrooming]));
      branches.list.mockResolvedValue(
        page([
          {
            _id: BRANCH_ID,
            name: "Cibubur",
            location: { lat: -6.2, lng: 106.8, source: "manual" },
          },
        ]) as never,
      );
    });

    async function pickHomeGrooming() {
      await userEvent.click(
        screen.getByRole("button", { name: /cari nama atau nomor whatsapp/i }),
      );
      await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));
      await userEvent.click(await screen.findByRole("button", { name: /bruno/i }));
      await userEvent.click(screen.getByRole("button", { name: "Layanan" }));
      await userEvent.click(await screen.findByRole("option", { name: /grooming rumah/i }));
    }

    it("asks for Lokasi, previews the variant for the zone and the choice, and sends the choice", async () => {
      customers.list.mockResolvedValue(page([pinned]));
      renderWithAuth(<GroomingBookingCreateScreen />, {
        isSuperAdmin: false,
        permissions: [{ feature: "bookings", actions: ["create", "read"] }],
      });

      await pickHomeGrooming();

      /* Nothing chosen yet: no price, and Simpan says what is missing. */
      const picker = await screen.findByRole("combobox", { name: /lokasi/i });
      expect(
        screen.getAllByText(/pilih lokasi untuk grooming rumah dulu/i).length,
      ).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();

      await userEvent.click(picker);
      await userEvent.click(await screen.findByRole("option", { name: "Di Rumah" }));

      /* Zona A (≈2,2 km) × Di Rumah — not Zona B's, not Di Toko's. */
      expect((await screen.findAllByText(/180\.000/)).length).toBeGreaterThan(0);
      expect(screen.queryByText(/210\.000/)).not.toBeInTheDocument();
      expect(screen.getAllByText(/Zona A · 2,2\d* km/).length).toBeGreaterThan(0);

      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      await waitFor(() => expect(bookings.create).toHaveBeenCalled());
      expect(bookings.create.mock.calls[0][0].bookings[0]).toMatchObject({
        serviceId: "svc-home",
        variantChoices: [{ optionId: LOKASI, code: "rumah" }],
      });
    });

    it("says why there is no price when the customer has no pin, and blocks the save", async () => {
      renderWithAuth(<GroomingBookingCreateScreen />);

      await pickHomeGrooming();

      await userEvent.click(await screen.findByRole("combobox", { name: /lokasi/i }));
      await userEvent.click(await screen.findByRole("option", { name: "Di Toko" }));

      const reason =
        /koordinat alamat pelanggan belum diisi — harga grooming rumah ditentukan dari zona/i;
      expect((await screen.findAllByText(reason)).length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
      expect(screen.queryByText(/150\.000/)).not.toBeInTheDocument();
    });

    it("puts the server's refusal of a choice under that select", async () => {
      customers.list.mockResolvedValue(page([pinned]));
      bookings.create.mockRejectedValue(
        new ApiError("Validation failed", 400, {
          details: [
            {
              field: "bookings[0].variantChoices",
              message: "Pilih Lokasi untuk Grooming Rumah dulu",
              optionId: LOKASI,
            } as never,
          ],
        }),
      );
      renderWithAuth(<GroomingBookingCreateScreen />);

      await pickHomeGrooming();
      await userEvent.click(await screen.findByRole("combobox", { name: /lokasi/i }));
      await userEvent.click(await screen.findByRole("option", { name: "Di Rumah" }));
      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      expect(
        await screen.findByText("Pilih Lokasi untuk Grooming Rumah dulu"),
      ).toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: /lokasi/i })).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });
  });

  /*
    BO's NOTE 4 (21 September 2026): a service switched to "Bisa antar-jemput"
    offers the van on this form, and the ride is saved into the grooming's visit.
  */
  describe("antar-jemput for this visit", () => {
    const vanService = {
      ...grooming,
      _id: "svc-aj",
      name: "Antar-Jemput",
      price: "45000.0000",
      serviceKind: "pickup-delivery",
      businessLineId: "line-aj",
      billingUnit: "per_visit",
      serviceLocations: ["in_home"],
    } as unknown as Service;

    beforeEach(() => {
      services.list.mockResolvedValue(
        page([{ ...grooming, pickupDeliveryAvailable: true } as Service, vanService]),
      );
      businessLines.list.mockResolvedValue(
        page([
          { _id: "line-groom", name: "Grooming" },
          { _id: "line-aj", name: "Antar-Jemput" },
        ]) as never,
      );
    });

    it("saves the pickup after the grooming, into its visit", async () => {
      bookings.create.mockResolvedValueOnce(created).mockResolvedValueOnce({
        groupId: "grp-1",
        bookings: [{ _id: "bk-aj", bookingNumber: "BK-260916-002" } as Booking],
      } as CreateBookingResult);
      renderWithAuth(<GroomingBookingCreateScreen />);

      await fillIn();
      await userEvent.click(await screen.findByRole("checkbox", { name: /^jemput/i }));
      await userEvent.click(screen.getByRole("button", { name: "Layanan antar-jemput" }));
      await userEvent.click(await screen.findByRole("option", { name: "Antar-Jemput" }));
      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      await waitFor(() => expect(bookings.create).toHaveBeenCalledTimes(2));
      expect(bookings.create.mock.calls[1][0]).toMatchObject({
        customerId: "cust-1",
        groupId: "grp-1",
        location: "in_home",
        /*
          ⚠️ STILL A DRAFT (24 September 2026). A van saved from the MODULE now
          opens on Confirmed, on request — this one does not: it rides on a
          grooming that is itself only `requested` at this point, and a
          confirmed van against an unconfirmed visit promises what the shop has
          not agreed yet.
        */
        status: "draft",
        /* Half an hour before the 10.30 grooming. */
        scheduledAt: new Date("2026-09-16T10:00").toISOString(),
        /* The grooming's animal rides in the van, not above it — a ride sends
           no `petId` since 23 September 2026. */
        bookings: [
          { serviceId: "svc-aj", tripLeg: "pickup", passengerPetIds: ["pet-1"] },
        ],
      });
    });

    it("is not offered for a service without the switch", async () => {
      services.list.mockResolvedValue(page([grooming, vanService]));
      renderWithAuth(<GroomingBookingCreateScreen />);

      await fillIn();

      expect(screen.queryByRole("checkbox", { name: /^jemput/i })).not.toBeInTheDocument();
    });
  });

  /* ─── HOME GROOMING (10 October 2026) ─────────────────────────────────────── */

  describe("home grooming", () => {
    const zone = (id: string, name: string, minKm: number, maxKm: number): Zone => ({
      _id: id,
      tenantId: "t1",
      name,
      nameKey: name.toLowerCase(),
      description: null,
      minKm,
      maxKm,
      createdBy: null,
      deletedAt: null,
      createdAt: "2026-10-10T00:00:00.000Z",
      updatedAt: "2026-10-10T00:00:00.000Z",
    });

    const shopOnly = {
      ...grooming,
      _id: "svc-shop",
      name: "Mandi Toko",
      serviceLocations: ["in_store"],
    } as unknown as Service;
    const homeOnly = {
      ...grooming,
      _id: "svc-house",
      name: "Mandi Rumah",
      serviceLocations: ["in_home"],
    } as unknown as Service;
    /* Not answered yet — offered anywhere, as the server reads it. */
    const either = {
      ...grooming,
      addonServiceIds: ["add-shop", "add-house"],
    } as unknown as Service;
    const addon = (id: string, name: string, at: string[]) =>
      ({
        ...grooming,
        _id: id,
        name,
        price: "20000.0000",
        serviceType: "addon",
        serviceLocations: at,
        addonServiceIds: [],
      }) as unknown as Service;

    /* ~2,2 km north of the branch — Zona A (fee 25.000). */
    const nearby = {
      ...customer,
      address: "Jl. Mawar No. 1",
      location: { lat: -6.18, lng: 106.8, source: "manual" },
    } as Customer;

    beforeEach(() => {
      primeVariantOptions(variantOptionService.list, zoneService.list, {
        zones: [
          zone("zone-a", "Zona A", 0, 5),
          zone("zone-b", "Zona B", 5, 10),
        ],
      });
      /* THE SHOP'S HOME-GROOMING SETTINGS, read behind the booking grants. */
      bookings.homeVisitFees.mockResolvedValue({
        unit: "per_visit",
        fees: [
          { zoneId: "zone-a", zoneName: "Zona A", minKm: 0, maxKm: 5, fee: "25000.0000" },
          { zoneId: "zone-b", zoneName: "Zona B", minKm: 5, maxKm: 10, fee: "40000.0000" },
        ],
      });
      services.list.mockResolvedValue(
        page([
          either,
          shopOnly,
          homeOnly,
          addon("add-shop", "Add-on Toko", ["in_store"]),
          addon("add-house", "Add-on Rumah", ["in_home"]),
        ]),
      );
      branches.list.mockResolvedValue(
        page([
          {
            _id: BRANCH_ID,
            name: "Cibubur",
            location: { lat: -6.2, lng: 106.8, source: "manual" },
          },
        ]) as never,
      );
      customers.list.mockResolvedValue(page([nearby]));
    });

    async function pickCustomerAndPet() {
      await userEvent.click(
        screen.getByRole("button", { name: /cari nama atau nomor whatsapp/i }),
      );
      await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));
      await userEvent.click(await screen.findByRole("button", { name: /bruno/i }));
    }

    const homeSwitch = () =>
      screen.getByRole("switch", { name: /grooming di rumah pelanggan/i });

    async function openServices() {
      await userEvent.click(screen.getByRole("button", { name: "Layanan" }));
    }

    it("starts in the shop and filters the services by the switch", async () => {
      renderWithAuth(<GroomingBookingCreateScreen />);
      await pickCustomerAndPet();

      expect(homeSwitch()).not.toBeChecked();
      expect(screen.queryByText("Alamat kunjungan")).not.toBeInTheDocument();

      await openServices();
      expect(await screen.findByRole("option", { name: "Basic Grooming" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Mandi Toko" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Mandi Rumah" })).not.toBeInTheDocument();
      await userEvent.keyboard("{Escape}");

      await userEvent.click(homeSwitch());

      await openServices();
      expect(await screen.findByRole("option", { name: "Basic Grooming" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Mandi Rumah" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Mandi Toko" })).not.toBeInTheDocument();
    });

    it("takes off, by name, the services and add-ons the new place does not offer", async () => {
      renderWithAuth(<GroomingBookingCreateScreen />);
      await pickCustomerAndPet();

      await openServices();
      await userEvent.click(await screen.findByRole("option", { name: "Basic Grooming" }));
      await userEvent.click(await screen.findByRole("checkbox", { name: /add-on toko/i }));

      await userEvent.click(homeSwitch());

      /* The add-on goes; the service that goes anywhere stays. */
      expect(
        await screen.findByText(/dilepas karena tidak tersedia.*add-on toko \(bruno\)/i),
      ).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: /add-on toko/i })).not.toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: /add-on rumah/i })).not.toBeChecked();

      /* Back to the shop with a house-only service chosen. */
      await openServices();
      await userEvent.click(await screen.findByRole("option", { name: "Mandi Rumah" }));
      await userEvent.click(homeSwitch());

      expect(
        await screen.findByText(/di toko: mandi rumah \(bruno\)/i),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
    });

    it("defaults the address from the customer and previews the zone and the fee", async () => {
      renderWithAuth(<GroomingBookingCreateScreen />);
      await pickCustomerAndPet();
      await userEvent.click(homeSwitch());

      expect(await screen.findByText("Alamat kunjungan")).toBeInTheDocument();
      /* The customer's card, and the visit address drawn from it. */
      expect(screen.getAllByText("Jl. Mawar No. 1")).toHaveLength(2);
      expect(screen.getAllByText(/Zona A · 2,2\d* km/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/25\.000/).length).toBeGreaterThan(0);

      await openServices();
      await userEvent.click(await screen.findByRole("option", { name: "Basic Grooming" }));

      /* Its own line in the summary, and in the total: 150.000 + 25.000. */
      expect(screen.getByText("Biaya kunjungan · Zona A")).toBeInTheDocument();
      expect(screen.getAllByText(/175\.000/).length).toBeGreaterThan(0);
    });

    it("counts the fee per animal when the shop says so", async () => {
      bookings.homeVisitFees.mockResolvedValue({
        unit: "per_pet",
        fees: [
          { zoneId: "zone-a", zoneName: "Zona A", minKm: 0, maxKm: 5, fee: "25000.0000" },
        ],
      });
      pets.list.mockResolvedValue(
        page([pet, { ...pet, _id: "pet-2", name: "Luna" } as Pet]),
      );

      renderWithAuth(<GroomingBookingCreateScreen />);
      await userEvent.click(
        screen.getByRole("button", { name: /cari nama atau nomor whatsapp/i }),
      );
      await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));
      await userEvent.click(await screen.findByRole("button", { name: /bruno/i }));
      await userEvent.click(await screen.findByRole("button", { name: /luna/i }));
      await userEvent.click(homeSwitch());

      expect(await screen.findByText(/ditagih per hewan \(2 hewan\)/i)).toBeInTheDocument();
      expect(screen.getAllByText(/50\.000/).length).toBeGreaterThan(0);
    });

    it("sends location in_home with the pinned visit address", async () => {
      renderWithAuth(<GroomingBookingCreateScreen />);
      await pickCustomerAndPet();
      await userEvent.click(homeSwitch());
      await openServices();
      await userEvent.click(await screen.findByRole("option", { name: "Basic Grooming" }));

      fireEvent.change(screen.getByLabelText(/tanggal/i), { target: { value: "2026-10-12" } });
      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      await waitFor(() => expect(bookings.create).toHaveBeenCalled());
      expect(bookings.create.mock.calls[0][0]).toMatchObject({
        location: "in_home",
        visitAddress: { address: "Jl. Mawar No. 1", lat: -6.18, lng: 106.8 },
        bookingDiscount: null,
      });
      /* The fee is the server's row — never an add-on id. */
      expect(bookings.create.mock.calls[0][0].bookings[0].addonServiceIds).toEqual([]);
    });

    it("sends no visit address for a booking in the shop", async () => {
      renderWithAuth(<GroomingBookingCreateScreen />);
      await pickCustomerAndPet();
      await openServices();
      await userEvent.click(await screen.findByRole("option", { name: "Basic Grooming" }));
      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      await waitFor(() => expect(bookings.create).toHaveBeenCalled());
      expect(bookings.create.mock.calls[0][0].location).toBe("in_store");
      expect(bookings.create.mock.calls[0][0]).not.toHaveProperty("visitAddress");
    });

    it("blocks the save when the customer has no phone", async () => {
      customers.list.mockResolvedValue(page([{ ...nearby, phone: null } as Customer]));
      renderWithAuth(<GroomingBookingCreateScreen />);
      await pickCustomerAndPet();
      await userEvent.click(homeSwitch());
      await openServices();
      await userEvent.click(await screen.findByRole("option", { name: "Basic Grooming" }));

      expect(
        screen.getAllByText(/nomor telepon pelanggan belum diisi — isi dulu di profil pelanggan/i)
          .length,
      ).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
    });

    it("blocks the save for an address outside every zone", async () => {
      /* ~22 km north: past Zona B. */
      customers.list.mockResolvedValue(
        page([{ ...nearby, location: { lat: -6.0, lng: 106.8, source: "manual" } } as Customer]),
      );
      renderWithAuth(<GroomingBookingCreateScreen />);
      await pickCustomerAndPet();
      await userEvent.click(homeSwitch());
      await openServices();
      await userEvent.click(await screen.findByRole("option", { name: "Basic Grooming" }));

      expect(
        screen.getAllByText(/di luar jangkauan layanan home grooming/i).length,
      ).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
    });

    it("asks for a pin when the address has none, and blocks the save", async () => {
      customers.list.mockResolvedValue(
        page([{ ...nearby, location: undefined } as unknown as Customer]),
      );
      renderWithAuth(<GroomingBookingCreateScreen />);
      await pickCustomerAndPet();
      await userEvent.click(homeSwitch());
      await openServices();
      await userEvent.click(await screen.findByRole("option", { name: "Basic Grooming" }));

      expect(screen.getByText(/pilih titik alamat di peta/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /simpan booking/i })).toBeDisabled();
    });

    it("puts the server's refusal of the address beside the address", async () => {
      bookings.create.mockRejectedValue(
        new ApiError("Validation failed", 400, {
          details: [
            {
              field: "visitAddress",
              message: "Alamat ini berada di luar jangkauan layanan home grooming (12 km dari cabang).",
            },
          ],
        }),
      );
      renderWithAuth(<GroomingBookingCreateScreen />);
      await pickCustomerAndPet();
      await userEvent.click(homeSwitch());
      await openServices();
      await userEvent.click(await screen.findByRole("option", { name: "Basic Grooming" }));
      await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

      expect(
        await screen.findByText(/\(12 km dari cabang\)/),
      ).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });
  });
});

/*
  PROMOSI V1 — the main service's member benefit on its own price row (a name
  + Tanpa/Pakai member toggle, or a select when several fit), fed by the
  booking quote (membership-v1 §4.4); the "Benefit lain" box and the "Member"
  fact read from the customer's cards. The same field and rules as
  BookingForm's (benefitQuote.ts).
*/
describe("GroomingBookingCreateScreen — membership benefit", () => {
  const jatah: BenefitCandidate = {
    membershipId: "mem-1",
    membershipNumber: "MBR-1",
    virtual: false,
    packageRef: null,
    planName: "Explorer",
    attachTo: "pet",
    benefitId: "ben-groom",
    benefitLabel: "Grooming",
    optionId: "opt-free",
    optionKind: "free_item",
    kind: "quota",
    label: "Jatah Grooming 1/3",
    discount: "100000.0000",
    visitFee: "zone",
    visitFeeDiscount: "0.0000",
    used: 1,
    cap: 3,
    options: [],
  };

  function answerWith(
    line: (input: BookingBenefitQuoteInput) => Partial<BenefitQuoteResponse["lines"][number]>,
  ) {
    memberships.quoteBooking.mockImplementation(
      async (input) =>
        ({
          cards: [
            { id: "mem-1", number: "MBR-1", petId: "pet-1", planName: "Explorer", status: "active", benefits: [] },
          ],
          lines: [
            {
              ref: input.entries[0].ref,
              petId: input.entries[0].petId,
              candidates: [],
              recommended: null,
              unavailable: [],
              ...line(input),
            },
          ],
        }) as BenefitQuoteResponse,
    );
  }

  const offerJatah = () =>
    answerWith((input) =>
      input.entries[0].noBenefit
        ? { candidates: [jatah], recommended: null }
        : { candidates: [jatah], recommended: jatah },
    );

  it("shows no benefit on the row when the animal holds no card", async () => {
    renderWithAuth(<GroomingBookingCreateScreen />);
    await fillIn();

    await waitFor(() => expect(memberships.quoteBooking).toHaveBeenCalled());
    expect(document.querySelector("[data-main-member]")).toBeNull();
    expect(screen.queryByRole("button", { name: /member untuk/i })).not.toBeInTheDocument();
    expect(document.querySelector("[data-other-benefits]")).toBeNull();
  });

  it("preselects the recommended benefit, takes it off the total, and saves it", async () => {
    offerJatah();
    renderWithAuth(<GroomingBookingCreateScreen />);
    await fillIn();

    /* ONE candidate: its name on the service's price row, and the toggle. */
    const toggle = await screen.findByRole("button", {
      name: "Tanpa member untuk Basic Grooming",
    });
    const row = toggle.closest("[data-main-member]") as HTMLElement;
    expect(row).toHaveTextContent("Jatah Grooming 1/3");
    expect(row).toHaveTextContent("Jatah ditahan sampai booking dibayar atau dibatalkan.");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    /* Asked for the booking's own date and time, one entry per animal. */
    await waitFor(() =>
      expect(memberships.quoteBooking.mock.calls.at(-1)?.[0]).toMatchObject({
        context: "booking",
        customerId: "cust-1",
        date: new Date("2026-09-16T10:30").toISOString(),
        entries: [{ ref: "pet-1", petId: "pet-1", serviceId: "svc-1", amount: "150000.0000" }],
      }),
    );

    /* The item row names the benefit; the struck Efektif says how much. */
    expect(document.querySelector("[data-member-line]")).toBeNull();
    expect(row).not.toHaveTextContent("Rp");
    /* Ringkasan: the member line, the normal total struck, the reduced total. */
    expect(screen.getByText("Potongan member · Jatah Grooming 1/3")).toBeInTheDocument();
    expect(document.querySelector("[data-total]")).toHaveTextContent("Rp 50.000");
    expect(document.querySelector("[data-total-before-member]")).toHaveTextContent("Rp 150.000");

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));
    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].bookings[0].plannedBenefit).toEqual({
      membershipId: "mem-1",
      benefitId: "ben-groom",
      optionId: "opt-free",
    });
  });

  it("sends null after 'Tanpa member', at the normal price", async () => {
    offerJatah();
    renderWithAuth(<GroomingBookingCreateScreen />);
    await fillIn();

    await userEvent.click(
      await screen.findByRole("button", { name: "Tanpa member untuk Basic Grooming" }),
    );
    await waitFor(() =>
      expect(document.querySelector("[data-total]")).toHaveTextContent("Rp 150.000"),
    );
    expect(screen.getByRole("button", { name: "Pakai member untuk Basic Grooming" })).toBeInTheDocument();
    expect(document.querySelector("[data-total-before-member]")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));
    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].bookings[0].plannedBenefit).toBeNull();
  });

  it("shows why nothing is offered, naming the booking holding the jatah", async () => {
    answerWith(() => ({
      unavailable: [
        {
          membershipId: "mem-1",
          benefitId: "ben-groom",
          benefitLabel: "Grooming",
          reason: "reserved",
          message: "Jatah Grooming habis periode ini",
          reservedBy: [{ bookingId: "b", bookingNumber: "BK-2026-0012", scheduledAt: "x", petId: "pet-1" }],
        },
      ],
    }));
    renderWithAuth(<GroomingBookingCreateScreen />);
    await fillIn();

    const message = await screen.findByText(
      "Jatah Grooming habis periode ini",
    );
    /* On the service's price row, muted, with nothing to press. */
    expect(message.closest("[data-main-member]")).not.toBeNull();
    expect(message).toHaveClass("text-muted");
    expect(screen.queryByRole("button", { name: /member untuk/i })).not.toBeInTheDocument();
  });

  it("offers a select on the row when more than one benefit fits", async () => {
    const diskon: BenefitCandidate = {
      ...jatah,
      benefitId: "ben-disc",
      benefitLabel: "Diskon",
      optionId: "opt-disc",
      optionKind: "discount_percent",
      kind: "unlimited",
      label: "Member · Diskon 10%",
      discount: "15000.0000",
      used: null,
      cap: null,
    };
    answerWith((input) => {
      const entry = input.entries[0];
      const picked = entry.noBenefit ? null : entry.benefitId === "ben-disc" ? diskon : jatah;
      return { candidates: [jatah, diskon], recommended: picked };
    });
    renderWithAuth(<GroomingBookingCreateScreen />);
    await fillIn();

    const select = await screen.findByRole("combobox", { name: "Member untuk Basic Grooming" });
    await waitFor(() => expect(select).toHaveTextContent("Jatah Grooming 1/3"));
    await userEvent.click(select);
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "Jatah Grooming 1/3",
      "Member · Diskon 10%",
      "Tanpa member",
    ]);
    await userEvent.click(screen.getByRole("option", { name: "Member · Diskon 10%" }));

    await waitFor(() =>
      expect(document.querySelector("[data-total]")).toHaveTextContent("Rp 135.000"),
    );
    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));
    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].bookings[0].plannedBenefit).toEqual({
      membershipId: "mem-1",
      benefitId: "ben-disc",
      optionId: "opt-disc",
    });
  });

  it("lists the cards' product benefits and perks in 'Benefit lain', customer cards included", async () => {
    offerJatah();
    const scope = (target: string) => ({
      target,
      serviceIds: [],
      productIds: [],
      categoryIds: [],
      serviceKinds: [],
    });
    memberships.listMemberships.mockResolvedValue(
      page([
        {
          id: "mem-1",
          attachTo: "pet",
          petId: "pet-1",
          status: "active",
          plan: {
            name: "Explorer",
            benefits: [
              {
                id: "ben-groom",
                label: "Grooming",
                kind: "free_item",
                scope: scope("service"),
                quota: { total: null, perPeriod: 1, period: "month" },
                options: [{ id: "o1", kind: "free_item", scope: scope("service") }],
              },
              {
                id: "ben-prio",
                label: "Prioritas antrean",
                kind: "perk",
                scope: scope("any"),
                quota: { total: null, perPeriod: null, period: null },
                options: [],
              },
            ],
          },
        },
        {
          id: "mem-2",
          attachTo: "customer",
          petId: null,
          status: "active",
          plan: {
            name: "Keluarga",
            benefits: [
              {
                id: "ben-food",
                label: "Makanan",
                kind: "discount_percent",
                scope: scope("product"),
                quota: { total: 4, perPeriod: null, period: null },
                options: [{ id: "o2", kind: "discount_percent", scope: scope("product") }],
              },
            ],
          },
        },
      ] as unknown as PetMembership[]) as never,
    );
    renderWithAuth(<GroomingBookingCreateScreen />);
    await fillIn();

    expect(await screen.findByText("Benefit lain dari Explorer")).toBeInTheDocument();
    expect(screen.getByText("Prioritas antrean (fasilitas)")).toBeInTheDocument();
    expect(screen.getByText("Benefit lain dari Keluarga")).toBeInTheDocument();
    expect(
      screen.getByText("Makanan · 4× selama masa berlaku — dipakai di kasir"),
    ).toBeInTheDocument();
    expect(document.querySelector("[data-other-benefits]")).not.toHaveTextContent("Grooming");

    /*
      "BENEFIT YANG AKAN DIBERIKAN" (22 October 2026) — each line is a checkbox;
      the ticked ones are saved as `plannedExtras`, a note on the booking.
    */
    const perk = screen.getByRole("checkbox", { name: "Prioritas antrean (fasilitas)" });
    const food = screen.getByRole("checkbox", {
      name: "Makanan · 4× selama masa berlaku — dipakai di kasir",
    });
    await userEvent.click(food);
    await userEvent.click(perk);
    await userEvent.click(food);
    await userEvent.click(food);
    expect(perk).toBeChecked();
    expect(food).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));
    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].bookings[0].plannedExtras).toEqual([
      { membershipId: "mem-1", benefitId: "ben-prio", label: "Prioritas antrean" },
      { membershipId: "mem-2", benefitId: "ben-food", label: "Makanan" },
    ]);
  });

  /*
    ADD-ON BENEFITS (22 October 2026) — asked with no pick, read off each
    `<ref>:addon:<i>` line, applied automatically and shown only.
  */
  it("shows each add-on's member benefit on its row, in the Ringkasan and in the total — never saved", async () => {
    const addonOf = (id: string, name: string) =>
      ({
        ...grooming,
        _id: id,
        name,
        price: "20000.0000",
        serviceType: "addon",
        addonServiceIds: [],
      }) as unknown as Service;
    services.list.mockResolvedValue(
      page([
        { ...grooming, addonServiceIds: ["add-parfum", "add-spa"] } as unknown as Service,
        addonOf("add-parfum", "Parfum"),
        addonOf("add-spa", "Spa"),
      ]),
    );
    const diskon: BenefitCandidate = {
      ...jatah,
      benefitId: "ben-addon",
      benefitLabel: "Add-on",
      optionId: "opt-disc",
      optionKind: "discount_percent",
      kind: "unlimited",
      label: "Member · Diskon 10%",
      discount: "2000.0000",
      used: null,
      cap: null,
    };
    const spa: BenefitCandidate = {
      ...jatah,
      benefitId: "ben-spa",
      benefitLabel: "Spa",
      optionId: "opt-spa",
      label: "Jatah Spa 1/1",
      discount: "20000.0000",
      used: 1,
      cap: 1,
    };
    memberships.quoteBooking.mockImplementation(async (input) => {
      const entry = input.entries[0];
      return {
        cards: [
          { id: "mem-1", number: "MBR-1", petId: "pet-1", planName: "Explorer", status: "active", benefits: [] },
        ],
        lines: [
          { ref: entry.ref, petId: entry.petId, candidates: [jatah], recommended: jatah, unavailable: [] },
          ...(entry.addons ?? []).map((addon, index) => {
            const pick = addon.serviceId === "add-spa" ? spa : diskon;
            return {
              ref: `${entry.ref}:addon:${index}`,
              petId: entry.petId,
              candidates: [pick],
              recommended: pick,
              unavailable: [],
            };
          }),
        ],
      } as BenefitQuoteResponse;
    });
    renderWithAuth(<GroomingBookingCreateScreen />);
    await fillIn();
    await userEvent.click(await screen.findByRole("checkbox", { name: /parfum/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /spa/i }));

    /* Asked with the add-ons and no pick on them. */
    await waitFor(() =>
      expect(memberships.quoteBooking.mock.calls.at(-1)?.[0].entries[0].addons).toEqual([
        { serviceId: "add-parfum", amount: "20000.0000" },
        { serviceId: "add-spa", amount: "20000.0000" },
      ]),
    );

    /* Each add-on row names its benefit as the till does — no amount. */
    await waitFor(() =>
      expect(document.querySelectorAll("[data-member-line]")).toHaveLength(2),
    );
    const lines = [...document.querySelectorAll("[data-member-line]")].map((el) => el.textContent);
    expect(lines).toEqual(["Member · Diskon 10%", "Jatah Spa 1/1"]);
    /* The main service's row names its own, the same way. */
    expect(document.querySelector("[data-main-member]")).toHaveTextContent("Jatah Grooming 1/3");

    /* Only the quota one says it is an estimate. */
    expect(screen.getAllByText("Perkiraan — jatah terpakai saat dibayar di kasir.")).toHaveLength(1);

    /* Ringkasan and total: 150.000 + 20.000 + 20.000 − 100.000 − 2.000 − 20.000. */
    expect(screen.getByText("Potongan member · Member · Diskon 10%")).toBeInTheDocument();
    expect(screen.getByText("Potongan member · Jatah Spa 1/1")).toBeInTheDocument();
    expect(document.querySelector("[data-total]")).toHaveTextContent("Rp 68.000");
    expect(document.querySelector("[data-total-before-member]")).toHaveTextContent("Rp 190.000");
    expect(screen.getByText(/potongan member Rp 122\.000/)).toBeInTheDocument();

    /* The booking keeps the main service's plan only. */
    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));
    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    const saved = bookings.create.mock.calls[0][0].bookings[0];
    expect(saved.plannedBenefit).toEqual({
      membershipId: "mem-1",
      benefitId: "ben-groom",
      optionId: "opt-free",
    });
    expect(JSON.stringify(saved)).not.toContain("ben-addon");
    expect(JSON.stringify(saved)).not.toContain("ben-spa");
  });

  /* "Tanpa member" per add-on (22 October 2026) — normal price, out of the totals, saved. */
  it("lets an add-on go without the member benefit, and saves that on the booking", async () => {
    const addonOf = (id: string, name: string) =>
      ({
        ...grooming,
        _id: id,
        name,
        price: "20000.0000",
        serviceType: "addon",
        addonServiceIds: [],
      }) as unknown as Service;
    services.list.mockResolvedValue(
      page([
        { ...grooming, addonServiceIds: ["add-parfum", "add-spa"] } as unknown as Service,
        addonOf("add-parfum", "Parfum"),
        addonOf("add-spa", "Spa"),
      ]),
    );
    const diskon: BenefitCandidate = {
      ...jatah,
      benefitId: "ben-addon",
      benefitLabel: "Add-on",
      optionId: "opt-disc",
      optionKind: "discount_percent",
      kind: "unlimited",
      label: "Member · Diskon 10%",
      discount: "2000.0000",
      used: null,
      cap: null,
    };
    const spa: BenefitCandidate = {
      ...jatah,
      benefitId: "ben-spa",
      benefitLabel: "Spa",
      optionId: "opt-spa",
      label: "Jatah Spa 1/1",
      discount: "20000.0000",
      used: 1,
      cap: 1,
    };
    memberships.quoteBooking.mockImplementation(async (input) => {
      const entry = input.entries[0];
      return {
        cards: [
          { id: "mem-1", number: "MBR-1", petId: "pet-1", planName: "Explorer", status: "active", benefits: [] },
        ],
        lines: [
          { ref: entry.ref, petId: entry.petId, candidates: [jatah], recommended: jatah, unavailable: [] },
          ...(entry.addons ?? []).map((addon, index) => {
            const pick = addon.serviceId === "add-spa" ? spa : diskon;
            return {
              ref: `${entry.ref}:addon:${index}`,
              petId: entry.petId,
              candidates: [pick],
              recommended: addon.noBenefit ? null : pick,
              unavailable: [],
            };
          }),
        ],
      } as BenefitQuoteResponse;
    });
    renderWithAuth(<GroomingBookingCreateScreen />);
    await fillIn();
    await userEvent.click(await screen.findByRole("checkbox", { name: /parfum/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /spa/i }));
    await waitFor(() => expect(document.querySelector("[data-total]")).toHaveTextContent("Rp 68.000"));

    const off = screen.getByRole("button", { name: "Tanpa member untuk Spa" });
    expect(off).toHaveClass("min-h-11");
    await userEvent.click(off);

    await waitFor(() =>
      expect(memberships.quoteBooking.mock.calls.at(-1)?.[0].entries[0].addons).toEqual([
        { serviceId: "add-parfum", amount: "20000.0000" },
        { serviceId: "add-spa", amount: "20000.0000", noBenefit: true },
      ]),
    );
    /* 150.000 + 20.000 + 20.000 − 100.000 − 2.000. */
    await waitFor(() => expect(document.querySelector("[data-total]")).toHaveTextContent("Rp 88.000"));
    expect(document.querySelector("[data-member-off]")).toHaveTextContent("Tanpa member");
    expect(screen.queryByText("Potongan member · Jatah Spa 1/1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pakai member untuk Spa" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));
    await waitFor(() => expect(bookings.create).toHaveBeenCalled());
    expect(bookings.create.mock.calls[0][0].bookings[0].noMemberBenefitAddonIds).toEqual(["add-spa"]);
  });

  it("puts a 409 on the benefit in a toast and under the animal — not in the clash", async () => {
    offerJatah();
    bookings.create.mockRejectedValue(
      new ApiError("Benefit membership tidak bisa dipakai untuk booking ini", 409, {
        details: [
          { field: "bookings[0].plannedBenefit", message: "Jatah periode ini sudah habis" },
        ] as never,
      }),
    );
    renderWithAuth(<GroomingBookingCreateScreen />);
    await fillIn();

    await screen.findByRole("button", { name: "Tanpa member untuk Basic Grooming" });
    await userEvent.click(screen.getByRole("button", { name: /simpan booking/i }));

    const message = "Jatah periode ini sudah habis";
    await waitFor(() => expect(swalToast).toHaveBeenCalledWith(message, "error", 6000));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(message);
    /* On the service's price row. */
    expect(alert.closest("[data-main-member]")).not.toBeNull();
    expect(screen.queryByText(/tekan Simpan lagi/)).not.toBeInTheDocument();
  });

  it("reads the Member fact from the customer's cards", async () => {
    customers.list.mockResolvedValue(page([customer]));
    memberships.listMemberships.mockResolvedValue(
      page([
        {
          id: "mem-1",
          attachTo: "pet",
          petId: "pet-1",
          petName: "Bruno",
          status: "active",
          plan: { name: "Tes Explorer" },
        },
        {
          id: "mem-2",
          attachTo: "customer",
          petId: null,
          petName: null,
          status: "active",
          plan: { name: "Keluarga" },
        },
      ] as unknown as PetMembership[]) as never,
    );
    renderWithAuth(<GroomingBookingCreateScreen />);

    await userEvent.click(
      screen.getByRole("button", { name: /cari nama atau nomor whatsapp/i }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));

    // The animal's card sits on its tile under Hewan; the Member fact keeps
    // only the customer-held card as a chip and counts the animals' cards.
    expect(await screen.findByText("Member · Tes Explorer")).toBeInTheDocument();
    expect(screen.getByText("Semua hewan · Keluarga")).toBeInTheDocument();
    expect(screen.getByText("1 hewan member")).toBeInTheDocument();
    expect(memberships.listMemberships).toHaveBeenCalledTimes(1);
    expect(memberships.listMemberships).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cust-1", status: ["active", "paused"] }),
    );
  });

  it("says — when the customer holds no card", async () => {
    renderWithAuth(<GroomingBookingCreateScreen />);
    await userEvent.click(
      screen.getByRole("button", { name: /cari nama atau nomor whatsapp/i }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /ibu rina/i }));

    await waitFor(() => expect(memberships.listMemberships).toHaveBeenCalled());
    const fact = screen.getByText("Member").closest("div");
    expect(fact).toHaveTextContent("—");
    expect(document.querySelector("[data-member-chip]")).toBeNull();
  });
});
