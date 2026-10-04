import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FixedCostDetail } from "@/features/fixed-costs";
import { fixedCostService } from "@/services/fixedCost.service";
import type { FixedCost } from "@/types/accounting";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/fixedCost.service");
// The repo's convention: sweetalert is not exercised in jsdom.
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  usePathname: () => "/dashboard/keuangan/kas-bank/biaya-tetap/fc1",
}));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * ONE FIXED COST — the page the list's rows open.
 *
 * NOT IN THE MOCKUP: its Biaya Tetap table has no clickable row and no row
 * action, so this page follows the transaction detail beside it instead.
 *
 * What these guard: that a template is never drawn as money that moved, that
 * pausing is offered ahead of deleting, that deleting says plainly what it does
 * NOT remove, and that each act is behind its own grant.
 */
const fixedCost = (overrides: Partial<FixedCost> = {}): FixedCost => ({
  _id: "fc1",
  name: "Sewa Toko Pusat",
  kind: "expense",
  direction: "out",
  branchId: "b1",
  branchName: "Pusat",
  accountId: "a1",
  accountName: "1102 · Bank BCA",
  counterAccounts: [{ id: "a2", code: "6-1002", name: "Beban Sewa" }],
  amount: "3500000.0000",
  lines: [
    {
      accountId: "a2",
      amount: "3500000.0000",
      businessLineId: null,
      allocationId: null,
      memo: "Sewa bulanan",
    },
  ],
  partyType: null,
  partyId: null,
  partyName: "Pemilik Ruko",
  cashflowType: "operating",
  ref: null,
  note: "Dibayar tiap awal bulan",
  interval: "monthly",
  startDate: "2026-09-01T00:00:00.000Z",
  nextDueAt: "2026-10-01T00:00:00.000Z",
  postedCount: 1,
  lastPostedAt: "2026-09-01T00:00:00.000Z",
  lastTransactionId: "ct7",
  isActive: true,
  dueCount: 0,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  asMock(fixedCostService.update).mockResolvedValue(fixedCost() as never);
  asMock(fixedCostService.remove).mockResolvedValue(fixedCost() as never);
});

