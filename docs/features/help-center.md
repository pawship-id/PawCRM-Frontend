# Pusat Panduan (Dashboard → Panduan)

The in-app guide: tutorials and FAQ for every part of Buloo, at
`/dashboard/help`. Built 3 November 2026 at BO's request, after Jubelio
Education. Plan and research: `PLAN-Pusat-Panduan-V1.md` in the project root.

## One source, two outputs

The text is **not written here**. The user manuals in
`automation/manuals/*.md`, the same files the PDFs are printed from, are
turned into the web guide by `automation/build-guide-web.mjs`:

```
cd automation
npm run guide-web        # after editing a manual or taking new screenshots
```

It writes, and fully replaces:

| Output | What it is |
| --- | --- |
| `src/content/help/<modul>.json` | one topic: "Sebelum Mulai", the articles, the FAQ and tips |
| `src/content/help/index.ts` | imports every topic as `HELP_MODULES` |
| `src/content/help/route-map.json` | app route → article, for the top bar's ? |
| `src/content/help/search.json` | plain text for search |
| `src/content/help/version.json` | the guide's version and last-revised date |
| `public/help/<modul>/*.webp` | the screenshots, ~27 MB in all |

**Never edit those files by hand**: the next run overwrites them. A run fails if
a "bagian N" / "buku NN" reference points nowhere, or if a screenshot is missing.
It also prints the app screens that have no article yet.

How a manual is split: `## Sebelum Mulai` becomes the topic page, each
`## N. Judul` becomes an article, and `## N. Pertanyaan Umum dan Tips` becomes
the FAQ: `- **Question?** answer` is a question, and `- **Tips:** …` is a tip.
The article slug comes from its title, so **renaming a section changes its
address**. The route map regenerates itself, but a link somebody saved goes
dead.

## Version and "diperbarui"

Every guide page shows "Panduan versi 1.0 · diperbarui 4 November 2026": the
home and FAQ pages show the guide's date, and a topic and its articles show
that topic's own date. They come from `automation/guide-version.json`, and
**only `--bump` moves them**:

```
npm run guide-web -- --bump kasir pelanggan   # version 1.0 -> 1.1, these two topics dated today
npm run guide-web -- --bump                   # every topic dated today
```

This is deliberate. A feature can ship without the guide being touched, and
the guide is revised only when somebody asks for it, so the date tells a reader
how old the text is next to the screen they see. A plain run never changes the
version, a failed run does not either, and a major version (2.0) is a hand edit
in that file. A new manual with no date makes the run fail until it is bumped.

## Pages

| Route | Screen |
| --- | --- |
| `/dashboard/help` | search, then topic cards grouped Mulai / Pengaturan awal / Pekerjaan sehari-hari |
| `/dashboard/help/[module]` | Sebelum mulai, the article list, Tanya jawab (`#tanya-N`) |
| `/dashboard/help/[module]/[article]` | the article, the topic's list beside it, previous / next |
| `/dashboard/help/faq` | every question from every topic |

All four are static (`generateStaticParams`, `dynamicParams = false`) and
ungated. The guide reads no tenant data, and a cashier is exactly who needs it.
The nav row **Panduan** sits under Sistem with no permission. The proxy still
requires a sign-in, as for any `/dashboard` route. Note that `public/help/` and
the search chunk are public files like every static asset, so **no screenshot
may show real customer data**.

## Ways in

- **? in the top bar** (`HelpButton`, in `DashboardShell`): opens the article
  for the screen in view, matched through `route-map.json`, **in a new tab**
  so a half-filled form or a till is not lost. With no exact match it opens the
  nearest ancestor's topic page, and failing that the guide's home. When
  the automatic pick is wrong for a screen, add it to `ROUTE_OVERRIDES` in the
  generator (Kasir is the first).
- **Panduan** in the rail.
- **? in the groomer app** (`GroomerShell`): opens `/dashboard/help/groomer` in
  the same tab.

## Search

`features/help/search.ts`, in the browser, with no library. The index loads
on the box's first focus (a dynamic import of `search.json`), not with the
page. Every query word, or one of its synonyms (`SYNONYMS`: faktur/invoice,
stok/persediaan…), must match. Title beats body, and whole word beats prefix
beats shared root. `rootsOf` is a light Indonesian stemmer. It exists because
"menutup" does not contain "tutup" (me(N)- swallows the t), so no substring
match could connect them.

## Article HTML

`HelpProse` renders the generated HTML and adds two things by delegation:
internal links navigate client-side, and a screenshot click opens it full size.
Styles are `.help-prose` in `globals.css` (tokens only, so the type scale and
the "Penting" callout follow the UI rules). Under each screenshot sits
**Buka halaman ini**, a link to that screen, but only for routes without an
id. An id in a screenshot is staging data and does not exist in the reader's
business.

## Not built (V2/V3 in the plan)

Reading lists per role, PDF download, a side panel instead of a new tab,
"was this helpful?", video, and "what's new". Guides for the Shopee screens,
upload massal, and impor transaksi kas & bank wait on their manuals.
