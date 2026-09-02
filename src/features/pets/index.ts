/**
 * Public surface of the pets feature (Master Data → Hewan).
 *
 * Pages import from here, never from deep component paths. The screen entry
 * points map onto the three routes: list, create, edit.
 *
 * `PetQuickAddDialog` is exported for OTHER features rather than for a route of
 * its own: the POS Booking Bridge (Fase 4) registers an animal mid-sale without
 * leaving the till. It is here so that consumer imports from the feature's
 * public surface instead of reaching into `components/`.
 */
export { PetsScreen } from "./components/PetsScreen";
export { PetForm } from "./components/PetForm";
export { PetQuickAddDialog } from "./components/PetQuickAddDialog";
/** One customer's animals — rendered by the customers feature's edit screen. */
export { CustomerPetsSection } from "./components/CustomerPetsSection";
export { PetSpeciesBadge, PetStatusBadge, speciesLabel } from "./components/PetBadges";
export { usePets, type PetsQuery } from "./hooks/usePets";
export { PetSummaryCard } from "./components/PetSummaryCard";
export { PetProfileScreen } from "./components/PetProfileScreen";
export { PetTimelineTab } from "./components/PetTimelineTab";
export { PetPreferencesTab } from "./components/PetPreferencesTab";
export { PetMedicalTab } from "./components/PetMedicalTab";
