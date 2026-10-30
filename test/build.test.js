import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { buildVault } from './helpers.js'

// Each test builds a tiny scratch vault with the real generator and checks that the build
// passes or fails for the right reason. A failing build exits non-zero and prints
// "Build failed: <what is wrong>".

const builds = []
const build = async (files) => {
  const result = await buildVault(files)
  builds.push(result)
  return result
}
after(() => Promise.all(builds.map((b) => b.cleanup())))

const page = (body, data = '') => `---\ntitle: T\n${data}---\n${body}\n`

function assertFails (result, pattern) {
  assert.notEqual(result.code, 0, `expected the build to fail:\n${result.output}`)
  assert.match(result.output, /Build failed:/)
  assert.match(result.output, pattern)
}

describe('pages and links', { concurrency: true }, () => {
  test('a page lives at its slugified file name, the home page at /', async () => {
    const b = await build({ 'Christian Baptism.md': page('Text.'), '404.md': page('Gone.') })
    assert.equal(b.code, 0, b.output)
    assert.ok(await b.exists('/christian-baptism/'))
    assert.ok(await b.exists('/'))
    assert.ok(await b.exists('/404/'))
  })

  test('a slug in the frontmatter wins, and the title falls back to the file name', async () => {
    const b = await build({ 'Why: not?.md': '---\nslug: why-not\n---\nText.\n' })
    assert.equal(b.code, 0, b.output)
    assert.match(await b.read('/why-not/'), /<h1>Why: not\?<\/h1>/)
  })

  test('a wikilink resolves by name, with text and a heading', async () => {
    const b = await build({ 'A.md': page('See [[Christian Baptism|baptism]] and [[Christian Baptism#Early Church]].'), 'Christian Baptism.md': page('Text.') })
    assert.equal(b.code, 0, b.output)
    const html = await b.read('/a/')
    assert.match(html, /<a [^>]*href="\/christian-baptism\/"[^>]*>baptism<\/a>/)
    assert.match(html, /href="\/christian-baptism\/#early-church"/)
  })

  test('a wikilink to no page fails the build', async (t) => {
    assertFails(await build({ 'A.md': page('See [[Nowhere]].') }), /\[\[Nowhere\]\] matches no page/)
  })

  test('two pages with one slug fail the build', async () => {
    assertFails(await build({ 'A B.md': page('x'), 'a-b.md': page('y') }), /both have the slug "a-b"/)
  })

  test('a hidden page is not built, and a link to it fails', async () => {
    const b = await build({ 'Draft.md': page('x', 'hidden: true\n') })
    assert.equal(b.code, 0, b.output)
    assert.equal(await b.exists('/draft/'), false)
    assertFails(await build({ 'Draft.md': page('x', 'hidden: true\n'), 'A.md': page('[[Draft]]') }), /matches no page/)
  })
})

