import { ApiError } from "@/services/api-error";
import type { Service, VariantChoice } from "@/types/api";
import { staffAxesOf } from "@/utils/serviceVariant";

/**
 * A booking line priced beyond the pet (17 September 2026) — the "Dipilih staf"
 * choices it sends, and the refusal the server answers with when one is missing
 * or the customer's zone cannot be said. Shared by `/dashboard/booking/new` and
 * Grooming › Booking baru.
 *
 * PURE: no React.
 */

type Declares = Partial<Pick<Service, "hasVariants" | "variantAxes">> | null | undefined;

/** Only the choices for the cards `service` declares. */
export function choicesFor(service: Declares, choices: readonly VariantChoice[]): VariantChoice[] {
  const wanted = new Set(staffAxesOf(service));
  return choices.filter((choice) => wanted.has(choice.optionId) && choice.code !== "");
}

/**
 * What one line sends: the MAIN service's choices, and — for an add-on that
 * declares a card the main service does not — that add-on's own. An add-on
 * sharing the main service's card inherits it on the server, so nothing is sent
 * for it.
 */
export function splitChoices(
  main: Declares,
  addons: ReadonlyArray<{ serviceId: string; service: Declares }>,
  choices: readonly VariantChoice[],
): {
  main: VariantChoice[];
  addons: { serviceId: string; variantChoices: VariantChoice[] }[];
} {
  const mainAxes = new Set(staffAxesOf(main));

  return {
    main: choicesFor(main, choices),
    addons: addons
      .filter(({ service }) => staffAxesOf(service).some((axis) => !mainAxes.has(axis)))
      .map(({ serviceId, service }) => ({
        serviceId,
        variantChoices: choicesFor(service, choices),
      }))
      .filter((row) => row.variantChoices.length > 0),
  };
}

/** The server's refusal of a line over its choices or its zone. */
export interface VariantRefusal {
  /** `bookings[i]` on a create; null when the path names no entry. */
  index: number | null;
  message: string;
  /** The card nobody chose a value on — the select to mark. */
  optionId: string | null;
  zoneReason: string | null;
}

/**
 * `400` with `details[0]` `{field: "variantChoices", optionId}` or
 * `{field: "serviceId", zoneReason}` → where on the form it belongs; null for
 * any other refusal.
 *
 * `optionId` and `zoneReason` are read off the detail defensively: they are not
 * on `ValidationDetail`'s declared shape.
 */
export function variantRefusalOf(error: unknown): VariantRefusal | null {
  if (!(error instanceof ApiError) || error.status !== 400 || !Array.isArray(error.details)) {
    return null;
  }

  for (const raw of error.details) {
    const detail = raw as { field?: unknown; message?: unknown; optionId?: unknown; zoneReason?: unknown };
    if (!detail || typeof detail.field !== "string") continue;

    const optionId = typeof detail.optionId === "string" ? detail.optionId : null;
    const zoneReason = typeof detail.zoneReason === "string" ? detail.zoneReason : null;
    const aboutChoices = /variantChoices/.test(detail.field);

    if (!aboutChoices && !zoneReason) continue;

    const at = /bookings\[(\d+)\]/.exec(detail.field) ?? /bookings\.(\d+)/.exec(detail.field);

    return {
      index: at ? Number(at[1]) : null,
      message: typeof detail.message === "string" ? detail.message : error.message,
      optionId,
      zoneReason,
    };
  }

  return null;
}