describe("Biaya Tetap — the detail page", () => {
  it("states the schedule, its lines and what it has produced", async () => {
    renderWithAuth(<FixedCostDetail fixedCost={fixedCost()} />);

    expect(
      screen.getByRole("heading", { name: "Sewa Toko Pusat" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Aktif")).toBeInTheDocument();
    expect(screen.getByText(/1 Okt 2026/)).toBeInTheDocument();
    expect(screen.getByText("6-1002 · Beban Sewa")).toBeInTheDocument();
    // The history: the count, and the link that is the proof behind it.
    expect(screen.getByText("1×")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Buka transaksinya/ }),
    ).toHaveAttribute(
      "href",
      "/dashboard/keuangan/kas-bank/transaksi/ct7",
    );
  });

  /*
    A PAUSED SCHEDULE WHOSE PAGE LOOKS ORDINARY is the one mistake this screen
    cannot afford — somebody would read a due date nothing is going to honour.
  */
  it("says plainly when a schedule is paused", async () => {
    renderWithAuth(<FixedCostDetail fixedCost={fixedCost({ isActive: false })} />);

    expect(screen.getByText("Nonaktif")).toBeInTheDocument();
    expect(screen.getByText(/tidak bisa dicatat sampai diaktifkan/i)).toBeInTheDocument();
  });

  it("offers Catat only while something is due", async () => {
    const { unmount } = renderWithAuth(
      <FixedCostDetail fixedCost={fixedCost()} />,
    );
    expect(
      screen.queryByRole("button", { name: "Catat" }),
    ).not.toBeInTheDocument();
    unmount();

    renderWithAuth(<FixedCostDetail fixedCost={fixedCost({ dueCount: 2 })} />);
    expect(screen.getByRole("button", { name: "Catat" })).toBeInTheDocument();
    expect(screen.getByText("2× belum dicatat")).toBeInTheDocument();
  });

  /*
    ONE EDIT URL FOR BOTH DOCUMENTS since 21 September 2026 — the schedule's own
    `/biaya-tetap/:id/edit` is gone, and the transaction route tries a
    transaction first and falls back to a fixed cost.
  */
  it("links Ubah at the one edit URL Kas & Bank keeps", async () => {
    renderWithAuth(<FixedCostDetail fixedCost={fixedCost()} />);

    expect(screen.getByRole("link", { name: /Ubah/ })).toHaveAttribute(
      "href",
      "/dashboard/keuangan/kas-bank/transaksi/fc1/edit",
    );
  });
});

describe("Biaya Tetap — pausing and deleting", () => {
  it("pauses a running schedule from the menu", async () => {
    const user = userEvent.setup();
    renderWithAuth(<FixedCostDetail fixedCost={fixedCost()} />);

    await user.click(screen.getByRole("button", { name: "Tindakan lain" }));
    await user.click(await screen.findByText("Jeda biaya tetap"));

    await waitFor(() =>
      expect(fixedCostService.update).toHaveBeenCalledWith("fc1", {
        isActive: false,
      }),
    );
  });

  it("offers to resume a paused one instead", async () => {
    const user = userEvent.setup();
    renderWithAuth(<FixedCostDetail fixedCost={fixedCost({ isActive: false })} />);

    await user.click(screen.getByRole("button", { name: "Tindakan lain" }));
    await user.click(await screen.findByText("Aktifkan lagi"));

    await waitFor(() =>
      expect(fixedCostService.update).toHaveBeenCalledWith("fc1", {
        isActive: true,
      }),
    );
  });

  /*
    DELETING A TEMPLATE IS SAFE — it has no journal entry — but it must say what
    it does NOT remove, or somebody reads it as undoing the payments too.
  */
  it("says the posted transactions survive the delete", async () => {
    const user = userEvent.setup();
    renderWithAuth(<FixedCostDetail fixedCost={fixedCost({ postedCount: 4 })} />);

    await user.click(screen.getByRole("button", { name: "Tindakan lain" }));
    await user.click(await screen.findByText("Hapus biaya tetap"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("4 transaksi yang sudah dicatat");
    expect(dialog).toHaveTextContent(/TIDAK ikut terhapus/);
    expect(fixedCostService.remove).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Hapus" }));

    await waitFor(() =>
      expect(fixedCostService.remove).toHaveBeenCalledWith("fc1"),
    );
    // The redirect lands a tick after the call resolves, so it is awaited too.
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        "/dashboard/keuangan/kas-bank/biaya-tetap",
      ),
    );
  });

  it("words the delete differently when nothing has been posted", async () => {
    const user = userEvent.setup();
    renderWithAuth(<FixedCostDetail fixedCost={fixedCost({ postedCount: 0 })} />);

    await user.click(screen.getByRole("button", { name: "Tindakan lain" }));
    await user.click(await screen.findByText("Hapus biaya tetap"));

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Belum ada transaksi yang dicatat dari sini",
    );
  });
});

describe("Biaya Tetap — detail grants", () => {
  /*
    EACH ACT BEHIND ITS OWN GRANT. A reader may look; changing the plan is
    `update`, removing it `delete`, and paying from it `post`.
  */
  it("gives a reader the facts and none of the actions", async () => {
    renderWithAuth(<FixedCostDetail fixedCost={fixedCost({ dueCount: 1 })} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "fixedCosts", actions: ["read"] }],
    });

    expect(
      screen.getByRole("heading", { name: "Sewa Toko Pusat" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ubah/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Catat" }),
    ).not.toBeInTheDocument();
  });

  it("withholds Hapus from a role that may edit but not delete", async () => {
    const user = userEvent.setup();
    renderWithAuth(<FixedCostDetail fixedCost={fixedCost()} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "fixedCosts", actions: ["read", "update"] }],
    });

    await user.click(screen.getByRole("button", { name: "Tindakan lain" }));

    expect(await screen.findByText("Jeda biaya tetap")).toBeInTheDocument();
    expect(screen.queryByText("Hapus biaya tetap")).not.toBeInTheDocument();
  });
});
