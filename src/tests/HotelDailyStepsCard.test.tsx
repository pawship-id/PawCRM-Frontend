import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { HotelDailyStepsCard } from "@/features/hotel/components/HotelDailyStepsCard";
import type { StepsDraft } from "@/features/grooming/serviceStepsDraft";
import { serviceStepService } from "@/services/serviceStep.service";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { makeServiceStep, primeServiceSteps } from "./helpers/serviceSteps";

jest.mock("@/services/serviceStep.service");
jest.mock("@/lib/swal", () => ({
  ...jest.requireActual("@/lib/swal"),
  swalToast: jest.fn(),
}));

/**
 * Hotel › Pengaturan › Kegiatan harian (22 November 2026): "Buat tahapan
 * baru…" opens the Pengaturan › Tahapan form, and the step it saves joins the
 * kegiatan with its Jam default; a Jam default written as words is shown, not
 * edited.
 */
function Harness({ initial }: { initial: StepsDraft }) {
  const [steps, setSteps] = useState(initial);
  return (
    <HotelDailyStepsCard
      steps={steps}
      onChange={(change) => setSteps(change)}
      showWeights={false}
      mayUpdate
      mayAddToList
      disabled={false}
    />
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  primeServiceSteps(serviceStepService.list, [
    makeServiceStep({ name: "Check-in", hotelTime: "Ikut jam datang" }),
    makeServiceStep({ name: "Makan pagi", hotelTime: "08:00" }),
  ]);
});

it("shows a Jam default written as words as text, and a clock time as an input", async () => {
  renderWithAuth(
    <Harness
      initial={{
        sessions: ["Check-in", "Makan pagi"],
        weights: {},
        times: { "Makan pagi": "08:00" },
      }}
    />,
  );

  expect(await screen.findByText("Ikut jam datang")).toBeInTheDocument();
  expect(
    screen.queryByLabelText("Jam default Check-in"),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Jam default Makan pagi")).toHaveValue("08:00");
});

it("creates a step through the full form and adds it with its time", async () => {
  jest.mocked(serviceStepService.create).mockResolvedValue(
    makeServiceStep({
      name: "Makan malam",
      estimateMinutes: 15,
      hotelTime: "17:00",
    }),
  );

  renderWithAuth(
    <Harness initial={{ sessions: [], weights: {}, times: {} }} />,
  );

  await userEvent.click(screen.getByRole("button", { name: /Tambah tahapan/ }));
  await userEvent.type(screen.getByLabelText("Cari tahapan"), "Makan malam");
  await userEvent.click(
    await screen.findByRole("button", { name: "Buat tahapan “Makan malam”…" }),
  );

  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText(/Nama tahapan/)).toHaveValue(
    "Makan malam",
  );
  await userEvent.type(within(dialog).getByLabelText("Estimasi"), "15");
  await userEvent.type(
    within(dialog).getByLabelText("Jam default (hotel)"),
    "17:00",
  );
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Tambah tahapan" }),
  );

  await waitFor(() =>
    expect(serviceStepService.create).toHaveBeenCalledWith({
      name: "Makan malam",
      estimateMinutes: 15,
      hotelTime: "17:00",
      note: null,
      usedIn: ["grooming", "hotel", "pickup-delivery"],
    }),
  );
  expect(await screen.findByLabelText("Jam default Makan malam")).toHaveValue(
    "17:00",
  );
});
