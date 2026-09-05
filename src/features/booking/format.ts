/**
 * When something happened, to the minute.
 *
 * THE TIME MATTERS IN THIS MODULE, unlike on a receipt's due date: a day sheet
 * is read as "who is at ten", and a status trail is read as "jam berapa
 * hewannya datang". A date with no clock on it cannot answer either.
 *
 * ONE FORMATTER, because two would drift: the schedule column and the trail are
 * read side by side, and a booking scheduled "26 Agu 10.00" next to a check-in
 * written "26/08/2026 10:32" reads as two different kinds of fact.
 *
 * Returns an em dash for anything unparseable — a broken date is worth showing
 * as a gap rather than as "Invalid Date".
 */
export function formatBookingMoment(value: string | null | undefined): string {
  if (!value) return "—";

  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "—";

  return at.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * WHO DID IT, with the hat they were wearing — "Fitria (ops)", "Sinta (groomer)".
 *
 * ─── WHY THE ROLE IS WORTH THE PARENTHESES ─────────────────────────────────
 *
 * A trail is read after the fact, by somebody who was not there. "Fitria" alone
 * assumes the reader knows who Fitria is; a shop with twelve staff and turnover
 * does not, and the question actually being asked is whether the person who moved
 * this was at the counter or at the table. The role answers it in three words.
 *
 * ─── THE ROLE MAY BE ABSENT WHEN THE NAME IS NOT ───────────────────────────
 *
 * A super-admin owner reaches every permission by BYPASS rather than through an
 * assigned role, so `byRoleName` is genuinely null for that account. The name
 * alone is honest; inventing "(admin)" would be a guess about how they got in.
 *
 * ─── AND NOBODY AT ALL IS A REAL ANSWER ────────────────────────────────────
 *
 * A booking settled by a paid sale moves without anybody choosing to move it.
 * "Sistem" says so; a blank reads as a field that failed to load.
 *
 * ONE FORMATTER, because the trail is drawn twice — the card on the animal's
 * work page and `BookingHistoryDialog` — and two would drift.
 */
export function bookingActorLabel(
  name: string | null | undefined,
  roleName?: string | null,
): string {
  if (!name) return "Sistem";

  return roleName ? `${name} (${roleName.toLowerCase()})` : name;
}

/**
 * The clock a visit is expected to END on — its start plus what it is estimated
 * to take. "22.31".
 *
 * THE ESTIMATE, NOT THE ACTUAL. The actual finish belongs to each session and
 * moves while somebody is reading; a header that mixed the two would promise a
 * time that changes under the reader.
 *
 * IN THE SHOP'S OWN CLOCK, like everything else in this module — never through
 * UTC, which is seven hours out and would print the wrong evening.
 *
 * Shared by the booking's own page and the animal's work page, which is why it
 * lives here: two copies of "what time will this be done" would eventually
 * disagree on the one screen a customer is told the answer from.
 */
export function finishClock(startIso: string, minutes: number): string {
  const at = new Date(startIso);
  if (Number.isNaN(at.getTime())) return "—";

  at.setMinutes(at.getMinutes() + minutes);

  return `${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`;
}
