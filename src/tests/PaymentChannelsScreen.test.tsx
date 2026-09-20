import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PaymentChannelsScreen } from "@/features/payment-channels";
import { branchService } from "@/services/branch.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { paymentChannelService } from "@/services/paymentChannel.service";

import type { ChartOfAccount } from "@/types/accounting";

import { channel, channelPage } from "./helpers/cashTransactionFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/branch.service");
jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/chartOfAccounts.service");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/dashboard/pengaturan/channel-pembayaran",
}));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * CHANNEL PEMBAYARAN — the settings screen, as of 20 September 2026.
 *
 * THIS SUITE IS THE OTHER HALF OF THE MOVE. The rows used to be the body of
 * Kas & Bank and were tested there; KasBankScreen.test.tsx now covers the
 * account table that replaced them, and what a person can DO to a channel —
 * search it, restore it, edit it — is asserted here.
 *
 * THE MONEY IS DELIBERATELY ABSENT. There is no period on this screen and no
 * Masuk/Keluar/Saldo column, so the tests below assert their absence once: a
 * saldo per channel was never summable (several channels share one account),
 * and putting it back is the regression this suite is here to catch.
 */
const account = (
  over: Partial<ChartOfAccount> & Pick<ChartOfAccount, "_id" | "code" | "name">,
): ChartOfAccount =>
  ({
    accountType: "asset",
    accountCategory: "cash_bank",
    tenantId: "t1",
    parentId: null,
    isActive: true,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  }) as ChartOfAccount;

/* Two of these point at 1101 — still true, and no longer the table's problem. */
const CHANNELS = [
  channel({
    _id: "ch-kas-pusat",
    name: "Kas Pusat",
    type: "cash",
    accountId: "acc-1101",
  }),
  channel({
    _id: "ch-qris",
    name: "QRIS Settlement",
    type: "qris",
    accountId: "acc-1101",
    mdrPercent: 0.7,
    branchId: "b1",
  }),
  channel({
    _id: "ch-bank",
    name: "Bank BCA",
    type: "transfer",
    accountId: "acc-1102",
    isActive: false,
  }),
];

const lastList = () =>
  asMock(paymentChannelService.list).mock.calls.at(-1)?.[0];

