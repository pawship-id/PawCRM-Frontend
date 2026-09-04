import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { TenantDetail } from "@/features/tenant";
import { tenantService } from "@/services/tenant.service";
import { ApiError } from "@/services/api-error";
import type { Tenant, User } from "@/types/api";

/**
 * The business-information screen. It reads GET /tenants/me through useTenant,
 * so the service is mocked and the component tested end to end from the fetch
 * down — the same shape the other feature screens are tested in.
 */
function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    _id: "6a5f6c916bc053bb21280a5e",
    name: "Klinik Hewan Sehat",
    slug: "klinik-hewan-sehat",
    logoUrl: null,
    timezone: "Asia/Jakarta",
    currency: "IDR",
    subscription: { status: "trialing", plan: "pro", trialEndsAt: null },
    settings: { hotelMode: "zone" },
    sv: 1,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

const signedInUser = {
  fullName: "Dian Pratama",
  email: "dian@klinik.test",
} as User;

describe("TenantDetail", () => {
  afterEach(() => jest.restoreAllMocks());

  it("renders the business profile once the tenant loads", async () => {
    jest.spyOn(tenantService, "me").mockResolvedValue(makeTenant());

    renderWithAuth(<TenantDetail />);

    expect(await screen.findByText("/klinik-hewan-sehat")).toBeInTheDocument();
    // The name appears twice (heading + detail row), which is intended: the
    // header identifies the business, the row is the labelled field.
    expect(screen.getAllByText("Klinik Hewan Sehat").length).toBeGreaterThan(0);
    expect(screen.getByText("Asia/Jakarta")).toBeInTheDocument();
    expect(screen.getByText("IDR")).toBeInTheDocument();
    expect(screen.getByText("6a5f6c916bc053bb21280a5e")).toBeInTheDocument();
  });

  it("shows the subscription status, plan and hotel mode in words", async () => {
    jest.spyOn(tenantService, "me").mockResolvedValue(makeTenant());

    renderWithAuth(<TenantDetail />);

    // Status badge renders in both the header and the Subscription card.
    expect((await screen.findAllByText("Trial")).length).toBe(2);
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Named zones")).toBeInTheDocument();
  });

  it("counts down a trial that has not ended yet", async () => {
    const inTenDays = new Date(Date.now() + 10 * 86_400_000).toISOString();
    jest.spyOn(tenantService, "me").mockResolvedValue(
      makeTenant({
        subscription: { status: "trialing", plan: "free", trialEndsAt: inTenDays },
      }),
    );

    renderWithAuth(<TenantDetail />);

    expect(await screen.findByText(/10 day\(s\) left/)).toBeInTheDocument();
  });

  it("reports a trial that already ended rather than clamping it to zero", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
    jest.spyOn(tenantService, "me").mockResolvedValue(
      makeTenant({
        subscription: {
          status: "past_due",
          plan: "basic",
          trialEndsAt: threeDaysAgo,
        },
      }),
    );

    renderWithAuth(<TenantDetail />);

    // A trial that lapsed while the account is past due is exactly the state an
    // owner needs to see, so it is spelled out instead of hidden.
    expect(await screen.findByText(/ended 3 day\(s\) ago/)).toBeInTheDocument();
    expect(screen.getAllByText("Past due").length).toBe(2);
  });

  it("falls back to the business initials when there is no logo", async () => {
    jest.spyOn(tenantService, "me").mockResolvedValue(makeTenant());

    renderWithAuth(<TenantDetail />);

    expect(await screen.findByText("KH")).toBeInTheDocument();
  });

  it("flags a tenant that was soft-deleted under a live session", async () => {
    jest
      .spyOn(tenantService, "me")
      .mockResolvedValue(makeTenant({ deletedAt: "2026-03-01T00:00:00.000Z" }));

    renderWithAuth(<TenantDetail />);

    expect(await screen.findByText("Deleted")).toBeInTheDocument();
  });

  it("names the signed-in account the tenant belongs to", async () => {
    jest.spyOn(tenantService, "me").mockResolvedValue(makeTenant());

    renderWithAuth(<TenantDetail />, { user: signedInUser });

    expect(
      await screen.findByText("Dian Pratama (dian@klinik.test)"),
    ).toBeInTheDocument();
  });

  it("shows the API message on failure and retries on demand", async () => {
    const me = jest
      .spyOn(tenantService, "me")
      .mockRejectedValueOnce(
        new ApiError("You do not have permission to perform this action", 403),
      )
      .mockResolvedValueOnce(makeTenant());

    renderWithAuth(<TenantDetail />);

    expect(
      await screen.findByText(/do not have permission/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("/klinik-hewan-sehat")).toBeInTheDocument();
    expect(me).toHaveBeenCalledTimes(2);
  });
});
