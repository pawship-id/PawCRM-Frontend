/**
 * How old the animal is TODAY, from its birth date.
 *
 * THE DATE IS WHAT IS STORED, and this is why: an age written into a record is
 * wrong the day after it is written. Every screen that shows one derives it at
 * read time.
 *
 * ITS OWN MODULE because the profile header and the Info tab both say it, and
 * they have to say it identically — a hero reading "3 tahun" above a row reading
 * "2 tahun" is a page nobody trusts twice. PetsTable keeps its own whole-years
 * version on purpose: a table column has no room for "belum 1 bulan".
 */
export function petAgeText(iso: string | null): string | null {
  if (!iso) return null;

  const born = new Date(iso);
  if (Number.isNaN(born.getTime())) return null;

  const months = Math.floor(
    (Date.now() - born.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
  );

  // A birth date in the future is a typo, not an age — say nothing rather than
  // "-4 bulan".
  if (months < 0) return null;
  if (months < 1) return "belum 1 bulan";
  if (months < 24) return `${months} bulan`;

  return `${Math.floor(months / 12)} tahun`;
}
