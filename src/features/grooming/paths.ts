/** The Grooming module's three tabs — each its own route (see `PageTabs`). */
export const GROOMING_PATH = "/dashboard/layanan/grooming";
export const GROOMING_CATALOG_PATH = `${GROOMING_PATH}/katalog`;
export const GROOMING_SETTINGS_PATH = `${GROOMING_PATH}/pengaturan`;

/**
 * One service's detail page — UNDER Layanan & Harga, so `PageTabs`' prefix
 * match keeps that tab lit while a service is open.
 */
export function groomingServicePath(serviceId: string): string {
  return `${GROOMING_CATALOG_PATH}/${serviceId}`;
}
