import { render, screen } from "@testing-library/react";

import { AuditLogsTable } from "@/features/audit-logs/components/AuditLogsTable";
import type { AuditLog } from "@/types/api";

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    _id: "a1",
    tenantId: "t1",
    userId: { _id: "u1", fullName: "Ana Diaz", email: "ana@paw.com" },
    branchId: null,
    action: "login",
    entityType: "session",
    entityId: "s1",
    ipAddress: "10.0.0.5",
    userAgent: "jest",
    metadata: {},
    createdAt: "2026-01-01T09:30:00.000Z",
    updatedAt: "2026-01-01T09:30:00.000Z",
    ...overrides,
  };
}

describe("AuditLogsTable", () => {
  it("renders a row with the actor, a labelled action badge, entity and IP", () => {
    render(<AuditLogsTable logs={[makeLog()]} loading={false} />);

    expect(screen.getByText("Ana Diaz")).toBeInTheDocument();
    expect(screen.getByText("ana@paw.com")).toBeInTheDocument();
    expect(screen.getByText("Login")).toBeInTheDocument();
    expect(screen.getByText("session")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.5")).toBeInTheDocument();
  });

  it("summarises a failed_login's metadata reason", () => {
    render(
      <AuditLogsTable
        logs={[
          makeLog({
            action: "failed_login",
            entityType: "user",
            metadata: { reason: "invalid_password" },
          }),
        ]}
        loading={false}
      />,
    );

    expect(screen.getByText("Failed login")).toBeInTheDocument();
    expect(screen.getByText("Reason: invalid_password")).toBeInTheDocument();
  });

  it("degrades gracefully when the actor and IP are absent", () => {
    render(
      <AuditLogsTable
        logs={[makeLog({ userId: null, ipAddress: null })]}
        loading={false}
      />,
    );

    expect(screen.getByText("Unknown user")).toBeInTheDocument();
    // The IP cell falls back to an em dash.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("highlights the search term in the IP address cell", () => {
    render(
      <AuditLogsTable
        logs={[makeLog({ ipAddress: "10.0.0.5" })]}
        loading={false}
        search="0.0"
      />,
    );

    // The matched substring is wrapped in a <mark>.
    const mark = screen.getByText("0.0");
    expect(mark.tagName).toBe("MARK");
  });

  it("shows the empty state when there are no logs", () => {
    render(<AuditLogsTable logs={[]} loading={false} />);

    expect(
      screen.getByText("No audit logs match the current filters."),
    ).toBeInTheDocument();
  });
});
