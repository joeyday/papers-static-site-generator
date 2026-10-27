# Plan

Open work only. When something is finished, delete it here; `decisions.md` records what is settled.

## Before the first release (Joey's review)

The migration was made to build, not to be right. **Go through all of this by hand before anything is released:**

- [ ] **Guessed abbreviations.** `abbreviations.json` holds about 100 expansions Claude guessed (`GUESSED_ABBREVIATIONS` in `scripts/convert-wiki.js`), some surely wrong (CG, CSC, FAIR, HSM, IRT, MPWA, PNW, TLNF, `J.B.O.`, `J.C.` …). The wiki's own `<abbr title>` expansions are right; the rest are not.
- [ ] **Guessed initials.** `initials.json` has guessed expansions (`GUESSED_INITIALS`).
- [ ] **Words opted out with `!`.** Headings set in capitals (Berkhof's *Christian Baptism*, Twain's *Roughing It*, the Creation Committee report), names and codes carry a `!` (`PROSE_CAPS`). Decide for each page: keep the capitals, rewrite in sentence case, or add a real abbreviation.
- [ ] **Scripture references opted out with `!`** because they can't exist (6 chains: `the-end` ×4, `one`, `mormon-scholarship`, where "4 Ezra" now reads "4 Ezr"): are they page numbers, typos or other books? Also read the ~770 names rewritten to standard abbreviations (the converter once read "Mar." as Mark; check there are no more look-alikes: Jon, Dan, Rev, Song).
- [ ] **Alt text.** Every image's alt text is its file name (`alt-text.json`): write real descriptions.
- [ ] **Long-title slugs.** Five titles kept their old short slug (`atf-lab`, `efas`, `epistemology`, `fundamentalist-mormon`, `mormon-scholarship`): confirm or rename.
- [ ] **Scratch and personal pages** (`lipsum`, `scratch`, `temp`, `sandbox`, `todo`, the letters …): the cleanup pass before go-live. Use `hidden: true` to leave a page out without deleting it.
- [ ] **Chapter names of the Westminster Confession** (`WCF I` … and the partials `wcf-i` …) and their titles.
- [ ] **Dropped on migration:** `{{Citation missing}}` (one use, `Mormon Scholarship…`), the float of one image (`jesus-loves-the-little-children.jpg`, was right-aligned), and the Redirect, Talk, User and MediaWiki pages.

## The two committee reports (rebuilt from their sources)

`Report of the Committee to Study Republication` (OPC) is rebuilt from the OPC's own HTML and `Creation Committee report` (PCA) from the PCA's PDF, by `scripts/reports.js`. Please read both through once:

- [ ] **Creation report, paragraph breaks.** After "1. What is the ‘Day-Age’ interpretation?" the report comes from the PDF, which has no paragraph markers: breaks are guessed from short lines and from where your wiki copy's paragraphs began. Look for paragraphs run together or split.
- [ ] **Creation report, block quotes.** Indented quotations in the PDF part (Kline-style quotes, creeds) can't be seen in the PDF text and are ordinary paragraphs.
- [ ] **Creation report, lettered list** (a., b., c. in B.1): the labels are kept as text; the wiki copy had lost "a." (put back).
- [ ] **Creation report, italics.** Before the marker, 6 italic runs were restored from the PDF and 3 were skipped as ambiguous; after it, italics come straight from the PDF. A title split across runs shows as `*The* F*ellowship…*` (once).
- [ ] **Creation report, the committee roster** is a two-column table.
- [ ] **Republication report, headings.** 89 headings were marked from patterns (Part, Ch., I., A.) and the bold or italic lines; skim the outline. Ch. 8's "Introduction" and the "Galatians 3:12…" labels are the judgement calls.
- [ ] **Republication report, the OPC's disclaimer** (the box under the subtitle) is kept; the OPC's site navigation and footer are not.
- [ ] **Both**: the converter's source files are not in the repo (they are the OPC's and PCA's documents): `curl` them (the URLs are in `convert-wiki.js`'s header) and run `scripts/pdf-runs.swift` on the PDF.

## Housekeeping

- [ ] **Rename the project folder to `pgen`** (Joey), then update `CLAUDE.md` if it names the old path.
- [ ] CI (`.github/workflows/ci.yml`, as tsgen's) and the GitHub rulesets (protected `main` and `v*` tags).
- [ ] The content repo: private, `package.json` depending on this repo at a tag, a workflow that builds and deploys to GitHub Pages, and `papers.jday.co` DNS.
- [ ] Look at the print stylesheet on real pages (the coleslaw recipe, an essay) and make PDFs.
- [ ] Look at light mode in a real browser (only dark mode and phone width have been looked at).
- [ ] `[[Page#Heading]]` links aren't checked against the target's headings, so a wrong heading builds silently.
- [ ] **Decide whether EJS stays.** Nothing in the corpus uses it now that chapters are partials; it costs only the pages that contain `<%`, and the layout needs `ejs` regardless.
