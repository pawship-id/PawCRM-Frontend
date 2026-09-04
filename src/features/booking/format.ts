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
