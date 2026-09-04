/**
 * The form layer. Import these instead of hand-rolling a field — the whole point
 * is that a design change lands in one file rather than twenty.
 *
 * The rules in docs/ui-rules.md decide WHICH control a screen gets; this folder
 * decides how it looks and behaves. Anatomy is in docs/ui-component-specs.md.
 *
 * `FormSection` is not here on purpose: a form's section is a `<Card title
 * description>` from `@/components`, unchanged. There was nothing to build.
 *
 * THERE IS NO `SearchSelect` HERE, and that is the correction this folder most
 * needed: `FilterSelect layout="form"` is the searchable full-width picker, and
 * seven forms were already opening their Gudang, Pemasok and Akun lists from it
 * before this folder existed. One trigger shell, three arrangements — a bar, a
 * panel, a form. A second implementation would have been the fifteen-toolbars
 * mistake with a different noun.
 *
 * `TagField` is not here either, and that is a decision, not an omission — the
 * guideline gives Tag a slot in every transaction header, but no `tags` field
 * exists on the stock or purchasing API, and a control with nowhere to save to is
 * worse than no control. It goes in when the backend does.
 */
export {
  FIELD_HEIGHT,
  FormField,
  type FormFieldProps,
  type FormFieldRenderProps,
} from "./FormField";
export { FormActionBar, type FormActionBarProps } from "./FormActionBar";
export { CheckRow, CheckRowGroup, type CheckRowProps } from "./CheckRow";
export {
  SelectField,
  type SelectFieldOption,
  type SelectFieldProps,
} from "./SelectField";
export { TextareaField, type TextareaFieldProps } from "./TextareaField";
