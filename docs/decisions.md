# Decisions

Settled questions, so they aren't re-litigated. Each says who decided and when.

## Scope
- **The tool is `pgen`** (Joey, 2026-10-27): `pgen build`, `pgen serve`, `PGEN_OUT`. The project folder is to be renamed `pgen` too (see `plan.md`).
- **A bespoke unitasker; code is copied from tsgen, not shared** (Joey, 2026-10-27). Drift is fine: each site gets what it needs. Simplicity first: fewer lines, more performant, purpose-built.
- **Obscure by design; not locked down** (Joey, 2026-10-27). No indexes, search, sitemap, categories, backlinks or random page. `noindex, nofollow` on every page and `Disallow: /` in robots.txt. Wikilinks between pages are fine, and the home page (which lists a few pages) stays. The content repo is private; this repo is public.
- **No namespaces, notes pages or book** (Joey, 2026-10-27). Pages sit at the root: `papers.jday.co/christian-baptism/`.
- **Old MediaWiki URLs are kept** (Joey, 2026-10-27, reversing the first answer). Every page's slug is its old wiki page name (`Christian_Baptism`, `cog11.5`), written as a `slug:` and used as written, and `/view/<name>/` redirects to it. Names that were redirects in the wiki are the page's `aliases:` and get `/view/` redirects too. GitHub Pages can't redirect, so these are small HTML pages (meta refresh, canonical). Revision history is still dropped.

## Content
- **A standalone vault** (Joey, 2026-10-27), not a folder of the personal "Papers" vault. Hosted on GitHub Pages from a separate private content repo that depends on this generator at a tag, like tsgen's.
- **Filenames are pretty; slugs come from them** (Joey, 2026-10-27), or from a `slug:` property. `title:` is for the occasional override (Obsidian forbids colons).
- **All Scripture is written with the standard abbreviations** (Joey, 2026-10-27), as in tsgen (`Jn 3:16`, `1Co 1:21`). This site has its own `abbreviations.json` and `alt-text.json`.
- **Partials are the only way to share text; there is no page transclusion** (Joey, 2026-10-27). Obsidian renders `![[Page]]` embeds in a style Joey dislikes, so the Westminster Confession's chapter text lives in partials (`wcf-i` …) that both the chapter page and the whole-Confession page include. One mental model: a partial is a snippet with positional arguments. EJS in pages and partials stays available (it sees the page being built) but the corpus doesn't use it.
- **A change to Scripture chains** (2026-10-27): an opted-out reference (`!Ps 9:1`) ends its chain, so the references after it aren't read as continuing an earlier one, and a closing `</em>` or `</cite>` ends a chain (`*Title*, 12:293` is a page).
- **The committee reports are rebuilt from their sources** (Joey, 2026-10-27): the OPC republication report from the OPC's HTML (real tables, italics, endnotes) and the PCA creation report from the PCA's PDF (fonts give bold, italics, notes and the outline), because the wiki copies were pasted from PDFs, partly cleaned (the creation one stopped at a `DRAFT BELOW` marker) and had lost most footnotes and formatting.
- **Everything is migrated for now, including scratch pages and personal letters** (Joey, 2026-10-27); a cleanup pass comes before go-live.

## Look
- **Fonts: Freight Text Pro from the old Adobe Fonts kit, then plain `serif`** (Joey, 2026-10-27). The layout links the kit's CSS (`use.typekit.net/qwp6cjh.css`, still served); no Baskerville, Georgia or bundled fallback face. Headings are League Gothic (shipped, from the wiki's skin), then `sans-serif`.
- **The old look is kept, the code is not** (Joey, 2026-10-27): the card on bark, League Gothic headings, orange accent, the "Who is Joey Day?" box. Semantic HTML, grid, CSS variables, OKLCH, `hyphens: auto` and `hanging-punctuation` in place of Hyphenator and the jQuery script. Dark mode follows the system; there is no settings page. Print gets its own care (the coleslaw recipe, essays and papers as PDFs).
