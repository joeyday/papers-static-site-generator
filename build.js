#!/usr/bin/env node
import { execFileSync } from 'child_process'
import fsSync from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { BuildError } from './lib/errors.js'
import { describe } from './lib/html/describe.js'
import { createLayout } from './lib/layout.js'
import { info, setVerbose } from './lib/log.js'
import { createOutput } from './lib/output.js'
import { renderBody } from './lib/render.js'
import { createWatcher } from './lib/watch.js'
import { loadVault } from './lib/vault.js'

// The vault (content) is the working directory; the template ships with this repo. Output goes
// to ./dist unless PGEN_OUT names another directory (local use only, e.g. to keep build
// output out of an iCloud-synced vault; CI sets nothing).
const OUTPUT_DIR = process.env.PGEN_OUT ? path.resolve(process.env.PGEN_OUT) : 'dist'
const TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'template')

// ─── Cache-buster ───
// The content repo's commit (CI sets GITHUB_SHA; locally, the vault's HEAD), so assets are
// refetched exactly when a deploy changes something. Without a repo, one timestamp.
function cacheBuster () {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return String(Math.floor(Date.now() / 1000))
  }
}

// Every build starts from an empty output directory, so pages deleted from the vault don't
// linger. Refuses a directory that is the vault or holds it.
async function cleanOutputDir (dir) {
  const rel = path.relative(path.resolve(dir), process.cwd())
  if (rel === '' || !(rel.startsWith('..') || path.isAbsolute(rel))) {
    throw new BuildError(`Refusing to clear "${path.resolve(dir)}": it holds the vault. Point PGEN_OUT somewhere else.`)
  }
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
}

// A page's subtitle and byline are paragraphs that open its body (`text {.subtitle}`); in the
// page they belong in the header, under the title.
const HEADER_RE = /^(?:\s*<p class="(?:subtitle|byline)">[\s\S]*?<\/p>)+/
function splitHeader (html) {
  const header = HEADER_RE.exec(html)?.[0] ?? ''
  return { header: header.trim(), body: html.slice(header.length) }
}

const redirectPage = (url) => `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Redirecting…</title>
<meta name="robots" content="noindex,nofollow">
<link rel="canonical" href="https://papers.jday.co${url}">
<meta http-equiv="refresh" content="0; url=${url}">
<p><a href="${url}">Continue to the page</a>
`

async function build ({ outputDir = OUTPUT_DIR } = {}) {
  await cleanOutputDir(outputDir)

  const vault = await loadVault({ outputDir })
  const renderLayout = createLayout({
    template: await fs.readFile(path.join(TEMPLATE_DIR, 'layout.ejs'), 'utf-8'),
    cacheBust: cacheBuster()
  })
  const output = await createOutput({ outputDir })

  const problems = []
  for (const page of vault.pages) {
    const { header, body } = splitHeader(renderBody(page, { partials: vault.partials, vault, problems }))
    await output.emit(page.url, renderLayout(body, {
      url: page.url,
      title: page.title,
      header,
      description: page.data.description?.trim() || describe(body),
      about: page.data.about ?? false
    }), page.filePath)
    info(`Built: ${page.filePath} -> ${output.fileFor(page.url)} (URL: ${page.url})`)
  }

  const failures = []
  if (problems.length > 0) failures.push(`Problems in pages:\n${problems.join('\n')}`)
  if (output.problems.length > 0) {
    failures.push(`Scripture references, abbreviations, initials and images that need attention (write a ! before a reference or an all-caps word to opt it out):\n${output.problems.join('\n')}`)
  }
  if (failures.length > 0) throw new BuildError(failures.join('\n\n'))

  // GitHub Pages can't redirect, so each old address (/view/<name>/) is a page that does.
  for (const [name, page] of vault.redirects) {
    await output.writeFile(path.join('view', name, 'index.html'), redirectPage(page.url))
  }

  // Nothing is for search engines (every page also says so itself), and GitHub Pages serves
  // the site at its own domain.
  await output.writeFile('robots.txt', 'User-agent: *\nDisallow: /\n')
  await output.writeFile('CNAME', 'papers.jday.co\n')
  await output.writeFile('.nojekyll', '')
  await fs.cp(TEMPLATE_DIR, path.join(outputDir, 'asset'), { recursive: true, filter: (src) => path.basename(src) !== 'layout.ejs' })
  await output.finish()
}

