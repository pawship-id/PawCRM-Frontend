/**
 * Public surface of the Sales & Invoice feature.
 *
 * Pages import from here, never from deep component paths.
 *
 * TWO ENTRY POINTS, because the module has two screens: the receivables list and
 * one receivable. There is no hub — a landing page over a single list would be a
 * click that answers nothing — and no create form, because there is no
 * `POST /api/customer-invoices` to submit to yet (PCR-030).
 */
export { ReceivablesScreen } from "./components/ReceivablesScreen";
export { InvoiceDetail } from "./components/InvoiceDetail";
