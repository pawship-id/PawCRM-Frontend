/**
 * Public surface of the services feature — the service form, and what the screen
 * that lists services borrows from it.
 *
 * Pages import from here, never from deep component paths. `ServiceForm` backs
 * `/dashboard/pengaturan/layanan/new` and `/[id]`. The hub at that prefix belongs to
 * `features/settings`, and the list is Grooming › Layanan & Harga — there is no
 * catalogue-wide list since 13 September 2026.
 */
export { ServiceForm } from "./components/ServiceForm";
export { ServiceFormLink } from "./components/ServiceFormLink";
export { ServiceKindsField } from "./components/ServiceKindsField";
export {
  ADDON_FORM_ORIGIN,
  clearServiceFormOrigin,
  readServiceFormOrigin,
  rememberServiceFormOrigin,
  type ServiceFormOrigin,
} from "./formOrigin";
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
// form that wrote them does — and, since 14 September 2026, the tenant's axis
// values every one of those functions takes as an argument. See variantAxes.ts.
export {
  buildVariantCombos,
  comboKey,
  MAX_VARIANT_AXES,
  MAX_VARIANTS,
  orderedAxes,
  VARIANT_AXES,
  variantAxisDefs,
  axisDefsForKind,
  variantAxisValues,
  variantComboCount,
  type StoredVariantValues,
  type VariantAxisDef,
  type VariantAxisValue,
  type VariantAxisValues,
  type VariantCombo,
} from "./variantAxes";
export { useVariantAxisValues } from "./hooks/useVariantAxisValues";
// Pricing beyond the pet at booking, till and invoice (17 September 2026): the
// customer's zone for the branch, and the "Dipilih staf" selects.
export { useVariantQuote } from "./hooks/useVariantQuote";
export { VariantChoicePicker } from "./components/VariantChoicePicker";
// The one tahapan picker — the tenant's list plus a quick add — and the word a
// row carries when its name cannot be added again. The form and the grooming
// detail page's Tahapan card both draw it (14 September 2026).
export {
  SERVICE_STEP_NAME_MAX_LENGTH,
  ServiceStepFlagBadge,
  serviceStepFlag,
  ServiceStepPicker,
  sessionsRefusal,
  type ServiceStepFlag,
} from "./components/ServiceStepPicker";
// The tahapan weight rules, for the detail page that edits tahapan in place.
export {
  evenSessionWeights,
  sessionWeightsError,
  sessionWeightsPayload,
  WEIGHTS_MIN_SESSIONS,
} from "./components/ServiceFormFields";
