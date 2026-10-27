import path from 'path'
import ejs from 'ejs'
import { BuildError } from './errors.js'
import { escHtml } from './html/escape.js'
import { headingSlug } from './html/passes.js'
import { md, protectFencedAttrs } from './markdown.js'
import { prepareSource } from './source.js'
import { IMAGE_EXTENSIONS, slugOf } from './vault.js'

// Renders one page's Markdown to HTML (no layout): partials, EJS, wikilinks, then markdown-it.
// The first three are plain text passes over the raw Markdown, with code
// masked so it stays literal. Anything that can't be resolved (a wikilink to no page, an
// image that isn't there, a missing partial) is pushed onto `problems`, which fails the build.

// [[Page]], [[Page|text]], [[Page#Heading]], [[#Heading]] and the image forms ![[a.png|300]].
const WIKILINK_RE = /(!?)\[\[(.*?)\]\]/g

export function renderBody (page, { partials, vault, problems }) {
  const where = (problem) => `"${page.filePath}": ${problem}`
  const source = prepareSource(page.content, partials, {
    push: (problem) => problems.push(where(problem))
  })

  // Only pages with template tags pay for EJS, which runs first so a wikilink in a branch
  // that isn't taken is never looked up. A broken template fails the build rather than
  // publishing a blank page. A partial's tags see the page that uses it (`page`), so one
  // partial can behave differently on different pages.
  let text = source.text
  if (text.includes('<%')) {
    try {
      text = ejs.render(text, { page: { name: page.name, title: page.title, slug: page.slug }, frontmatter: page.data })
    } catch (err) {
      throw new BuildError(`EJS render error in "${page.filePath}": ${err.message}`)
    }
  }

  const markdown = text.replace(WIKILINK_RE, (match, bang, inner, offset, whole) => {
    const bar = inner.indexOf('|')
    const target = bar === -1 ? inner : inner.slice(0, bar)
    const text = bar === -1 ? inner : inner.slice(bar + 1)

    if (IMAGE_EXTENSIONS.has(path.extname(target).toLowerCase())) {
      const url = vault.imageMap[target.trim().toLowerCase().replace(/^image\//, '')]
      if (!url) {
        problems.push(where(`${match} matches no image; images live in image/`))
        return `<span class="broken">${escHtml(match)}</span>`
      }
      const name = path.basename(target)
      if (!bang) return `[${text === inner ? name : text}](${url})`
      const size = text.match(/^(\d+)(?:x(\d+))?$/)
      const attrs = size ? ` width="${size[1]}"${size[2] ? ` height="${size[2]}"` : ''}` : ''
      const img = `<img src="${escHtml(url)}" alt="${escHtml(!size && text !== inner ? text : name)}"${attrs}>`
      // An image alone on its line is a figure; one inside a line of text stays inline.
      const alone = /(^|\n)[ \t]*$/.test(whole.slice(0, offset)) && /^[ \t]*(\n|$)/.test(whole.slice(offset + match.length))
      return alone ? `<figure>${img}</figure>` : img
    }

    const [name, ...heading] = target.split('#')
    const fragment = heading.length > 0 ? `#${headingSlug(heading.join('#'))}` : ''
    let url = ''
    if (name.trim() !== '') {
      const found = vault.byName.get(name.trim().toLowerCase()) ?? vault.bySlug.get(slugOf(name))
      if (!found) {
        problems.push(where(`[[${name.trim()}]] matches no page`))
        return `<span class="broken">${text}</span>`
      }
      url = found.url
    }
    return `[${bar === -1 ? (name.trim() || heading.join('#')) : text}](${url}${fragment})`
  })

  return md.render(source.restore(protectFencedAttrs(markdown)))
}
