/**
 * Public surface of the settings feature (Pengaturan).
 *
 * Three screens, all from the mockup: the Umum hub of cards, the Data Awal
 * checklist of opening figures, and Layanan — one page with a rail whose
 * sections (Opsi Varian, Ras, Tahapan, Add-on, Zona) are opened by `?bagian=`.
 * Pages import from here, never from deep component paths.
 */
export { GeneralSettingsScreen } from "./components/GeneralSettingsScreen";
export { InitialDataScreen } from "./components/InitialDataScreen";
export { ServiceSettingsScreen } from "./components/ServiceSettingsScreen";
export {
  serviceSettingsPath,
  serviceSettingsSectionOf,
} from "./serviceSettingsSections";
