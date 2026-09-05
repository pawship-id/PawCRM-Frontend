import type {
  Booking,
  BookingBelongingInput,
  BookingItemInput,
  Service,
} from "@/types/api";

/**
 * The shape the booking form holds while somebody fills it in — and the two
 * conversions between it and the API's.
 *
 * ─── WHY THE FORM'S SHAPE IS NOT THE API'S ─────────────────────────────────
 *
 * The API stores a FLAT list of rows: one per animal per service, add-ons
 * included, each with a `parentItemId`. That is right for it — the calendar, the
 * clash check, the pet timeline and the commission run all want to find rows
 * without knowing which booking they sit in.
 *
 * The SCREEN asks a different question, in the order a receptionist asks it:
 * which animal, then what is being done to it, then what is added to that. So
 * the draft is a tree — a card per animal, services under it, add-ons under
 * each — and this file is the one place the two shapes meet. Everything else on
 * both sides gets to keep the shape that suits it.
 *
 * ─── PURE, SO IT CAN BE TESTED WITHOUT A SCREEN ────────────────────────────
 *
 * No React, no fetching. The round trip that matters — load a booking, edit
 * nothing, save it back unchanged — is a property this file can be held to
 * directly, and it is exactly the kind of thing a rendering test would miss.
 */

/** The sentinel for "Belum ditentukan" — a real state, not a gap (FR-3). */
export const UNASSIGNED = "belum-ditentukan";

export interface ServiceDraft {
  /** Local identity. Never sent — see `blankGroup`. */
  key: string;
  /**
   * WHICH LINE OF BUSINESS this line's service picker is narrowed to.
   *
   * A FILTER, NOT A FIELD: never sent, because the service already names its
   * own. It sits on the LINE rather than on the animal because one animal may
   * take a Grooming service and a Hotel one on the same visit — a single filter
   * per card could not express that, and asking it once per card made it read as
   * a property of the animal rather than of the list it narrows.
   */
  businessLineId: string;
  serviceId: string;
  /** The add-ons ticked under this service, by service id. */
  addonServiceIds: string[];
  /** As typed; "" means "use the catalogue's". */
  durationMin: string;
  /**
   * Already billed, so it may not be changed or removed (PRD 2.12). Held on the
   * draft rather than in a side set: a locked service is a property of that
   * line, and a parallel `Set` keyed by string is how the two drift.
   */
  locked: boolean;
}

export interface PetGroupDraft {
  key: string;
  petId: string;
  /**
   * THE GROOMER THIS ANIMAL'S WHOLE VISIT STARTS WITH — a DEFAULT, not the last
   * word.
   *
   * It is asked once per animal rather than once per service, because at booking
   * time it is one answer: "Sinta is doing Bruno today". Who actually stands at
   * each session — and whether a second pair of hands joins one of them — is
   * settled on the booking's own page once the day is running, which is where
   * the person who knows is standing.
   */
  groomerUserId: string;
  services: ServiceDraft[];
  /**
   * ─── TWO NOTES, TWO AUDIENCES ─────────────────────────────────────────────
   *
   * There was one, and it held operational instructions. A shop wanting to tell
   * the OWNER something had nowhere to put it but the same box — and whichever
   * way that box is then treated it is wrong: shown to the customer it leaks,
   * hidden from them the advice never arrives.
   *
   * BOTH ARE PER ANIMAL, asked once on the card and written onto each of that
   * animal's rows on the way out; see `groupsToItems`.
   */
  internalNotes: string;
  /** For the owner to read. Staff still write it — see `BookingItem`. */
  customerNotes: string;
  /** What the owner is handing over with this animal, by name. */
  belongings: string[];
}

let seq = 0;

/** A fresh service line. The key is local — two empty lines look identical. */
export function blankService(): ServiceDraft {
  seq += 1;
  return {
    key: `svc-${seq}`,
    businessLineId: "",
    serviceId: "",
    addonServiceIds: [],
    durationMin: "",
    locked: false,
  };
}

/** A fresh animal card, with one empty service line ready to fill in. */
export function blankGroup(petId = ""): PetGroupDraft {
  seq += 1;
  return {
    key: `pet-${seq}`,
    petId,
    groomerUserId: UNASSIGNED,
    services: [blankService()],
    internalNotes: "",
    customerNotes: "",
    belongings: [],
  };
}

