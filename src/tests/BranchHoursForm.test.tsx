import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { BranchEditForm } from "@/features/branches";
import { branchService } from "@/services/branch.service";
import type { Branch } from "@/types/api";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    _id: "b1",
    tenantId: "t1",
    name: "Pusat",
    code: null,
    address: null,
    city: null,
    phone: null,
    receiptFooter: null,
    openTime: null,
    closeTime: null,
    operatingDays: [],
    location: { lat: null, lng: null, source: "manual" },
    isActive: true,
    deletedAt: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  } as Branch;
}

const open = async (branch = makeBranch()) => {
  jest.spyOn(branchService, "getById").mockResolvedValue(branch);
  renderWithAuth(<BranchEditForm id="b1" />);
  await screen.findByLabelText(/Jam buka/);
};

/**
 * WHEN THE DOORS ARE OPEN (22 September 2026). Nothing enforces these yet — the
 * booking validator that will read them is why they are stored as times and day
 * codes rather than as a sentence — so what is worth pinning is that the pair
 * cannot be half-filled and that the days go out as codes.
 */
describe("a branch's opening hours", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends the city, the hours and the ticked days", async () => {
    const update = jest
      .spyOn(branchService, "update")
      .mockResolvedValue(makeBranch());
    await open();

    await userEvent.type(screen.getByLabelText("Kota"), "Surabaya");
    await userEvent.type(screen.getByLabelText(/Jam buka/), "09:00");
    await userEvent.type(screen.getByLabelText(/Jam tutup/), "20:00");
    await userEvent.click(screen.getByLabelText("Senin"));
    await userEvent.click(screen.getByLabelText("Selasa"));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({
          city: "Surabaya",
          openTime: "09:00",
          closeTime: "20:00",
          operatingDays: ["mon", "tue"],
        }),
      ),
    );
  });

  /* The server refuses the half-pair too; caught here so the message names the box. */
  it("refuses an opening time with no closing one", async () => {
    const update = jest.spyOn(branchService, "update");
    await open();

    await userEvent.type(screen.getByLabelText(/Jam buka/), "09:00");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    expect(
      await screen.findByText("Isi jam buka dan jam tutupnya sekaligus"),
    ).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("reads the ticked days back as a range", async () => {
    await open(
      makeBranch({
        openTime: "08:30",
        closeTime: "19:00",
        operatingDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
      }),
    );

    expect(screen.getByText("Tercatat buka Senin – Sabtu.")).toBeInTheDocument();
  });

  /* Empty means UNRECORDED — a branch open no day at all is what Aktif says. */
  it("says an empty week is unrecorded rather than closed", async () => {
    await open();

    expect(screen.getByText(/Belum diisi/)).toBeInTheDocument();
  });
});
