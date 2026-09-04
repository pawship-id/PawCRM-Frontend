import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PaymentChannelForm } from "@/features/payment-channels";
import { paymentChannelService } from "@/services/paymentChannel.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";

import type { ChannelDirection } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/branch.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const mockedChannels = paymentChannelService as jest.Mocked<
  typeof paymentChannelService
>;
const mockedAccounts = chartOfAccountsService as jest.Mocked<
  typeof chartOfAccountsService
>;
const mockedBranches = branchService as jest.Mocked<typeof branchService>;

const ACCOUNT_ID = "5a7f1f77bcf86cd7994390aa";
const BRANCH_ID = "5a7f1f77bcf86cd7994390bb";
const CHANNEL_ID = "5a7f1f77bcf86cd7994390cc";

const channelFixture = {
  _id: CHANNEL_ID,
  tenantId: "507f1f77bcf86cd799439011",
  type: "qris" as const,
  name: "QRIS Xendit",
  accountId: ACCOUNT_ID,
  mdrPercent: 0.7,
  usableFor: ["in"] as ChannelDirection[],
  branchId: null,
  requiresReference: true,
  sortOrder: 0,
  isActive: true,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedAccounts.list.mockResolvedValue({
    items: [{ _id: ACCOUNT_ID, code: "1102", name: "Bank" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedBranches.list.mockResolvedValue({
    items: [{ _id: BRANCH_ID, name: "Toko Pusat" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

/** Renders create mode and waits for the account/branch lookups to settle. */
async function renderNew() {
  renderWithAuth(<PaymentChannelForm />);
  await waitFor(() => expect(mockedAccounts.list).toHaveBeenCalled());
}

describe("PaymentChannelForm — the MDR field only exists where a fee is deducted", () => {
  it("is hidden for cash, the default type", async () => {
    // Cash arrives whole. A rate there is not a mistake to allow and then refuse
    // — it is a field with no meaning.
    await renderNew();

    expect(screen.queryByLabelText(/mdr/i)).not.toBeInTheDocument();
  });

  it("is hidden for transfer — the fee is paid by the sender", async () => {
    await renderNew();

    await userEvent.click(screen.getByLabelText(/tipe/i));
    await userEvent.click(await screen.findByRole("option", { name: "Transfer" }));

    expect(screen.queryByLabelText(/mdr/i)).not.toBeInTheDocument();
  });

  it.each([
    ["QRIS", "qris"],
    ["EDC", "edc"],
  ])("appears for %s", async (label) => {
    await renderNew();

    await userEvent.click(screen.getByLabelText(/tipe/i));
    await userEvent.click(await screen.findByRole("option", { name: label }));

    expect(await screen.findByLabelText(/mdr/i)).toBeVisible();
  });

  it("clears a typed rate when the type moves back to one with no fee", async () => {
    // A value left in state would be sent on the next save — a 400 for something
    // the user can no longer see, which is the worst refusal to receive.
    mockedChannels.create.mockResolvedValue(channelFixture);
    await renderNew();

    await userEvent.click(screen.getByLabelText(/tipe/i));
    await userEvent.click(await screen.findByRole("option", { name: "QRIS" }));
    await userEvent.type(await screen.findByLabelText(/mdr/i), "0.7");

    await userEvent.click(screen.getByLabelText(/tipe/i));
    await userEvent.click(await screen.findByRole("option", { name: "Tunai" }));

    await userEvent.type(screen.getByLabelText(/nama channel/i), "Kas");
    await userEvent.click(
      screen.getByRole("button", { name: /pilih akun/i }),
    );
    await userEvent.click(await screen.findByRole("option", { name: /1102/ }));
    await userEvent.click(screen.getByRole("button", { name: /buat channel/i }));

    await waitFor(() =>
      expect(mockedChannels.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: "cash", mdrPercent: 0 }),
      ),
    );
  });
});

describe("PaymentChannelForm — validation", () => {
  it("refuses to submit without a name and an account", async () => {
    await renderNew();

    await userEvent.click(screen.getByRole("button", { name: /buat channel/i }));

    expect(await screen.findByText(/nama channel wajib diisi/i)).toBeVisible();
    expect(screen.getByText(/pilih akun yang dicatat/i)).toBeVisible();
    expect(mockedChannels.create).not.toHaveBeenCalled();
  });

  it("sends null for the branch when none is picked — tenant-wide, not unset", async () => {
    mockedChannels.create.mockResolvedValue(channelFixture);
    await renderNew();

    await userEvent.type(screen.getByLabelText(/nama channel/i), "Kas");
    await userEvent.click(screen.getByRole("button", { name: /pilih akun/i }));
    await userEvent.click(await screen.findByRole("option", { name: /1102/ }));
    await userEvent.click(screen.getByRole("button", { name: /buat channel/i }));

    await waitFor(() =>
      expect(mockedChannels.create).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: null }),
      ),
    );
  });
});

describe("PaymentChannelForm — the server's rules land on their fields", () => {
  async function submitMinimal() {
    await userEvent.type(screen.getByLabelText(/nama channel/i), "Kas");
    await userEvent.click(screen.getByRole("button", { name: /pilih akun/i }));
    await userEvent.click(await screen.findByRole("option", { name: /1102/ }));
    await userEvent.click(screen.getByRole("button", { name: /buat channel/i }));
  }

  it("binds a non-asset account refusal to the account field", async () => {
    mockedChannels.create.mockRejectedValue(
      new ApiError("Account 4101 is income, not an asset", 400, {
        details: [{ field: "accountId", message: "must be an asset" }],
      }),
    );
    await renderNew();
    await submitMinimal();

    // A phrase unique to the ERROR — the card's own description also says
    // "harus akun aset", and matching that would pass without the binding.
    expect(
      await screen.findByText(/akun ini tidak bisa dipakai/i),
    ).toBeVisible();
  });

  it("binds the per-branch cash rule to the branch field", async () => {
    mockedChannels.create.mockRejectedValue(
      new ApiError("A cash channel must belong to a branch", 400, {
        details: [{ field: "branchId", message: "pick a branch" }],
      }),
    );
    await renderNew();
    await submitMinimal();

    // "harus punya cabang" belongs to the error; the field's hint says "wajib
    // punya cabang", so the two do not collide.
    expect(await screen.findByText(/harus punya cabang/i)).toBeVisible();
  });

  it("binds a duplicate-name 409 to the name field, naming the tab", async () => {
    mockedChannels.create.mockRejectedValue(
      new ApiError("A cash channel named 'Kas' already exists", 409),
    );
    await renderNew();
    await submitMinimal();

    expect(await screen.findByText(/sudah ada channel tunai/i)).toBeVisible();
  });
});

describe("PaymentChannelForm — editing", () => {
  beforeEach(() => {
    mockedChannels.getById.mockResolvedValue(channelFixture);
    mockedChannels.update.mockResolvedValue(channelFixture);
  });

  it("loads the channel, MDR field included for its type", async () => {
    renderWithAuth(<PaymentChannelForm channelId={CHANNEL_ID} />);

    expect(await screen.findByDisplayValue("QRIS Xendit")).toBeVisible();
    expect(screen.getByDisplayValue("0.7")).toBeVisible();
  });

  it("offers the availability switch only when editing", async () => {
    renderWithAuth(<PaymentChannelForm channelId={CHANNEL_ID} />);

    expect(await screen.findByLabelText(/^aktif$/i)).toBeVisible();
  });

  it("does not offer it when creating", async () => {
    await renderNew();

    expect(screen.queryByLabelText(/^aktif$/i)).not.toBeInTheDocument();
  });

  it("saves and returns to the list", async () => {
    renderWithAuth(<PaymentChannelForm channelId={CHANNEL_ID} />);

    await screen.findByDisplayValue("QRIS Xendit");
    await userEvent.clear(screen.getByLabelText(/nama channel/i));
    await userEvent.type(screen.getByLabelText(/nama channel/i), "QRIS BCA");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan channel/i }),
    );

    await waitFor(() =>
      expect(mockedChannels.update).toHaveBeenCalledWith(
        CHANNEL_ID,
        expect.objectContaining({ name: "QRIS BCA" }),
      ),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/keuangan/kas-bank");
  });
});
