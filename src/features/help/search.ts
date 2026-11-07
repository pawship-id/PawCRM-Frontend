import type { HelpSearchEntry } from "./types";

/**
 * Search over the guide, in the browser.
 *
 * NO SEARCH LIBRARY: ~430 entries of short Indonesian text is small enough that
 * a straight scan per keystroke is instant, and what a library would add —
 * stemming, typo tolerance — is tuned for English. What actually goes wrong
 * here is vocabulary: somebody types "invoice" and the guide says "faktur".
 * That is what SYNONYMS is for.
 */

/** Each row is one idea: a word in any row finds the others. */
const SYNONYMS: string[][] = [
  ["faktur", "invoice", "tagihan", "nota"],
  ["stok", "persediaan", "inventori", "barang"],
  ["kasir", "pos", "penjualan kasir"],
  ["grooming", "mandi", "groom"],
  ["hotel", "penitipan", "titip"],
  ["antar-jemput", "antar", "jemput", "pickup", "delivery"],
  ["pelanggan", "customer", "pembeli", "pemilik"],
  ["hewan", "anabul", "pet"],
  ["supplier", "pemasok", "vendor"],
  ["hapus", "delete", "nonaktifkan"],
  ["ubah", "edit", "ganti"],
  ["pengguna", "user", "akun", "staf"],
  ["password", "kata sandi", "sandi"],
  ["retur", "return", "pengembalian"],
  ["diskon", "potongan", "promo"],
  ["member", "membership", "paket"],
  ["laporan", "report", "rekap"],
  ["cabang", "outlet", "toko"],
  ["shift", "buka kasir", "tutup kasir"],
  ["pembayaran", "bayar", "pelunasan"],
  ["batch", "expired", "kedaluwarsa", "kadaluarsa"],
];

const SYNONYM_INDEX = new Map<string, string[]>();
for (const row of SYNONYMS) {
  for (const word of row) SYNONYM_INDEX.set(word, row);
}

export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Each query word with its synonyms — a word matches when any alternative does. */
export function queryTerms(query: string): string[][] {
  return normalize(query)
    .split(" ")
    .filter((word) => word.length > 1)
    .map((word) => [word, ...(SYNONYM_INDEX.get(word) ?? []).filter((s) => s !== word)]);
}

export interface PreparedEntry {
  entry: HelpSearchEntry;
  title: string;
  body: string;
  /** Every root of every word — see `rootsOf`. */
  titleRoots: Set<string>;
  bodyRoots: Set<string>;
}

/** Normalise and stem once, when the index loads — not on every keystroke. */
export function prepareIndex(entries: HelpSearchEntry[]): PreparedEntry[] {
  return entries.map((entry) => {
    const title = normalize(entry.title);
    const body = normalize(`${entry.moduleTitle} ${entry.summary} ${entry.text}`);
    return { entry, title, body, titleRoots: rootSet(title), bodyRoots: rootSet(body) };
  });
}

function rootSet(text: string): Set<string> {
  const set = new Set<string>();
  for (const word of text.split(" ")) for (const root of rootsOf(word)) set.add(root);
  return set;
}

/**
 * The possible roots of an Indonesian word — a light stemmer, not a full one.
 *
 * WHY IT EXISTS: "tutup kasir" has to find "Menutup Kasir", and "menutup" does
 * not even CONTAIN "tutup" — me(N)- swallows the root's first letter (t → n,
 * p → m, k → ng, s → ny). So a prefix or substring match can never get there;
 * the swallowed letter has to be put back. One suffix (-nya, -kan, -an, -i…)
 * and one prefix come off, and every reading is kept, since "menutup" could be
 * men+tutup or men+utup and only the vocabulary knows which: a wrong extra
 * root matches nothing, a missing right one loses the article.
 */
export function rootsOf(word: string): string[] {
  const roots = new Set<string>([word]);
  if (word.length < 5) return [...roots];

  const bases = [word];
  for (const suffix of ["nya", "lah", "kan", "an", "i"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) {
      bases.push(word.slice(0, -suffix.length));
      break;
    }
  }

  const vowel = /^[aiueo]/;
  for (const base of bases) {
    roots.add(base);
    for (const [prefix, restore] of PREFIXES) {
      if (!base.startsWith(prefix)) continue;
      const rest = base.slice(prefix.length);
      if (rest.length < 3) continue;
      roots.add(rest);
      if (restore && vowel.test(rest)) roots.add(restore + rest);
    }
  }
  return [...roots].filter((r) => r.length >= 3);
}

/** [prefix, the root letter it swallows before a vowel]. Longest first. */
const PREFIXES: [string, string][] = [
  ["meng", "k"],
  ["peng", "k"],
  ["meny", "s"],
  ["peny", "s"],
  ["mem", "p"],
  ["pem", "p"],
  ["men", "t"],
  ["pen", "t"],
  ["ber", ""],
  ["ter", ""],
  ["me", ""],
  ["pe", ""],
  ["di", ""],
  ["ke", ""],
  ["se", ""],
];

/**
 * Entries containing EVERY query word (or a synonym of it), best first.
 *
 * A word scores far more in the title than in the body, and a whole-word hit
 * more than a prefix — "stok" should rank "Stok Opname" above a page that
 * merely mentions "stoknya". An article outranks an FAQ answer on a tie, since
 * it is the fuller answer.
 */
export function searchHelp(
  index: PreparedEntry[],
  query: string,
  limit = 20,
): HelpSearchEntry[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const scored: { entry: HelpSearchEntry; score: number }[] = [];
  for (const item of index) {
    let score = 0;
    let matchedAll = true;
    for (const alternatives of terms) {
      let best = 0;
      for (const word of alternatives) {
        best = Math.max(best, termScore(item, word));
      }
      if (best === 0) {
        matchedAll = false;
        break;
      }
      score += best;
    }
    if (!matchedAll) continue;
    if (item.entry.kind === "article") score += 1;
    scored.push({ entry: item.entry, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}

/**
 * Whole word, then the start of a word, then the same ROOT ("tutup" finding
 * "Menutup Kasir", "bayar" finding "pembayaran") — title before body at every
 * tier. A shared root is a looser match than the word itself, so it ranks
 * below a prefix in the same place.
 */
function termScore(item: PreparedEntry, word: string): number {
  const escaped = escapeRegex(word);
  const whole = new RegExp(`(^| )${escaped}( |$)`);
  const prefix = new RegExp(`(^| )${escaped}`);
  const roots = rootsOf(word);
  if (whole.test(item.title)) return 20;
  if (prefix.test(item.title)) return 12;
  if (roots.some((r) => item.titleRoots.has(r))) return 10;
  if (whole.test(item.body)) return 4;
  if (prefix.test(item.body)) return 2;
  if (roots.some((r) => item.bodyRoots.has(r))) return 1;
  return 0;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
