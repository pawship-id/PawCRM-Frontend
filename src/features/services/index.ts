/**
 * Public surface of the services feature — the service form, and what the screen
 * that lists services borrows from it.
 *
 * Pages import from here, never from deep component paths. `ServiceForm` backs
 * `/dashboard/master/layanan/new` and `/[id]`. The hub at that prefix belongs to
 * `features/settings`, and the list is Grooming › Layanan & Harga — there is no
 * catalogue-wide list since 13 September 2026.
 */
export { ServiceForm } from "./components/ServiceForm";
export {
  ServiceLifecycleDialog,
  type ServiceLifecycleAction,
} from "./components/ServiceLifecycleDialog";
export { formatDuration, formatServicePrice } from "./format";
