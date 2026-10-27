import fs from 'fs/promises'
import path from 'path'
import slugify from 'slugify'
import { BuildError } from './errors.js'
import { parseFrontmatter } from './frontmatter.js'
import { mapLimit } from './io.js'

// Reading the vault (the working directory): every Markdown file is a page, except the ones
// in partial/ (named templates, see partials.js). Pictures live in image/ and are copied flat
// to <output>/image/.

const SKIP_DIRS = new Set(['node_modules', 'dist', 'partial', 'image'])

// Markdown that sits beside the content but is never a page. Compared in lowercase, since
// the vault sits on a case-insensitive filesystem.
const NEVER_PAGES = new Set(['claude.md', 'plan.md', 'readme.md'])

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif'])

const slugOf = (text) => slugify(text, { lower: true, strict: true })

// A `slug:` is used as written (the old wiki's page names, `Christian_Baptism`, `cog11.5`), so
// it must be safe in a URL path. These names are the site's own folders.
const SLUG_RE = /^[\w~*!$()+,;:@=-][\w.~*!$()+,;:@=-]*$/
const RESERVED_SLUGS = new Set(['view', 'asset', 'image'])

async function findFiles (dir, keep, root = dir) {
  const found = []
  // readdir order is up to the filesystem; sort so output doesn't depend on it.
  const entries = (await fs.readdir(dir, { withFileTypes: true }).catch(() => []))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
  for (const entry of entries) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name)) found.push(...await findFiles(file, keep, root))
    } else if (entry.isFile() && keep(entry.name)) {
      // iCloud leaves ".Name.md.icloud" for a file that isn't downloaded.
      found.push(file)
    } else if (entry.name.endsWith('.icloud')) {
      throw new BuildError(`"${file}" isn't downloaded from iCloud; download it and build again`)
    }
  }
  return found
}

// Frontmatter keys are lowercase (`Title:` would otherwise be silently ignored). The text
// keys must be text (a title may be a number, `title: 1984`) and the switches must be true or false.
function checkFrontmatter (data, filePath) {
  const problems = []
  for (const key of Object.keys(data)) {
    if (key !== key.toLowerCase()) problems.push(`"${filePath}": the frontmatter key "${key}" must be lowercase`)
  }
  for (const key of ['title', 'slug', 'description']) {
    if (typeof data[key] === 'number') data[key] = String(data[key])
    if (data[key] != null && typeof data[key] !== 'string') problems.push(`"${filePath}": "${key}" must be text`)
  }
  const names = [['slug', data.slug], ...(Array.isArray(data.aliases) ? data.aliases : []).map((alias) => ['alias', alias])]
  for (const [what, value] of names) {
    if (typeof value === 'string' && (!SLUG_RE.test(value) || RESERVED_SLUGS.has(value))) {
      problems.push(`"${filePath}": "${value}" can't be a ${what}; use letters, digits and . _ - ~ * ! $ ( ) + , ; : @ = only, and not view, asset or image`)
    }
  }
  if (data.aliases != null && !(Array.isArray(data.aliases) && data.aliases.every((a) => typeof a === 'string'))) {
    problems.push(`"${filePath}": "aliases" must be a list of text`)
  }
  for (const key of ['about', 'hidden']) {
    if (data[key] != null && typeof data[key] !== 'boolean') problems.push(`"${filePath}": "${key}" must be true or false`)
  }
  return problems
}

// Copies image/ flat into <outputDir>/image/. Two files with one name would overwrite
// each other, so that fails the build. Returns the image map: lowercase name → URL.
async function copyImages (outputDir) {
  const files = await findFiles('image', (name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()), 'image')
  const imageMap = {}
  const seen = new Map()
  for (const file of files) {
    const name = path.basename(file).toLowerCase()
    if (seen.has(name)) throw new BuildError(`Two images are named "${path.basename(file)}": "${seen.get(name)}" and "${file}"; image names are flat, so each must be unique`)
    seen.set(name, file)
    imageMap[name] = `/image/${path.basename(file)}`
  }
  if (files.length > 0) await fs.mkdir(path.join(outputDir, 'image'), { recursive: true })
  await mapLimit(files, (file) => fs.copyFile(file, path.join(outputDir, 'image', path.basename(file))))
  return imageMap
}

// Reads the whole vault. A page is { name, filePath, title, slug, url, data, content }: its
// name is its file's, its title is `title` or its name, and its slug is `slug` (as written) or
// the slugified name (the home page, `home`, is /; `404` is /404). `hidden` pages are left out of the site,
// so a link to one fails the build.
//   bySlug    slug → page, for wikilinks (a page can also be linked by its file's name)
//   partials  lowercase name → text
export async function loadVault ({ outputDir }) {
  const imageMap = await copyImages(outputDir)

  const partials = {}
  for (const file of await findFiles('partial', (name) => name.endsWith('.md'))) {
    partials[path.basename(file, '.md').toLowerCase()] = (await fs.readFile(file, 'utf-8')).trim()
  }

  const problems = []
  const pages = []
  const files = await findFiles('.', (name) => name.endsWith('.md') && !NEVER_PAGES.has(name.toLowerCase()))
  await mapLimit(files, async (file, i) => {
    const filePath = path.relative('.', file)
    let parsed
    try {
      parsed = parseFrontmatter(await fs.readFile(file, 'utf-8'))
    } catch (err) {
      problems.push(`Bad frontmatter in "${filePath}": ${err.message}`)
      return
    }
    problems.push(...checkFrontmatter(parsed.data, filePath))
    const name = path.basename(file, '.md')
    const slug = parsed.data.slug || slugOf(name)
    if (!slug) problems.push(`"${filePath}" has no usable slug; its name has no letters or digits (add a slug in its frontmatter)`)
    pages[i] = {
      name,
      filePath,
      title: parsed.data.title || name,
      slug,
      url: slug === 'home' ? '/' : `/${slug}/`,
      aliases: parsed.data.aliases ?? [],
      data: parsed.data,
      content: parsed.content
    }
  })
  if (problems.length > 0) throw new BuildError(problems.join('\n'))

  const bySlug = new Map()
  const byName = new Map()
  const live = pages.filter((page) => !page.data.hidden)
  for (const page of live) {
    const clash = bySlug.get(page.slug)
    if (clash) throw new BuildError(`"${page.filePath}" and "${clash.filePath}" both have the slug "${page.slug}"; give one a slug in its frontmatter`)
    bySlug.set(page.slug, page)
    byName.set(page.name.toLowerCase(), page)
  }

  // The old wiki's addresses were /view/<name>: each page's slug and each alias (a name that
  // used to redirect to it) still lead to it.
  const redirects = new Map()
  for (const page of live) {
    if (page.slug === '404') continue
    for (const name of [page.slug, ...page.aliases]) {
      const clash = redirects.get(name)
      if (clash && clash !== page) throw new BuildError(`"${page.filePath}" and "${clash.filePath}" both answer to /view/${name}/; fix the slug or aliases of one`)
      redirects.set(name, page)
    }
  }
  return { pages: live, bySlug, byName, redirects, partials, imageMap }
}

export { slugOf }
