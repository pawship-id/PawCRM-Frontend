import { screen, waitFor } from "@testing-library/react";

import { DashboardOverview } from "@/features/dashboard";
import { productService } from "@/services/product.service";
import { productBatchService } from "@/services/productBatch.service";
import { ApiError } from "@/services/api-error";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/product.service");
jest.mock("@/services/productBatch.service");

/**
 * The landing page's alert tiles.
 *
 * PCR-013 and PCR-018 both put these cards on the DASHBOARD specifically. They
 * had been living on the inventory hub, which is one click further in than the
 * screen somebody opens every morning.
 *
 * What these tests guard:
 *
 *  1. each tile is gated on the grant its own endpoint enforces, and a role
 *     without it makes no request at all — not a request that 403s;
 *  2. zero is a real, reassuring answer and is rendered as one;
 *  3. a FAILURE is never rendered as zero. A zero that is really an error is the
 *     most dangerous number a landing page can show, because nobody goes and
 *     looks;
 *  4. the two tiles with no data source say "Segera" rather than "—" — a dash
 *     reads as a number that failed to load.
 */
const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

const FULL = [
  { feature: "products" as const, actions: ["read"] },
  { feature: "productBatches" as const, actions: ["read"] },
];

beforeEach(() => {
  jest.clearAllMocks();

  asMock(productService.lowStock).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 5, total: 3, totalPages: 1 },
  } as Awaited<ReturnType<typeof productService.lowStock>>);

  asMock(productBatchService.expiring).mockResolvedValue({
    items: [],
    withinDays: 30,
    // The computed cutoff the API echoes back — the tile does not read it, but
    // the type carries it and a partial fixture would drift from the contract.
    before: "2026-09-13",
    pagination: { page: 1, limit: 5, total: 2, totalPages: 1 },
  });
});

describe("DashboardOverview", () => {
  it("shows the restock and expiry counts", async () => {
    renderWithAuth(<DashboardOverview />, {
      isSuperAdmin: false,
      permissions: FULL,
    });

    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText("Produk perlu restock")).toBeInTheDocument();
    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(screen.getByText("Mendekati kedaluwarsa")).toBeInTheDocument();
  });

  it("links each tile at the report that explains it", async () => {
    renderWithAuth(<DashboardOverview />, {
      isSuperAdmin: false,
      permissions: FULL,
    });

    await screen.findByText("3");
    expect(
      screen.getByRole("link", { name: /produk perlu restock/i }),
    ).toHaveAttribute("href", "/dashboard/reports/low-stock");
    expect(
      screen.getByRole("link", { name: /mendekati kedaluwarsa/i }),
    ).toHaveAttribute("href", "/dashboard/inventory/batches");
  });

  /**
   * A tile that vanishes when everything is fine leaves the reader unsure
   * whether it was checked at all.
   */
  it("renders zero as a real answer, with a reassuring caption", async () => {
    asMock(productService.lowStock).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 5, total: 0, totalPages: 0 },
    } as Awaited<ReturnType<typeof productService.lowStock>>);

    renderWithAuth(<DashboardOverview />, {
      isSuperAdmin: false,
      permissions: FULL,
    });

    expect(await screen.findByText(/semua di atas batas/i)).toBeInTheDocument();
  });

  // The most dangerous number a landing page can show is a zero that is really
  // an error, because nobody goes and looks.
  it("never renders a failure as zero", async () => {
    asMock(productService.lowStock).mockRejectedValue(
      new ApiError("Forbidden", 403),
    );

    renderWithAuth(<DashboardOverview />, {
      isSuperAdmin: false,
      permissions: FULL,
    });

    expect(await screen.findByText(/gagal dimuat/i)).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  describe("permissions", () => {
    it("hides the expiry tile, and asks for nothing, without productBatches:read", async () => {
      renderWithAuth(<DashboardOverview />, {
        isSuperAdmin: false,
        permissions: [{ feature: "products", actions: ["read"] }],
      });

      await screen.findByText("3");
      expect(
        screen.queryByText("Mendekati kedaluwarsa"),
      ).not.toBeInTheDocument();
      // Not asked at all — a request that 403s is a request that should not have
      // been made.
      expect(productBatchService.expiring).not.toHaveBeenCalled();
    });

    it("hides the restock tile without products:read", async () => {
      renderWithAuth(<DashboardOverview />, {
        isSuperAdmin: false,
        permissions: [{ feature: "productBatches", actions: ["read"] }],
      });

      await waitFor(() =>
        expect(productBatchService.expiring).toHaveBeenCalled(),
      );
      expect(
        screen.queryByText("Produk perlu restock"),
      ).not.toBeInTheDocument();
      expect(productService.lowStock).not.toHaveBeenCalled();
    });

    it("still renders the shortcuts for a role with neither", async () => {
      renderWithAuth(<DashboardOverview />, {
        isSuperAdmin: false,
        permissions: [],
      });

      expect(screen.getByText("Quick access")).toBeInTheDocument();
      expect(productService.lowStock).not.toHaveBeenCalled();
      expect(productBatchService.expiring).not.toHaveBeenCalled();
    });
  });

  /**
   * A dash reads as a number that failed to load — the one impression a landing
   * page must not give. The badge says the feature is coming instead.
   */
  it("badges the tiles with no data source rather than showing a dash", async () => {
    renderWithAuth(<DashboardOverview />, {
      isSuperAdmin: false,
      permissions: FULL,
    });

    await screen.findByText("3");
    expect(screen.getByText("Booking hari ini")).toBeInTheDocument();
    expect(screen.getByText(/menunggu modul kasir/i)).toBeInTheDocument();
    expect(screen.getAllByText("Segera")).toHaveLength(2);
    expect(screen.queryByText("No data yet")).not.toBeInTheDocument();
  });
});
