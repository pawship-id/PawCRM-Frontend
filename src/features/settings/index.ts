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
export { CashBankOpeningScreen } from "./components/CashBankOpeningScreen";
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
/**
 * The tenant's Tipe pelanggan list, for the screens that CHOOSE one rather than
 * manage it — the Pelanggan form's Kategori field (27 September 2026).
 *
 * Exported here rather than copied: the settings screen and the customer form
 * must offer the same labels, and a second loader would be a second opinion
 * about what this tenant's categories are.
 */
export {
  useCustomerTypeList,
  type UseCustomerTypeListResult,
} from "./hooks/useCustomerTypeList";
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