/**
 * A booking as the API returns it → the cards the form edits.
 *
 * ADD-ONS ARE FOLDED BACK UNDER THEIR PARENT, which is the whole reason
 * `parentItemId` is on the read model: the API hands back a flat list, and a
 * form that showed it flat would present "Parfum" as a service somebody chose
 * on its own — which is not what it is, and not something they could then
 * untick.
 *
 * AN ORPHANED ADD-ON IS KEPT, NOT DROPPED. If a parent row is missing — deleted
 * directly through the API, say — its add-on is shown as a line of its own
 * rather than silently vanishing from a booking somebody is about to save. A row
 * that disappears from an edit form is a row that disappears from the booking.
 */
export function groupsFromBooking(booking: Booking): PetGroupDraft[] {
  const groups = new Map<string, PetGroupDraft>();
  const linesById = new Map<string, ServiceDraft>();

  const groupFor = (petId: string): PetGroupDraft => {
    const existing = groups.get(petId);
    if (existing) return existing;

    const created = { ...blankGroup(petId), services: [] as ServiceDraft[] };
    groups.set(petId, created);
    return created;
  };

  /* Parents first, so an add-on always finds the line it hangs off. */
  const parents = booking.items.filter((item) => !item.parentItemId);
  const addons = booking.items.filter((item) => item.parentItemId);

  for (const item of parents) {
    const line: ServiceDraft = {
      ...blankService(),
      serviceId: item.serviceId,
      // Shown as typed, so saving without touching it keeps the number.
      durationMin: item.durationMin === null ? "" : String(item.durationMin),
      locked: Boolean(item.pulledToCartAt || item.pulledToInvoiceAt),
    };

    linesById.set(item._id, line);

    const group = groupFor(item.petId);
    group.services.push(line);
    /*
      ONE PAIR PER ANIMAL: the rows of one animal carry the same words, so the
      first non-empty one of each is what the card shows. The two are collapsed
      INDEPENDENTLY — a booking whose first row has an internal note and whose
      second has the customer's must show both, and testing them together would
      drop whichever the first row happened to lack.
    */
    if (!group.internalNotes && item.internalNotes) {
      group.internalNotes = item.internalNotes;
    }
    if (!group.customerNotes && item.customerNotes) {
      group.customerNotes = item.customerNotes;
    }
    /*
      THE ANIMAL'S DEFAULT GROOMER, from the first of its rows that names one.

      The form asks this once per animal; the API stores it per row, and by the
      time a booking is being edited those rows may genuinely differ — the day
      ran, and one session was handed to somebody else. The card shows the first
      answer rather than inventing a blank, and re-saving applies it to every row
      of that animal, which is what "default" means on this screen. Per-session
      crews are changed on the booking's own page, not here.
    */
    if (group.groomerUserId === UNASSIGNED && item.groomerUserId) {
      group.groomerUserId = item.groomerUserId;
    }
  }

  for (const item of addons) {
    const parent = linesById.get(item.parentItemId as string);

    if (parent) {
      parent.addonServiceIds.push(item.serviceId);
      continue;
    }

    const group = groupFor(item.petId);
    group.services.push({
      ...blankService(),
      serviceId: item.serviceId,
      durationMin: item.durationMin === null ? "" : String(item.durationMin),
      locked: Boolean(item.pulledToCartAt || item.pulledToInvoiceAt),
    });
  }

  for (const belonging of booking.belongings ?? []) {
    groupFor(belonging.petId).belongings.push(belonging.name);
  }

  const result = [...groups.values()];
  return result.length > 0 ? result : [blankGroup()];
}

/**
 * The cards → the flat `items[]` the API takes.
 *
 * BOTH OF THE ANIMAL'S NOTES GO ON EVERY ROW OF THAT ANIMAL, and that is a real
 * decision rather than a shrug. They are documented as facts about THIS animal
 * on THIS visit — per-animal facts that happen to be stored per row, because the
 * row is the only thing a visit has one of per animal per service. Asking for
 * each once and writing it to every row is what makes the screen match the
 * fields' own meaning; asking once per service would put the same sentence in
 * front of somebody three times.
 *
 * Lines with no service chosen are DROPPED rather than sent empty — a card
 * somebody added and did not fill in is not a row, and the server would refuse
 * it by field name.
 */
