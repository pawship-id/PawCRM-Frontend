/**
 * Public surface of the settings feature (Pengaturan).
 *
 * Four tabs (mockup `buloo-navigation-v3`, 22 September 2026): Umum — the
 * tenant's profile — Layanan, the shared-vocabulary hub whose sections (Opsi
 * Varian, Ras, Tahapan, Add-on, Zona) are opened by `?bagian=`, and Keuangan and
 * Pengguna & Sistem, which are cards. Plus the pages those tabs open that belong
 * to no other feature. Pages import from here, never from deep component paths.
 */
export { GeneralSettingsScreen } from "./components/GeneralSettingsScreen";
export { InitialDataScreen } from "./components/InitialDataScreen";
export { ServiceSettingsScreen } from "./components/ServiceSettingsScreen";
export {
  FinanceSettingsScreen,
  SystemSettingsScreen,
} from "./components/SettingsCardTabs";
export {
  SettingsPageHeader,
  SettingsTabsHeader,
} from "./components/SettingsHeader";
export { CustomerTypesScreen } from "./components/CustomerTypesScreen";
export { NotificationSettingsScreen } from "./components/NotificationSettingsScreen";
export { NumberingSettingsScreen } from "./components/NumberingSettingsScreen";
export { SupplierTypesScreen } from "./components/SupplierTypesScreen";
export {
  DocumentSettingsScreen,
  IdentitySettingsScreen,
  StockCashierSettingsScreen,
  TaxSettingsScreen,
} from "./components/TenantSettingsScreens";
export {
  serviceSettingsPath,
  serviceSettingsSectionOf,
} from "./serviceSettingsSections";
export {
  SETTINGS_PATHS,
  SETTINGS_ROOT,
  SETTINGS_TABS,
  serviceFormPath,
  type SettingsTab,
} from "./paths";
