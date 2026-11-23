import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ServiceForm } from "@/features/services/components/ServiceForm";
import { rememberServiceFormOrigin } from "@/features/services/formOrigin";
import { branchService } from "@/services/branch.service";
import { hotelService } from "@/services/hotel.service";
import { petOptionService } from "@/services/petOption.service";
import { serviceService } from "@/services/service.service";
import { serviceStepService } from "@/services/serviceStep.service";
import { variantOptionService } from "@/services/variantOption.service";
import { zoneService } from "@/services/zone.service";

import { primePetOptions } from "./helpers/petOptions";
import { renderWithAuth } from "./helpers/renderWithAuth";
import { primeServiceSteps } from "./helpers/serviceSteps";
import { primeVariantOptions } from "./helpers/variantOptions";

jest.mock("@/services/service.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/petOption.service");
jest.mock("@/services/variantOption.service");
jest.mock("@/services/zone.service");
jest.mock("@/services/serviceStep.service");
jest.mock("@/services/hotel.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("@/components/ImageField", () => ({
  ImageField: () => <div>gambar layanan</div>,
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

/**
 * A hotel service names the jenis hewan it takes (23 November 2026, BO) —
 * at least one, before the form is sent.
 */
beforeEach(() => {
  jest.clearAllMocks();
  window.sessionStorage.clear();
  primePetOptions(petOptionService.list);
  primeVariantOptions(variantOptionService.list, zoneService.list);
  primeServiceSteps(serviceStepService.list, []);
  jest.mocked(branchService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  jest.mocked(serviceService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.mocked(hotelService.listRoomTypes as any).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  });
});

it("asks for a jenis hewan on a hotel service, and lists the tenant's species", async () => {
  rememberServiceFormOrigin({
    serviceKind: "hotel",
    listPath: "/dashboard/service/hotel/catalog",
  });
  renderWithAuth(<ServiceForm />);

  expect(await screen.findByText("Jenis hewan")).toBeInTheDocument();
  expect(
    await screen.findByRole("checkbox", { name: "Kucing" }),
  ).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Buat layanan" }));
  expect(
    await screen.findByText("Pilih minimal satu jenis hewan."),
  ).toBeInTheDocument();
  await waitFor(() => expect(serviceService.create).not.toHaveBeenCalled());
});