beforeEach(() => {
  jest.clearAllMocks();

  asMock(paymentChannelService.list).mockResolvedValue(channelPage(CHANNELS));
  asMock(chartOfAccountsService.list).mockResolvedValue({
    items: [
      account({ _id: "acc-1101", code: "1101", name: "Kas Pusat" }),
      account({ _id: "acc-1102", code: "1102", name: "Bank BCA" }),
    ],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
  asMock(branchService.list).mockResolvedValue({
    items: [{ _id: "b1", name: "Cabang Kelapa Gading" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
});

describe("Channel Pembayaran — the rows", () => {
  it("names the account each channel lands in", async () => {
    renderWithAuth(<PaymentChannelsScreen />);

    const row = (await screen.findByText("QRIS Settlement")).closest("tr")!;
    expect(within(row).getByText("1101 · Kas Pusat")).toBeInTheDocument();
    /* Its own branch, not the blanket "Semua cabang" below. */
    expect(within(row).getByText("Cabang Kelapa Gading")).toBeInTheDocument();
  });

  /**
   * `branchId: null` means EVERY branch, not "none chosen yet" — a dash there
   * would read as unset and send somebody looking for the missing setting.
   */
  it("reads a channel that belongs to no branch as belonging to all of them", async () => {
    renderWithAuth(<PaymentChannelsScreen />);

    const row = (await screen.findByText("Kas Pusat")).closest("tr")!;
    expect(within(row).getByText("Semua cabang")).toBeInTheDocument();
  });

  /**
   * The chart of accounts is fetched separately and allowed to fail. A channel
   * whose account could not be named is still a channel somebody needs to edit,
   * so the row survives with a dash instead of the table failing.
   */
  it("keeps the row when the chart of accounts could not be read", async () => {
    asMock(chartOfAccountsService.list).mockRejectedValue(new Error("nope"));
    renderWithAuth(<PaymentChannelsScreen />);

    const row = (await screen.findByText("Bank BCA")).closest("tr")!;
    expect(within(row).getByText("—")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks a channel that is switched off without calling it deleted", async () => {
    renderWithAuth(<PaymentChannelsScreen />);

    const row = (await screen.findByText("Bank BCA")).closest("tr")!;
    expect(within(row).getByText("Tidak aktif")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Ubah" })).toHaveAttribute(
      "href",
      "/dashboard/pengaturan/channel-pembayaran/ch-bank",
    );
  });

  /**
   * THE COLUMNS THAT MOVED TO KAS & BANK MUST NOT COME BACK. A saldo printed
   * per channel invites adding the column up and getting twice the money the
   * shop has, which is why it is filed by account now.
   */
  it("carries no money column and no period", async () => {
    renderWithAuth(<PaymentChannelsScreen />);
    await screen.findByText("Kas Pusat");

    for (const heading of ["Masuk", "Keluar", "Saldo"]) {
      expect(
        screen.queryByRole("columnheader", { name: heading }),
      ).not.toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "Bulan ini" }),
    ).not.toBeInTheDocument();
  });
});

describe("Channel Pembayaran — the quick bar", () => {
  it("searches by what was typed, once typing settles", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PaymentChannelsScreen />);
    await waitFor(() => expect(paymentChannelService.list).toHaveBeenCalled());

    await user.type(
      screen.getByRole("searchbox", { name: "Cari channel pembayaran" }),
      "qris",
    );

    await waitFor(() => expect(lastList()).toMatchObject({ search: "qris" }), {
      timeout: 2000,
    });
  });

  /**
   * A TOGGLE IS A FINISHED DECISION, so it does not wait out the search box's
   * 300 ms. This is the asymmetry `useDebouncedQuery` exists for, and the only
   * way back for a soft-deleted channel — without it there is no restore.
   */
  it("asks for deleted channels on the click, not a third of a second later", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PaymentChannelsScreen />);
    await waitFor(() => expect(paymentChannelService.list).toHaveBeenCalled());

    await user.click(screen.getByLabelText("Tampilkan terhapus"));

    await waitFor(() =>
      expect(lastList()).toMatchObject({ includeDeleted: true }),
    );
  });

  it("offers Pulihkan on a deleted channel", async () => {
    asMock(paymentChannelService.list).mockResolvedValue(
      channelPage([
        channel({
          _id: "ch-gone",
          name: "EDC Lama",
          type: "edc",
          accountId: "acc-1102",
          deletedAt: "2026-09-01T00:00:00.000Z",
        }),
      ]),
    );
    renderWithAuth(<PaymentChannelsScreen />);

    const row = (await screen.findByText("EDC Lama")).closest("tr")!;
    expect(within(row).getByText("Terhapus")).toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "Pulihkan" }),
    ).toBeInTheDocument();
    expect(
      within(row).queryByRole("button", { name: "Hapus" }),
    ).not.toBeInTheDocument();
  });
});

describe("Channel Pembayaran — failure and grants", () => {
  it("offers a retry when the list fails, and recovers on it", async () => {
    asMock(paymentChannelService.list).mockRejectedValueOnce(
      new Error("Jaringan putus."),
    );
    const user = userEvent.setup();
    renderWithAuth(<PaymentChannelsScreen />);

    await screen.findByText("Jaringan putus.");
    await user.click(screen.getByRole("button", { name: "Coba lagi" }));

    expect(await screen.findByText("Kas Pusat")).toBeInTheDocument();
    expect(screen.queryByText("Jaringan putus.")).not.toBeInTheDocument();
  });

  it("hides Channel baru from a role that may only read", async () => {
    renderWithAuth(<PaymentChannelsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "paymentChannels", actions: ["read"] }],
    });

    expect(await screen.findByText("Kas Pusat")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Channel baru" }),
    ).not.toBeInTheDocument();
  });
});