// ─── Watching ─────────────────────────────────────────────────────────────────
// serve rebuilds when the vault or the template changes. A rebuild goes into a staging
// directory and replaces the served one only when it succeeds, so a mistake that fails the
// build leaves the last good site up. Pages open in a browser then reload themselves.

const STAGE_DIR = path.join(path.dirname(OUTPUT_DIR), `.${path.basename(OUTPUT_DIR)}-next`)
const OLD_DIR = path.join(path.dirname(OUTPUT_DIR), `.${path.basename(OUTPUT_DIR)}-old`)

const WATCHED_EXTENSIONS = new Set(['.md', '.json', '.ejs', '.css', '.js', '.svg', '.woff', '.woff2', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif'])

function isSiteFile (relPath, skipNames) {
  const parts = relPath.split('/')
  if (parts.some((p) => p.startsWith('.') || skipNames.has(p))) return false
  return WATCHED_EXTENSIONS.has(path.extname(relPath).toLowerCase())
}

function watchAndRebuild ({ reloadPages }) {
  let building = false

  // A rebuild always says what started it and how long it took.
  async function rebuild (files) {
    if (building) {
      // The quiet period ended while a build was still running: those changes wait out a
      // fresh quiet period instead of starting a build the moment this one ends.
      watcher.notify(files)
      return
    }
    console.log(`Changed: ${files.slice(0, 5).join(', ')}${files.length > 5 ? ` and ${files.length - 5} more` : ''}`)
    building = true
    const started = performance.now()
    try {
      await build({ outputDir: STAGE_DIR })
      await fs.rm(OLD_DIR, { recursive: true, force: true })
      await fs.rename(OUTPUT_DIR, OLD_DIR)
      await fs.rename(STAGE_DIR, OUTPUT_DIR)
      await fs.rm(OLD_DIR, { recursive: true, force: true })
      console.log(`Rebuilt in ${((performance.now() - started) / 1000).toFixed(2)} s.`)
      reloadPages()
    } catch (err) {
      console.error('Build failed (still serving the last good build):', err instanceof BuildError ? err.message : err)
    } finally {
      building = false
    }
  }

  const watcher = createWatcher({ onChange: rebuild, quietMs: 500 })
  const outputNames = new Set(['dist', 'node_modules', path.basename(OUTPUT_DIR)])
  watcher.watch('.', (rel) => isSiteFile(rel, outputNames))
  watcher.watch(TEMPLATE_DIR, (rel) => isSiteFile(rel, new Set()))

  // The staging directories are dot-folders inside the vault; don't leave them behind.
  const cleanUp = () => {
    watcher.stop()
    fsSync.rmSync(STAGE_DIR, { recursive: true, force: true })
    fsSync.rmSync(OLD_DIR, { recursive: true, force: true })
  }
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      cleanUp()
      process.exit(0)
    })
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
// pgen [build]      build the site into the output directory (what CI runs).
// pgen serve        build, then serve the output locally (see serve.js) and rebuild whenever
//                   the vault or the template changes, with:
//   --verbose       print every "Built …" line; otherwise only warnings, errors and the address.
//   --port <n>      serve on port n instead of 4000 (also --port=n).
//   --no-watch      serve the first build without rebuilding on changes.

const USAGE = 'Usage: pgen [build | serve [--verbose] [--no-watch] [--port <n>]]'
const [command = 'build', ...args] = process.argv.slice(2)

let verbose = false
let watching = true
let port
let usageOk = command === 'build' ? args.length === 0 : command === 'serve'
for (let i = 0; usageOk && i < (command === 'serve' ? args.length : 0); i++) {
  const [flag, inlineValue] = args[i].split(/=(.*)/s)
  if (flag === '--verbose' && inlineValue === undefined) verbose = true
  else if (flag === '--no-watch' && inlineValue === undefined) watching = false
  else if (flag === '--port') {
    const value = inlineValue ?? args[++i]
    port = Number(value)
    if (!/^\d+$/.test(value ?? '') || port < 1 || port > 65535) usageOk = false
  } else usageOk = false
}
if (!usageOk) {
  console.error(USAGE)
  process.exit(1)
}

setVerbose(command === 'build' || verbose)

try {
  await build()
} catch (err) {
  console.error('Build failed:', err instanceof BuildError ? err.message : err)
  process.exit(1)
}

if (command === 'serve') {
  try {
    const { serve } = await import('./serve.js')
    const { reloadPages } = await serve(OUTPUT_DIR, port, { watching })
    if (watching) watchAndRebuild({ reloadPages })
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
