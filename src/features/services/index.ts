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
export {
  formatDuration,
  formatDurationRange,
  formatServicePrice,
  serviceDurationBounds,
  servicePriceBounds,
} from "./format";
// What a screen that READS a service needs to name its variants the way the
// form that wrote them does.
export {
  buildVariantCombos,
  comboKey,
  VARIANT_AXIS_TABLE,
  type VariantCombo,
} from "./components/ServiceFormFields";
// The tahapan weight rules, for the detail page that edits tahapan in place.
export {
  evenSessionWeights,
  sessionWeightsError,
  sessionWeightsPayload,
  WEIGHTS_MIN_SESSIONS,
} from "./components/ServiceFormFields";