describe('the pipeline', { concurrency: true }, () => {
  test('a Scripture reference links, a ! opts one out, one that cannot exist fails', async () => {
    const b = await build({ 'A.md': page('See John 3:16 KJV and !Romans 17.') })
    assert.equal(b.code, 0, b.output)
    const html = await b.read('/a/')
    assert.match(html, /href="https:\/\/ref\.ly\/Jn3\.16;KJV"/)
    assert.match(html, /Romans 17\./)
    assertFails(await build({ 'A.md': page('See Romans 17.') }), /Romans has 16 chapters/)
  })

  test('a bare number after a semicolon is a chapter, and after a comma a verse', async () => {
    const b = await build({ 'A.md': page('Heb 4:2; 11 and Jn 3:16, 18; 5, 7.') })
    assert.equal(b.code, 0, b.output)
    const hrefs = [...(await b.read('/a/')).matchAll(/href="https:\/\/ref\.ly\/([^"]+)"/g)].map((m) => m[1])
    assert.deepEqual(hrefs, ['Heb4.2;ESV', 'Heb11;ESV', 'Jn3.16;ESV', 'Jn3.18;ESV', 'Jn5;ESV', 'Jn7;ESV'])
    assertFails(await build({ 'A.md': page('Ro 4:13–16; 20–25') }), /Romans has 16 chapters/)
  })

  test('a number after an italic title is not a verse', async () => {
    const b = await build({ 'A.md': page('See John 3:16. Buttrick, *The Interpreters Bible*, 12:293–94.') })
    assert.equal(b.code, 0, b.output)
    assert.doesNotMatch(await b.read('/a/'), /<a [^>]*>12:293/)
  })

  test('abbreviations, initials, Roman numerals and divine names are wrapped', async () => {
    const b = await build({ 'A.md': page('R.C. Sproul on chapter XXVII; the LORD, in the ESV.') })
    assert.equal(b.code, 0, b.output)
    const html = await b.read('/a/')
    assert.match(html, /<abbr title="Robert Charles Sproul">R\.C\.<\/abbr>/)
    assert.match(html, /<span class="roman-num">XXVII<\/span>/)
    assert.match(html, /<span class="divine-name"><span class="divine-name-initial">L<\/span>ORD<\/span>/)
    assert.match(html, /<abbr title="English Standard Version">ESV<\/abbr>/)
  })

  test('an unexplained all-caps word, or initials, or an image fail the build', async () => {
    assertFails(await build({ 'A.md': page('NASA') }), /NASA is not in abbreviations\.json/)
    assertFails(await build({ 'A.md': page('J.K. Rowling') }), /initials "J\.K\." need an entry/)
    assertFails(await build({ 'A.md': page('![[other.png]]'), 'image/other.png': 'x' }), /other\.png has no entry in alt-text\.json/)
  })

  test('footnotes get a Notes heading, and partials can carry them', async () => {
    const b = await build({
      'partial/b.md': 'One.[^b1]\n\n[^b1]: First.',
      'partial/c.md': 'Two.[^c1]\n\n[^c1]: Second.',
      'A.md': page('{{b}}\n\n{{c}}')
    })
    assert.equal(b.code, 0, b.output)
    const html = await b.read('/a/')
    assert.match(html, /<h2 id="notes">Notes<\/h2>/)
    assert.match(html, /First\./)
    assert.match(html, /href="#fn2"/)
  })

  test('a partial takes arguments, and its EJS sees the page that uses it', async () => {
    const b = await build({
      'partial/greet.md': "<% if (page.slug === 'a') { %>Hello {{1}}<% } else { %>Bye {{1}} [[Nowhere]]<% } %>",
      'A.md': page('{{greet|Joey}}')
    })
    assert.equal(b.code, 0, b.output) // the link in the branch not taken is never looked up
    assert.match(await b.read('/a/'), /Hello Joey/)
    assertFails(await build({ 'partial/greet.md': "<% if (page.slug === 'a') { %>Hi<% } else { %>[[Nowhere]]<% } %>", 'B.md': page('{{greet}}') }), /\[\[Nowhere\]\] matches no page/)
  })

  test('a missing partial fails the build', async () => {
    assertFails(await build({ 'A.md': page('{{nope}}') }), /partial "nope" not found/)
  })

  test('an image embed on its own line is a figure, inline it is not', async () => {
    const b = await build({ 'A.md': page('![[photo.png]]\n\nText ![[photo.png|20]] here.'), 'image/photo.png': 'x' })
    assert.equal(b.code, 0, b.output)
    const html = await b.read('/a/')
    assert.match(html, /<figure><img src="\/image\/photo\.png" alt="A photo"><\/figure>/)
    assert.match(html, /Text <img src="\/image\/photo\.png" alt="A photo" width="20"> here\./)
  })
})

describe('the header', () => {
  test('a subtitle and a byline that open a page move into its header', async () => {
    const b = await build({ 'A.md': page('A subtitle[^1] {.subtitle}\n\nby Joey {.byline}\n\nBody.\n\n[^1]: Note.') })
    assert.equal(b.code, 0, b.output)
    assert.match(await b.read('/a/'), /<h1>T<\/h1>\s*<p class="subtitle">A subtitle[\s\S]*<\/p>\s*<p class="byline">by Joey<\/p>\s*<\/header>\s*<p>Body\./)
  })
})

describe('nothing is discoverable', () => {
  test('every page says noindex, and robots.txt disallows everything', async () => {
    const b = await build({})
    assert.match(await b.read('/'), /<meta name="robots" content="noindex, nofollow">/)
    assert.match(await b.read('/robots.txt'), /Disallow: \//)
    assert.equal(await b.exists('/sitemap.xml'), false)
  })
})

test('a slug is used as written, and the old /view/ addresses redirect', async () => {
  const site = await buildVault({
    'Christian baptism.md': '---\nslug: Christian_Baptism\naliases: [baptism_old, cog11.5]\n---\nSee [[Christian baptism]].\n',
    'Linker.md': 'Go to [[Christian_Baptism]].\n'
  })
  try {
    assert.equal(site.code, 0, site.output)
    assert.ok(await site.exists('/Christian_Baptism/'))
    assert.match(await site.read('/linker/'), /href="\/Christian_Baptism\/"/)
    for (const name of ['Christian_Baptism', 'baptism_old', 'cog11.5']) {
      assert.match(await site.read(`/view/${name}/`), /http-equiv="refresh" content="0; url=\/Christian_Baptism\/"/)
    }
  } finally { await site.cleanup() }
})

test('a name that two pages answer to at /view/ fails the build', async () => {
  const site = await buildVault({
    'One.md': '---\nslug: Same\n---\nx\n',
    'Two.md': '---\naliases: [Same]\n---\nx\n'
  })
  try {
    assert.notEqual(site.code, 0)
    assert.match(site.output, /both answer to \/view\/Same\//)
  } finally { await site.cleanup() }
})

test('a slug that is not safe in a URL fails the build', async () => {
  const site = await buildVault({ 'Bad.md': '---\nslug: a/b\n---\nx\n' })
  try {
    assert.notEqual(site.code, 0)
    assert.match(site.output, /can't be a slug/)
  } finally { await site.cleanup() }
})
