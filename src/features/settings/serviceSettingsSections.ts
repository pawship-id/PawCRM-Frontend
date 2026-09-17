import { SERVICE_SETTINGS_PATH } from "./petOptions";

/**
 * Pengaturan › Layanan — the rail's sections, and the URL that opens each one.
 *
 * NO "use client" HERE, on `cash-transactions/query.ts`'s rule: the server page
 * reads `?bagian=` with `serviceSettingsSectionOf`, and a function reached
 * through a client module cannot be called on the server.
 *
 * A QUERY PARAMETER, NOT A ROUTE PER SECTION. Data hewan and Tahapan were routes
 * of their own until 17 September 2026, when the hub became one page with a
 * rail (mockup `buloo-pengaturan-v3`). The old routes now redirect here.
 */

export type ServiceSettingsSection = "opsi" | "ras" | "tahapan" | "addon" | "zona";

export const SERVICE_SETTINGS_SECTIONS: readonly {
  id: ServiceSettingsSection;
  label: string;
}[] = [
  { id: "opsi", label: "Opsi Varian" },
  { id: "ras", label: "Ras" },
  { id: "tahapan", label: "Tahapan" },
  { id: "addon", label: "Add-on" },
  { id: "zona", label: "Zona" },
];

export const DEFAULT_SERVICE_SETTINGS_SECTION: ServiceSettingsSection = "opsi";

/** `?bagian=` as a section — anything unknown opens the first one. */
export function serviceSettingsSectionOf(
  raw: string | string[] | undefined,
): ServiceSettingsSection {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (
    SERVICE_SETTINGS_SECTIONS.find((section) => section.id === value)?.id ??
    DEFAULT_SERVICE_SETTINGS_SECTION
  );
}

/** The hub opened on one section. The default section keeps the bare path. */
export function serviceSettingsPath(section: ServiceSettingsSection): string {
  return section === DEFAULT_SERVICE_SETTINGS_SECTION
    ? SERVICE_SETTINGS_PATH
    : `${SERVICE_SETTINGS_PATH}?bagian=${section}`;
}
