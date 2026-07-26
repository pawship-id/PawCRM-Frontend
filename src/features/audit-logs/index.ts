/**
 * Public surface of the audit-logs feature (Master Data → Audit Log).
 *
 * Pages import from here, never from deep component paths. The trail is
 * read-only, so there is a single screen entry point — the list — and no
 * create/edit forms.
 */
export { AuditLogsScreen } from "./components/AuditLogsScreen";
