/**
 * The shape of the generated guide in `src/content/help/`.
 *
 * Nothing here is written by hand: `automation/build-guide-web.mjs` turns the
 * user manuals (`automation/manuals/*.md`, the same text the PDFs are printed
 * from) into these records, so the web guide and the PDF cannot drift apart.
 * `html` fields are that script's output from our own Markdown — trusted
 * content, not user input.
 */
export interface HelpArticle {
  slug: string;
  /** The section number in the PDF, kept so "bagian 25" still means something. */
  number: number;
  title: string;
  /** The manual's "Fungsi:" line, as plain text. Empty when it has none. */
  summary: string;
  html: string;
}

export interface HelpFaq {
  question: string;
  /** Inline HTML: bold UI labels and links, no block elements. */
  answer: string;
}

export interface HelpModule {
  /** The manual's file name — `kasir`, `pelanggan` — and its address segment. */
  slug: string;
  /** The book number from `automation/modules/*.json`; 0 is "Mulai Pakai Buloo". */
  order: number;
  title: string;
  subtitle: string;
  /** The manual's "Sebelum Mulai", shown on the module page. */
  introHtml: string;
  articles: HelpArticle[];
  faq: HelpFaq[];
  /** Inline HTML, one tip per entry. */
  tips: string[];
  /** `YYYY-MM-DD`: when this topic's guide was last revised (`--bump`). */
  updatedAt: string;
}

/**
 * The guide's version, `automation/guide-version.json`. It moves only when the
 * guide is revised on request, NOT when a feature ships — so a reader can tell
 * how old the text is against what they see on screen.
 */
export interface HelpRelease {
  version: string;
  /** `YYYY-MM-DD`. */
  updatedAt: string;
}

/** One screen → the article that explains it. */
export interface HelpRoute {
  /** An app route, `[param]` segments included: `/dashboard/customers/[id]`. */
  pattern: string;
  module: string;
  article: string;
}

/** One row of the search index — an article or a single FAQ answer. */
export interface HelpSearchEntry {
  kind: "article" | "faq";
  module: string;
  moduleTitle: string;
  title: string;
  href: string;
  summary: string;
  text: string;
}
