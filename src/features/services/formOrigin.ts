import { SERVICE_KINDS, type ServiceKind } from "@/types/api";

/**
 * WHERE THE SERVICE FORM WAS OPENED FROM — kept in the tab, not in the URL
 * (22 September 2026, on request: `/dashboard/master/layanan/new` reads the
 * same from every module).
 *
 * A module's "Layanan baru" and "Ubah" leave this behind as they are clicked
 * (`ServiceFormLink`); the form reads it when it opens and CLEARS IT WHEN IT IS
 * LEFT — saved or cancelled — not on the read, because a form can mount twice
 * (a permission check settling, dev mode) and the second mount must still find
 * it. It
 * gives exactly two things: the Kelompok layanan a new service STARTS on, and
 * the list a save goes back to. The line of business has no default — it is
 * the owner's choice every time.
 *
 * KEPT FOR THE TAB until then, so a refresh of the form keeps its module; a new
 * click from another module replaces it.
 *
 * OR "TAMBAH ADD-ON" (22 September 2026, on request — the address was
 * `/new?jenis=addon`): the new service is an add-on, and Jenis layanan is not
 * asked. Where an add-on's form goes back to is not stored: always
 * Master › Layanan › Add-on.
 */
export type ServiceFormOrigin =
  | {
      serviceKind: ServiceKind;
      /** The Layanan & Harga list the form was opened from. */
      listPath: string;
    }
  | { addon: true };

/** "Tambah add-on" on Master › Layanan › Add-on. */
export const ADDON_FORM_ORIGIN: ServiceFormOrigin = { addon: true };

const KEY = "buloo.serviceFormOrigin";

/** Only a module's own catalogue — a stored value must not send anybody elsewhere. */
const LIST_PATH = /^\/dashboard\/layanan\/[a-z-]+\/katalog$/;

export function rememberServiceFormOrigin(origin: ServiceFormOrigin): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(origin));
  } catch {
    /* Private mode or blocked storage — the form just opens without a default. */
  }
}

/** The form is being left — its origin has been used. */
export function clearServiceFormOrigin(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* Nothing to clear. */
  }
}

/** Reads it. Null when nothing was left, or it is not ours. */
export function readServiceFormOrigin(): ServiceFormOrigin | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      addon?: unknown;
      serviceKind?: ServiceKind;
      listPath?: unknown;
    };
    if (parsed.addon === true) return ADDON_FORM_ORIGIN;
    if (
      !parsed.serviceKind ||
      !(SERVICE_KINDS as readonly string[]).includes(parsed.serviceKind) ||
      typeof parsed.listPath !== "string" ||
      !LIST_PATH.test(parsed.listPath)
    ) {
      return null;
    }

    return { serviceKind: parsed.serviceKind, listPath: parsed.listPath };
  } catch {
    return null;
  }
}
