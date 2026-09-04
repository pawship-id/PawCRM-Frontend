# Buloo brand source

Original handoff, copied here byte-for-byte. **Nothing in this folder is imported by the build.**

| File | What it is |
| --- | --- |
| `buloo-brand-guidelines.html` | The brand book — logo construction, colour, type, voice, applied surfaces. Open it in a browser. |
| `buloo-filter-section-v2.html` | The filter system spec, with working demos of the quick bar and the filter panel. |
| `buloo-form-section-v1.html` | The form system spec — field anatomy, Entitas vs Transaksi, field order, the action bar. Rules drawn from it are `docs/ui-rules.md` §16. |
| `buloo-tokens.css` | The design tokens as the brand team shipped them. |

Logo artwork lives in [`public/brand/`](../../public/brand/): wordmark (`buloo-logo.svg`, `-plain`, `-reversed`, `-mono`) and icon (`buloo-icon-navy.svg`, `-orange`, `-mono`).

## What is authoritative

`buloo-tokens.css` here is **the handoff**, not the running config. The running config is [`src/styles/globals.css`](../../src/styles/globals.css), and the enforceable rules are [`docs/ui-rules.md`](../ui-rules.md). Where they differ, the repo wins — the differences are deliberate and listed below.

## Deliberate deviations from the handoff

Both are contrast failures in the brand book's own swatches, measured against the ≥4.5:1 floor the same book sets.

| Token | Handoff | Repo | Why |
| --- | --- | --- | --- |
| `--muted` (secondary text) | `#667691` | `#5B6B87` | Brand slate is 4.60:1 on white but **4.33:1 on `--background` `#F6F8FC`**, and `text-muted` has ~579 uses, many sitting on that background. The repo value is the same hue two steps darker: 5.39:1 on white, 5.06:1 on the app background. The original is kept as `--slate-500` for icons, dividers and placeholders, where the text floor does not apply. |
| `--success` | `#178A5F` | `#0F6B49` | Brand green is 4.34:1 on white, and lower as `text-success` on a `success` tint. The repo value is 6.52:1. The original is kept as `--success-fill` for solid fills, dots and icons. |

`--danger` is **not** deviated. `#D64545` is 4.38:1 as text — also marginal — but it is the pre-existing value on ~126 sites, so changing it would be churn unrelated to the rebrand. `--danger-ink` `#B3312F` (6.37:1) exists for when that debt is paid. See `docs/ui-rules.md` §13.