export function groupsToItems(groups: PetGroupDraft[]): BookingItemInput[] {
  return groups.flatMap((group) =>
    group.services
      .filter((line) => group.petId !== "" && line.serviceId !== "")
      .map((line) => ({
        petId: group.petId,
        serviceId: line.serviceId,
        addonServiceIds: line.addonServiceIds,
        /*
          THE ANIMAL'S DEFAULT, ONTO EVERY ONE OF ITS ROWS. Asked once, applied
          to each — the same fan-out the note gets, and for the same reason: at
          booking time it is one answer about one animal. FR-3's "Belum
          ditentukan" is a real state, not a gap.
        */
        groomerUserId:
          group.groomerUserId === UNASSIGNED ? null : group.groomerUserId,
        /*
          OMITTED WHEN NOBODY TYPED ONE, rather than sent as the catalogue's
          number: the server snapshots from the catalogue itself, so sending
          nothing keeps the appointment following a duration the shop may still
          correct before Thursday.
        */
        durationMin:
          line.durationMin.trim() === "" ? undefined : Number(line.durationMin),
        internalNotes:
          group.internalNotes.trim() === "" ? null : group.internalNotes.trim(),
        customerNotes:
          group.customerNotes.trim() === "" ? null : group.customerNotes.trim(),
      })),
  );
}

/** The cards → the flat `belongings[]`, each naming the animal it belongs to. */
export function groupsToBelongings(
  groups: PetGroupDraft[],
): BookingBelongingInput[] {
  return groups.flatMap((group) =>
    group.petId === ""
      ? []
      : group.belongings
          .map((name) => name.trim())
          .filter((name) => name !== "")
          .map((name) => ({ petId: group.petId, name })),
  );
}

/**
 * WHICH LINES REPEAT AN ANIMAL AND A SERVICE ALREADY ON THE BOOKING — by line
 * key, so the message lands on the card somebody just added rather than the one
 * they filled in five minutes ago (PRD 2.7).
 *
 * ADD-ONS COUNT. The same perfume ticked under two of one animal's services is
 * one perfume charged twice, and the server refuses it — so the form has to see
 * it as a duplicate too, or the refusal arrives with nothing highlighted.
 */
export function duplicateServiceKeys(groups: PetGroupDraft[]): Set<string> {
  const duplicates = new Set<string>();
  const seen = new Set<string>();

  for (const group of groups) {
    if (group.petId === "") continue;

    for (const line of group.services) {
      for (const serviceId of [line.serviceId, ...line.addonServiceIds]) {
        if (serviceId === "") continue;

        const pair = `${group.petId}|${serviceId}`;
        if (seen.has(pair)) duplicates.add(line.key);
        else seen.add(pair);
      }
    }
  }

  return duplicates;
}

/**
 * WHEN THE CUSTOMER GETS THEIR ANIMALS BACK — the longest groomer's workload,
 * never the sum (PRD 2.9).
 *
 * Two groomers work at the same time: Mochi with Sinta for 90 minutes and Coco
 * with Rio for 60 means the visit takes 90, not 150. Lines sharing a groomer ARE
 * summed, because one person cannot do two animals at once, and lines with
 * nobody assigned are grouped together — which over-estimates rather than
 * under-, and promising an earlier finish than the shop can manage is the
 * mistake that sends somebody home late.
 *
 * AN ADD-ON'S MINUTES COUNT TOWARDS ITS PARENT'S GROOMER, because that is who
 * does it. This mirrors `BookingItemRepository#summarise`; the stored answer is
 * the server's.
 */
export function longestGroomerMinutes(
  groups: PetGroupDraft[],
  serviceOf: (id: string) => Service | null,
): number {
  const perGroomer = new Map<string, number>();

  for (const group of groups) {
    for (const line of group.services) {
      const typed = Number(line.durationMin);
      const own =
        line.durationMin.trim() !== "" && Number.isFinite(typed) && typed > 0
          ? typed
          : (serviceOf(line.serviceId)?.durationMin ?? 0);

      const addons = line.addonServiceIds.reduce(
        (total, id) => total + (serviceOf(id)?.durationMin ?? 0),
        0,
      );

      const minutes = own + addons;
      if (minutes <= 0) continue;

      perGroomer.set(
        group.groomerUserId,
        (perGroomer.get(group.groomerUserId) ?? 0) + minutes,
      );
    }
  }

  return Math.max(0, ...perGroomer.values());
}
