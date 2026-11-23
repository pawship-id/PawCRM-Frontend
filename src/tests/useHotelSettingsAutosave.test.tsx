import { act, renderHook, waitFor } from "@testing-library/react";

import { addStep } from "@/features/grooming/serviceStepsDraft";
import { useHotelSettings } from "@/features/hotel/hooks/useHotelSettings";
import { withHotelDefaults } from "@/features/hotel/settings";
import { petOptionService } from "@/services/petOption.service";
import { serviceStepService } from "@/services/serviceStep.service";
import { tenantService } from "@/services/tenant.service";
import type { HotelSettings, Tenant } from "@/types/api";

import { makeServiceStep, primeServiceSteps } from "./helpers/serviceSteps";

jest.mock("@/services/tenant.service");
jest.mock("@/services/petOption.service");
jest.mock("@/services/serviceStep.service");
jest.mock("@/lib/swal", () => ({
  ...jest.requireActual("@/lib/swal"),
  swalToast: jest.fn(),
}));

/**
 * Kegiatan harian saves itself (BO, 22 November 2026): no Simpan, and never
 * the commission edit still waiting for Simpan.
 */
const tenantWith = (hotel: Partial<HotelSettings>) =>
  ({ settings: { hotel: withHotelDefaults(hotel) } }) as unknown as Tenant;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(petOptionService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 1 },
  } as never);
  primeServiceSteps(serviceStepService.list, [
    makeServiceStep({ name: "Makan pagi", hotelTime: "08:00" }),
    makeServiceStep({ name: "Check-in", hotelTime: "Ikut jam datang" }),
  ]);
  jest.mocked(tenantService.me).mockResolvedValue(tenantWith({}));
  jest
    .mocked(tenantService.updateSettings)
    .mockImplementation(async (patch) =>
      tenantWith((patch as { hotel: HotelSettings }).hotel),
    );
});

it("saves a picked kegiatan on its own, on top of the saved commission", async () => {
  const { result } = renderHook(() => useHotelSettings());
  await waitFor(() => expect(result.current.draft).not.toBeNull());

  // An unsaved commission edit, then a kegiatan picked.
  act(() => result.current.update({ serviceMode: "fixed", fixed: "5.000" }));
  act(() =>
    result.current.updateSteps((steps) =>
      addStep(steps, "Makan pagi", "08:00"),
    ),
  );

  await waitFor(() =>
    expect(tenantService.updateSettings).toHaveBeenCalledTimes(1),
  );
  const sent = jest.mocked(tenantService.updateSettings).mock.calls[0][0] as {
    hotel: HotelSettings;
  };
  expect(sent.hotel.defaultSteps).toEqual({
    sessions: ["Makan pagi"],
    sessionWeights: [],
    sessionTimes: ["08:00"],
  });
  expect(sent.hotel.commission.service.mode).toBe("none");

  await waitFor(() => expect(result.current.stepsStatus).toBe("saved"));
  // The commission edit is still waiting for Simpan; the kegiatan is not.
  expect(result.current.dirty).toBe(true);
  expect(result.current.draft?.serviceMode).toBe("fixed");
});

it("keeps no clock time for a kegiatan whose Jam default is words", async () => {
  const { result } = renderHook(() => useHotelSettings());
  await waitFor(() => expect(result.current.draft).not.toBeNull());

  act(() =>
    result.current.updateSteps((steps) => ({
      ...addStep(steps, "Check-in"),
      times: { "Check-in": "10:00" },
    })),
  );

  await waitFor(() =>
    expect(tenantService.updateSettings).toHaveBeenCalledTimes(1),
  );
  const sent = jest.mocked(tenantService.updateSettings).mock.calls[0][0] as {
    hotel: HotelSettings;
  };
  expect(sent.hotel.defaultSteps.sessionTimes).toEqual([]);
});
