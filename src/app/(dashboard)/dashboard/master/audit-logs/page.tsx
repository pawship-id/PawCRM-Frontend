import type { Metadata } from "next";
import { AuditLogsScreen } from "@/features/audit-logs";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Audit Log · Master Data · Buloo",
};

export default function MasterAuditLogsPage() {
  return (
    <RequirePermission feature="auditLogs">
      <AuditLogsScreen />
    </RequirePermission>
  );
}
