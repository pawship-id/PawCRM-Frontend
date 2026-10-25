import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MembershipCardDetail } from "@/features/memberships";
import { swalToast } from "@/lib/swal";
import { branchService } from "@/services/branch.service";
import { membershipService } from "@/services/membership.service";
import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";

import {
  benefitAvailability,
  listPage,
  membershipCard,
  redemption,
} from "./helpers/membershipFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/membership.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/service.service");
jest.mock("@/services/product.service");
jest.mock("@/services/petOption.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/dashboard/promosi/membership/anggota/card-1",
}));

const mocked = membershipService as jest.Mocked<typeof membershipService>;

const at = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12).toISOString();

const card = membershipCard({
  benefits: [benefitAvailability({ adjustment: 1, cap: 4, remaining: 3 })],
  redemptions: [
    redemption({ id: "r1", usedAt: at(2026, 10, 5) }),
    redemption({ id: "r0", usedAt: at(2026, 10, 3), reversedAt: at(2026, 10, 4) }),
    redemption({ id: "r0-rev", amount: -1, reversalOf: "r0", usedAt: at(2026, 10, 4) }),
  ],
  history: [
    {
      id: "h1",
      at: at(2026, 10, 10),
      by: "u1",
      byName: "Hendra",
      action: "quota_adjusted",
      summary: "Koreksi kuota periode ini: Grooming +1",
      reason: "Kompensasi: toko tutup atau groomer berhalangan",
      note: "Groomer sakit",
    },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  mocked.getMembership.mockResolvedValue(card);
  (branchService.list as jest.Mock).mockResolvedValue(listPage([{ _id: "b1", name: "Pusat" }]));
  (serviceService.list as jest.Mock).mockResolvedValue(
    listPage([{ _id: "svc-basic", name: "Basic Grooming" }]),
  );
  (productService.list as jest.Mock).mockResolvedValue(listPage([]));
});

/**
 * One member. What this suite protects: the corrections are visible (the
 * "+1 koreksi" badge, the change log with its reason), a reversed spend stays
 * in the ledger as "dikembalikan", and a Kelola save sends the reason the
 * server requires and refetches.
 */
describe("Anggota detail", () => {
  it("shows the hero, the jatah with its correction, the ledger and the change log", async () => {
    renderWithAuth(<MembershipCardDetail id="card-1" />);

    expect(await screen.findByRole("heading", { level: 1, name: "Mochi · Rina Wijaya" })).toBeVisible();
    expect(screen.getByText("Bulan ke-1 dari 6", { exact: false })).toBeVisible();
    expect(screen.getByText("+1 koreksi")).toBeVisible();
    expect(screen.getByText("3 tersisa")).toBeVisible();
    expect(screen.getByRole("link", { name: /Profil pelanggan/ })).toHaveAttribute(
      "href",
      "/dashboard/customers/cus-1",
    );
    expect(screen.getByRole("link", { name: /Hubungi/ })).toHaveAttribute(
      "href",
      "https://wa.me/6281211112222",
    );

    // The reversal row is drawn on the row it reverses, not as a row of its own.
    expect(screen.getByText("dikembalikan")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Ubah tanggal" })).toHaveLength(1);

    expect(screen.getByText("Koreksi kuota periode ini: Grooming +1")).toBeVisible();
    expect(screen.getByText("Groomer sakit")).toBeVisible();
  });

  it("names the ledger's document and line, linking an invoice to its faktur", async () => {
    mocked.getMembership.mockResolvedValue({
      ...card,
      redemptions: [
        redemption({
          id: "r2",
          context: "invoice",
          posTransactionId: null,
          invoiceId: "inv-9",
          documentNumber: "INV-2610-0009",
          itemName: "Full Grooming Kucing",
        }),
        redemption({ id: "r3", documentNumber: "POS-261016-0003", itemName: null }),
      ],
    });
    renderWithAuth(<MembershipCardDetail id="card-1" />);

    expect(await screen.findByRole("link", { name: "INV-2610-0009" })).toHaveAttribute(
      "href",
      "/dashboard/sales/invoice/inv-9",
    );
    expect(screen.getByText("Full Grooming Kucing")).toBeVisible();
    const receipt = screen.getByText("POS-261016-0003").closest("tr") as HTMLElement;
    expect(within(receipt).getByText("Kasir")).toBeVisible();
    // No itemName → the option's scope from the catalogue, as before.
    await waitFor(() => expect(within(receipt).getByText("Basic Grooming")).toBeVisible());
  });

  it("pauses a card with a reason, previews the new end, and refetches", async () => {
    const user = userEvent.setup();
    mocked.pause.mockResolvedValue(card);
    renderWithAuth(<MembershipCardDetail id="card-1" />);

    await user.click(await screen.findByRole("button", { name: /Tunda sementara/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Owner, Manager", { exact: false })).toBeVisible();

    const save = within(dialog).getByRole("button", { name: "Simpan penundaan" });
    expect(save).toBeDisabled();
    expect(within(dialog).getByText("Pilih alasan dulu.")).toBeVisible();
    expect(within(dialog).getByText("Berakhir baru")).toBeVisible();

    await user.click(within(dialog).getByRole("combobox", { name: /Alasan/ }));
    await user.click(await screen.findByRole("option", { name: "Hewan sakit atau dalam perawatan" }));
    expect(save).toBeEnabled();

    await user.click(save);
    await waitFor(() =>
      expect(mocked.pause).toHaveBeenCalledWith(
        "card-1",
        expect.objectContaining({ days: 7, reason: "Hewan sakit atau dalam perawatan", note: null }),
      ),
    );
    expect(swalToast).toHaveBeenCalledWith(expect.stringMatching(/ditunda/), "success");
    await waitFor(() => expect(mocked.getMembership).toHaveBeenCalledTimes(2));
  });

  it("keeps the dialog open and says the server's refusal as a toast", async () => {
    const user = userEvent.setup();
    const { ApiError } = jest.requireActual("@/services/api-error");
    mocked.cancel.mockRejectedValue(
      new ApiError("Membership yang sudah dipakai tidak bisa dibatalkan", 409),
    );
    renderWithAuth(<MembershipCardDetail id="card-1" />);

    await user.click(await screen.findByRole("button", { name: /Batalkan membership/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/pembatalan akan ditolak/)).toBeVisible();
    await user.click(within(dialog).getByRole("combobox", { name: /Alasan/ }));
    await user.click(await screen.findByRole("option", { name: "Salah input" }));
    await user.click(within(dialog).getByRole("button", { name: "Batalkan membership" }));

    await waitFor(() =>
      expect(swalToast).toHaveBeenCalledWith(
        "Membership yang sudah dipakai tidak bisa dibatalkan",
        "error",
        6000,
      ),
    );
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("switches Kelola off for a reader without the manage grant", async () => {
    renderWithAuth(<MembershipCardDetail id="card-1" />, {
      isSuperAdmin: false,
      permissions: [{ feature: "petMemberships", actions: ["read"] }],
    });

    const pause = await screen.findByRole("button", { name: /Tunda sementara/ });
    expect(pause).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Ubah tanggal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Perpanjang" })).not.toBeInTheDocument();
  });
});
