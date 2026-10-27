# Joey's Papers static site generator

Builds https://papers.jday.co from a private vault of Markdown files. See `CLAUDE.md` for how it works and `docs/decisions.md` for why.

```sh
npm ci
npm test
cd <vault> && PGEN_OUT=/somewhere/else node <this repo>/build.js         # build
cd <vault> && PGEN_OUT=/somewhere/else node <this repo>/build.js serve   # build, serve and rebuild on change
```
