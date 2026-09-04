/**
 * The filter layer. Import these instead of hand-rolling a toolbar — the whole
 * point is that a design change lands in one file rather than fifteen.
 *
 * Rules in docs/ui-rules.md §8 decide WHICH control a screen gets; this folder
 * decides how it looks and behaves. Anatomy is in docs/ui-component-specs.md.
 */
export { FilterBar, type FilterBarProps } from "./FilterBar";
export { FilterChips, type AppliedFilter, type FilterChipsProps } from "./FilterChips";
export {
  FilterDateRange,
  type DatePreset,
  type FilterDateRangeProps,
} from "./FilterDateRange";
export { FilterField, type FilterFieldProps } from "./FilterField";
export {
  FilterMultiSelect,
  type FilterMultiSelectProps,
} from "./FilterMultiSelect";
export { FilterOptionList } from "./FilterOptionList";
export { FilterPanel, type FilterPanelProps } from "./FilterPanel";
export { FilterPills, type FilterPillsProps, type PillOption } from "./FilterPills";
export { FilterSearch, type FilterSearchProps } from "./FilterSearch";
export { FilterSelect, type FilterSelectProps } from "./FilterSelect";
export { FilterToggle, type FilterToggleProps } from "./FilterToggle";
/** Exported so the one non-declarative control can still wear the same shell. */
export { FilterTrigger, type FilterTriggerProps } from "./FilterTrigger";
export {
  formatDateShort,
  formatRangeShort,
  namedOptions,
  triState,
  withAll,
  type FilterOption,
} from "./codecs";
