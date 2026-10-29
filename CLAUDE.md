# Joey's Papers Static Site Generator

A bespoke static site generator for Joey's Papers (https://papers.jday.co), which used to be a locked-down MediaWiki. It turns a vault of Markdown files (Obsidian-style) into a GitHub Pages site. The site is **obscure on purpose**: no index, no search, no sitemap, `noindex` on every page, a `robots.txt` that disallows everything. Anyone with a URL can read a page; nothing links them together except the wikilinks Joey writes.

It is a sibling of `../tsgen` (the Tota Scriptura generator), from which the Markdown pipeline was lifted: markdown-it and its plugins, partials, the Bible-reference linker, and the HTML post-passes (abbreviations, initials, Roman numerals, divine names, ellipses, alt text). Code was *copied*, not shared, and may drift on purpose.

## Working rules

- **A unitasker.** One site, one namespace, no notes pages, no categories, no indexes, no book. Hardcode folder roles, file names and frontmatter keys; no options or plugin hooks. Fewer lines, not more generality. Remove abstractions rather than adding them.
- **Failures are loud.** A broken wikilink, a missing partial or embed, an unexplained all-caps word, initials or image, or a Scripture reference that can't exist fails the build.
- Style is **JavaScript Standard Style**: `npm run fix` then `npm run lint`; `npm test` before committing. CSS is hand-written, with OKLCH colors as variables on `:root` and a dark theme that only redefines them.
- Only commit when asked. `main` will be protected like tsgen's (PR plus green `test`); don't push to it directly.
- The content repo is **private** (that is what keeps the site undiscoverable) and builds with this repo at a tag, as tsgen's does. Never put content in this repo. `vault/` (gitignored) is a local copy for testing; until the real vault exists, test with scratch vaults in the scratchpad.

## Layout

- `build.js`: CLI (`pgen [build | serve]`) and the build. The vault is the working directory; output goes to `./dist` or `$PGEN_OUT` (use the scratchpad for test builds).
- `lib/vault.js` (files → page records, images), `lib/render.js` (embeds and partials → EJS → wikilinks → markdown-it), `lib/source.js`, `lib/partials.js`, `lib/markdown.js`, `lib/output.js` (the post-passes and the writer), `lib/layout.js`, `lib/html/` (the tag walker and passes), `lib/bible/` (reference table, scanner, linker, checks), `serve.js`/`lib/watch.js` (preview).
- `template/`: `layout.ejs`, `style.css` (screen, dark and print), fonts, the bark photograph. Copied to `/asset/` in the output.
- `scripts/convert-wiki.js`: the one-time wikitext → Markdown migration (kept for the record); `scripts/reports.js` and `scripts/pdf-runs.swift` rebuild the two committee reports from their sources (see the header of `convert-wiki.js`).
- `docs/decisions.md`: settled questions. Record new decisions there.

## The vault

Markdown files anywhere (except `partial/` and `image/`) are pages. Filename = title, unless `title:` says otherwise (Obsidian forbids colons); slug = slugified filename, unless `slug:`, which is used as written (the migration gives every page its old wiki name, `Christian_Baptism`). Pages live at `/<slug>/`, and `/view/<slug>/` (the old MediaWiki address) redirects there, as does `/view/<alias>/` for each name in `aliases:`; `Home.md` is `/`; `404.md` is `/404.html`. `hidden: true` leaves a page out. `about: true` adds the "Who is Joey Day?" box. A page opens with `text {.subtitle}` and `by X {.byline}` paragraphs, which the build moves into the header. Also in the vault root: `abbreviations.json`, `initials.json`, `alt-text.json` (all required).

- `{{name|arg}}` expands `partial/name.md` (`{{1}}` is the first argument). Partials are the only way to share text between pages: there is no page transclusion (Obsidian draws `![[Page]]` embeds in a style Joey dislikes). The Westminster Confession's chapters are partials (`wcf-i` …) included by their own page and by the whole Confession; footnote labels in a partial must be unique among the partials a page includes (`[^ii-1]`).
- Partials and pages may contain EJS (`<% %>`), which sees `page` (name, title, slug) of the page being built. Nothing in the migrated corpus uses it today. EJS runs before wikilinks resolve.
- Footnotes (`[^1]`) get a "Notes" heading written by the generator.
- Scripture: abbreviations without a space for numbered books (`1Co`, `2Ti`), except a lone reference that spells its book out (`Genesis 1:1`), which stays; `!` opts a reference or all-caps word out.
