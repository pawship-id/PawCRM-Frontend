import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GroomingServiceStepsEditor } from "@/features/grooming/components/GroomingServiceStepsEditor";
import { serviceService } from "@/services/service.service";
import { serviceStepService } from "@/services/serviceStep.service";
import type { Service } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { makeServiceStep, primeServiceSteps } from "./helpers/serviceSteps";

jest.mock("@/services/service.service");
jest.mock("@/services/serviceStep.service");
jest.mock("@/lib/swal", () => ({
  ...jest.requireActual("@/lib/swal"),
  swalToast: jest.fn(),
}));

/**
 * A hotel service's Tahapan & Add-on saves itself (BO, 22 November 2026), as
 * Hotel › Pengaturan › Kegiatan harian does; grooming keeps its Simpan.
 */
const HOTEL = {
  _id: "svc-hotel",
  name: "Hotel Standar",
  serviceType: "main",
  serviceKind: "hotel",
  sessions: ["Check-in"],
  sessionWeights: [],
  sessionTimes: [],
  addonServiceIds: [],
} as unknown as Service;

const ADDONS = { all: [], loading: false, failed: false };

beforeEach(() => {
  jest.clearAllMocks();
  primeServiceSteps(serviceStepService.list, [
    makeServiceStep({ name: "Check-in", hotelTime: "Ikut jam datang" }),
    makeServiceStep({ name: "Makan pagi", hotelTime: "08:00" }),
  ]);
  jest
    .mocked(serviceService.update)
    .mockImplementation(
      async (_id, patch) => ({ ...HOTEL, ...patch }) as Service,
    );
});

it("saves a picked tahapan with no Simpan, and shows a worded Jam default as text", async () => {
  const onSaved = jest.fn();
  renderWithAuth(
    <GroomingServiceStepsEditor
      service={HOTEL}
      mayUpdate
      addons={ADDONS}
      onSaved={onSaved}
    />,
  );

  expect(await screen.findByText("Ikut jam datang")).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Jam default Check-in"),
  ).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /Tambah tahapan/ }));
  await userEvent.click(
    await screen.findByRole("button", { name: "Makan pagi" }),
  );

  await waitFor(() =>
    expect(serviceService.update).toHaveBeenCalledWith(
      "svc-hotel",
      expect.objectContaining({
        sessions: ["Check-in", "Makan pagi"],
        sessionTimes: [null, "08:00"],
      }),
    ),
  );
  expect(
    screen.queryByRole("button", { name: "Simpan tahapan & add-on" }),
  ).not.toBeInTheDocument();
  expect(await screen.findByText("Tersimpan")).toBeInTheDocument();
  expect(onSaved).toHaveBeenCalled();
});

it("offers Buat tahapan baru on a hotel service", async () => {
  renderWithAuth(
    <GroomingServiceStepsEditor
      service={HOTEL}
      mayUpdate
      addons={ADDONS}
      onSaved={jest.fn()}
    />,
  );

  await userEvent.click(
    await screen.findByRole("button", { name: /Tambah tahapan/ }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: "Buat tahapan baru…" }),
  );
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "langsung jadi tahapan layanan ini",
  );
});
