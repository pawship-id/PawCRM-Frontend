import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { PosDevicesScreen } from "@/features/pos";
import { posOfflineService } from "@/services/posOffline.service";
import type { PosDevice } from "@/types/posOffline";

jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("@/services/posOffline.service", () => ({
  posOfflineService: { listDevices: jest.fn(), updateDevice: jest.fn() },
}));

const mocked = posOfflineService as jest.Mocked<typeof posOfflineService>;

function device(over: Partial<PosDevice> = {}): PosDevice {
  return {
    _id: "dev-1",
    branchId: "b1",
    branchCode: "PST",
    branchName: "Pusat",
    code: "K1",
    name: "Kasir depan",
    isActive: true,
    lastSeenAt: null,
    lastSeenBy: null,
    pendingCount: 0,
    createdAt: "2026-10-19T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.listDevices.mockResolvedValue([device()]);
  mocked.updateDevice.mockResolvedValue(device({ isActive: false }) as never);
});

/**
 * Switching a till off asks first (ui-rules §9) — the device stops selling on
 * the spot. Switching one back on stays one click.
 */
describe("PosDevicesScreen — Nonaktifkan perangkat", () => {
  it("asks before switching a device off, then sends isActive: false", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosDevicesScreen />);

    await user.click(await screen.findByRole("button", { name: "Nonaktifkan" }));
    const dialog = await screen.findByRole("dialog", { name: "Nonaktifkan perangkat kasir" });
    expect(dialog).toHaveTextContent("Kasir depan (PST-K1)");
    expect(dialog).toHaveTextContent("bisa diaktifkan lagi");
    expect(mocked.updateDevice).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Nonaktifkan perangkat" }));

    await waitFor(() =>
      expect(mocked.updateDevice).toHaveBeenCalledWith("dev-1", { isActive: false }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("warns when the device still holds unsent sales", async () => {
    const user = userEvent.setup();
    mocked.listDevices.mockResolvedValue([device({ pendingCount: 3 })]);
    renderWithAuth(<PosDevicesScreen />);

    await user.click(await screen.findByRole("button", { name: "Nonaktifkan" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("3 transaksi");
  });

  it("sends nothing when the dialog is cancelled", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosDevicesScreen />);

    await user.click(await screen.findByRole("button", { name: "Nonaktifkan" }));
    const dialog = await screen.findByRole("dialog", { name: "Nonaktifkan perangkat kasir" });
    await user.click(within(dialog).getByRole("button", { name: "Batal" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocked.updateDevice).not.toHaveBeenCalled();
  });

  it("reactivates an inactive device directly, without a dialog", async () => {
    const user = userEvent.setup();
    mocked.listDevices.mockResolvedValue([device({ isActive: false })]);
    renderWithAuth(<PosDevicesScreen />);

    await user.click(await screen.findByRole("button", { name: "Aktifkan" }));

    await waitFor(() =>
      expect(mocked.updateDevice).toHaveBeenCalledWith("dev-1", { isActive: true }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
