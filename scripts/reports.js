// Rebuilds the two committee reports from their published sources, which carry more structure
// than the copies pasted into the wiki (see convert-wiki.js, which calls these).
//
//   republication(html)  the OPC's Report of the Committee to Study Republication, from
//                        https://www.opc.org/GA/republication.html (a Word export, with real tables,
//                        italics and linked endnotes, but with most of its headings as plain paragraphs)
//
// Both return Markdown for the body of the page.

import { execFileSync } from 'node:child_process'

// ─── The OPC report ───

// A table out of Word, as plain HTML on one line (no blank line may end the HTML block): no
// styling, bold as <strong>, a cell's paragraphs as lines, a row of one cell spanning all as a header.
function tidyTable (table) {
  return table
    .replace(/<table\b[^>]*>/, '<table>')
    .replace(/<\/?(?:tbody|thead|colgroup|col)\b[^>]*>/g, '')
    .replace(/<td colspan="?(\d+)"?>\s*<p>\s*<b>([\s\S]*?)<\/b>\s*<\/p>\s*<\/td>/g, '<th colspan="$1">$2</th>')
    .replace(/<\/p>\s*<p>/g, '<br>')
    .replace(/<\/?p>/g, '')
    .replace(/<b>/g, '<strong>').replace(/<\/b>/g, '</strong>')
    .replace(/<td>\s*<\/td>/g, '<td></td>')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim()
}

// A paragraph that is only a heading: short, no sentence in it, not a lead-in ("as follows:").
const SHORT = 130
const isHeadingText = (s, max = SHORT) => s.length > 0 && s.length <= max && !/[.;,:]$/.test(s) && !/[.!?] [A-Z]/.test(s.replace(/^[IVX]+\. |^[A-D]\. /, ''))

// The text of a heading line written plain, in bold or in italics, and the footnote it may carry.
function headingLine (line) {
  const m = /^(?:\*\*(.+?)\*\*|\*(.+?)\*|(.+?))((?:\[\\\[\d+\\\]\]\(#_ftn\d+\)\{#_ftnref\d+\})?)$/.exec(line.trim())
  if (!m) return null
  const text = (m[1] ?? m[2] ?? m[3]).replace(/\\\./g, '.').trim()
  // a whole paragraph in bold is a heading, however long
  return isHeadingText(text, m[1] === undefined ? SHORT : 300) ? { text, note: m[4], bold: m[1] !== undefined, italic: m[2] !== undefined } : null
}

export function republication (html) {
  // The Word markup goes (spans, styles, classes); pandoc reads the rest.
  const body = html.slice(html.indexOf('<h1'))
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?span\b[^>]*>/g, '')
    .replace(/\s(?:style|class|lang|align|valign|width|height|border|cellpadding|cellspacing)=("[^"]*"|'[^']*'|[^\s>]+)/g, '')
    .replace(/<\/?o:p>/g, '')
  // The charts have spans and cells of several paragraphs, which pandoc can't write as Markdown
  // (it drops such a table). They are kept as HTML, tidied, and put back after pandoc is done.
  const tables = []
  const withoutCharts = body.replace(/<table\b[^>]*>[\s\S]*?<\/table>/g, (table) => {
    if (table.includes('General Assembly reports')) return table // the notice box
    tables.push(tidyTable(table))
    return `<p>ZZTABLE${tables.length - 1}ZZ</p>`
  })
  const md = execFileSync('pandoc', ['-f', 'html', '-t', 'markdown-smart-raw_html-native_divs-native_spans-header_attributes+pipe_tables-simple_tables-multiline_tables-grid_tables', '--wrap=none'], { input: withoutCharts, encoding: 'utf-8', maxBuffer: 1 << 28 })

  const lines = md.split('\n')

  // The title, subtitle and table of contents are the page's own; the notice box is kept.
  const notice = /^\| (General Assembly reports are [^|]*?) \|$/m.exec(md)?.[1]
  const from = lines.findIndex((l) => l === '### Mandate')
  let rest = lines.slice(from)

  // Footnotes: [\[1\]](#_ftnref1){#_ftn1} in the notes and [\[1\]](#_ftn1){#_ftnref1} in the text.
  const notesAt = rest.findIndex((l) => l === '### Endnotes')
  const notes = rest.slice(notesAt + 1)
  rest = rest.slice(0, notesAt)
  const definitions = []
  let inNote = false // the page's footer (navigation, contact details) follows the last note
  for (const line of notes) {
    if (line.startsWith('::: {#ftn')) inNote = true
    else if (line.startsWith(':::')) inNote = false
    else if (inNote) {
      const m = /^\[\\\[(\d+)\\\]\]\(#_ftnref\d+\)\{#_ftn\d+\} ?(.*)$/.exec(line)
      if (m) definitions.push(`[^${m[1]}]: ${m[2]}`)
      else if (line.trim()) definitions[definitions.length - 1] += ` ${line.trim()}`
    }
  }
  const footnoted = (s) => s.replace(/\[\\\[(\d+)\\\]\]\(#_ftn\d+\)\{#_ftnref\d+\}/g, '[^$1]')

  // Headings. Part, Ch., and the headings the source did mark come first; then the plain, bold
  // and italic lines that are headings in all but markup. A page's h1 is its title, so Parts are h2.
  const out = []
  let chapter = false // inside a chapter or later: Roman-numeral headings are one level deeper
  let intro = true // before Part I, where Introduction is a section of its own
  let roman = 3 // the level of the Roman-numeral headings in force
  for (let i = 0; i < rest.length; i++) {
    const line = rest[i]
    const marked = /^(#{3,4}) (.+)$/.exec(line)
    if (marked) {
      const text = marked[2].replace(/^GLOSSARY$/, 'Glossary').replace(/^PART/, 'Part')
      const depth = marked[1].length - 1 // ### → h2, #### → h3
      if (depth === 2) {
        chapter = false
        if (/^Part/.test(text)) intro = false
      } else {
        chapter = true
      }
      roman = depth + 1
      out.push(`${'#'.repeat(depth)} ${text}`)
      continue
    }
    const prev = rest[i - 1]?.trim()
    const next = rest[i + 1]?.trim()
    const heading = prev === '' && next === '' ? headingLine(line) : null
    if (heading && !/^[|>*:-]/.test(heading.text)) {
      const { text, note } = heading
      let depth = null
      if (/^Introduction$/.test(text)) depth = intro ? 2 : roman
      else if (/^[IVX]+\. /.test(text)) depth = chapter ? roman : 3
      else if (/^[A-D]\. /.test(text)) depth = (chapter ? roman : 3) + 1
      else if (/^(Summary and Conclusion|Addendum:|Looking Back and Looking Forward|Recommendation \d|Licensure$|Ordination$)/.test(text)) depth = roman
      else if (heading.italic) depth = roman + 1 // a label under a Roman-numeral heading
      if (depth !== null) {
        out.push(`${'#'.repeat(depth)} ${text}${note}`)
        continue
      }
    }
    out.push(line)
  }

  const text = footnoted(out.join('\n').replace(/^ZZTABLE(\d+)ZZ$/gm, (_, i) => `\n${tables[i]}\n`))
    .replace(/\\\n/g, '\n') // a stray line break
    .replace(/^ {2,}(?=\S)/gm, '') // indentation Word used for spacing
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const lead = [
    'Presented to the Eighty-third (2016) General Assembly of the Orthodox Presbyterian Church[^source] {.subtitle}',
    notice ? `\n::: {.notice}\n${notice}\n:::\n` : ''
  ].join('\n')
  return `${lead}\n${text}\n\n[^source]: Retrieved from [The Orthodox Presbyterian Church › General Assembly › Papers › Report of the Committee to Study Republication](http://www.opc.org/GA/republication.html)\n\n${definitions.join('\n\n')}\n`
}

// ─── The PCA report ───
// The wiki copy is the better text up to where its cleanup stopped (a "DRAFT BELOW" marker, after
// "1. What is the ‘Day-Age’ interpretation?"): paragraphs, italics and 58 footnotes. After the
// marker its paragraphs are wrapped in spurious italics, spliced with bullets and footnote text,
// and its notes are gone. From there the report is rebuilt from the PDF (every line of which is
// numbered, and every page: the digest's 2301–2391), whose runs carry their fonts: 12 pt text, 10 pt
// notes, 7–8 pt note numbers, bold headings and italics.

// [level, heading]: the report's outline, in order (the PDF's table of contents and its bold runs).
// h2 is a section, h3 a lettered or numbered part.
const OUTLINE = [
  [2, 'I. Introductory Statement'], [2, 'II. Background to the Current Discussion of the Creation Days'], [3, 'Conclusion'],
  [2, 'III. Brief Definitions'], [3, '1. Literal'], [3, '2. Historical'], [3, '3. Linguistic terms'], [4, 'a. Poetical'], [4, 'b. Analogy'],
  [3, '4. Philosophical terms'], [3, '5. Creationism'], [3, '6. Evolution'], [3, '7. Science'], [3, '8. Harmonization'], [3, '9. General Revelation'], [4, 'Definition of General Revelation'],
  [2, 'IV. Description of the main interpretations of Genesis 1–3 and the Creation Days'],
  [3, 'A. The Calendar-Day Interpretation'], [4, 'Definition of the Position'], [4, 'Description of the Position'], [4, 'Documentation of the Position'], [4, 'Strengths'], [4, 'Objections'],
  [3, 'B. The Day-Age Interpretation'], [4, '1. What is the ‘Day-Age’ interpretation?'],
  // above, the wiki copy; below, the PDF
  [4, '2. What is the meaning of the Hebrew word Yôm?'],
  [4, '3. Who has held a view that allows for creative days of unspecified length?'], [4, '4. Is the Day-Age interpretation just a reaction to Darwinism?'],
  [4, '5. How do you deal with the issue of death within this view?'], [4, '6. How do you deal with the issue of time within this view?'],
  [4, '7. What are the strengths of the Day-Age interpretation?'], [4, '8. What are the difficulties for the Day-Age interpretation?'],
  [3, 'C. The Framework Interpretation'], [4, 'Description'], [4, 'Comparison of the Framework Interpretation with Other Interpretations'], [4, 'Evaluation'], [5, 'Strengths'], [5, 'Objections'],
  [3, 'D. The Analogical Days Interpretation'], [4, 'Definition of the position'], [4, 'Historical background'], [4, 'Description of the position'],
  [4, 'Similarities to and differences from the other positions'], [4, 'Strengths of the position'], [4, 'Objections to the position'],
  [3, 'E. Other Interpretations of the Creation Days'], [4, '1. The “intermittent day” interpretation'], [4, '2. The “gap” (or “reconstitution”) interpretation'],
  [4, '3. The “days of revelation” interpretation'], [4, '4. The “days of divine fiat” interpretation'], [4, '5. The “focus on Palestine” interpretation'], [4, '6. Expanding time'],
  [2, 'V. Original Intent of the Westminster Assembly'], [3, 'Three Interpretations of the Original Intent of the Westminster Standards'],
  [4, 'A. First Interpretation of Intent'], [4, 'B. Second Interpretation of Intent'], [4, 'C. Third Interpretation of Intent'],
  [2, 'VI. Advice and Counsel of the Committee'], [3, 'Proposal for Reporting to the 28th General Assembly'], [3, 'Recommendations'],
  [2, 'VII. Appendices'], [3, 'A. Definitions (a fuller version than above)'],
  [4, '1. Literal'], [4, '2. Historical'], [4, '3. Linguistic terms'], [5, 'a. Poetical'], [5, 'b. Analogy'],
  [4, '4. Philosophical terms'], [5, 'a. Equivocation'], [5, 'b. Metaphysics'], [5, 'c. Naturalism'], [5, 'd. Deism'], [5, 'e. Geological terms'],
  [4, '5. Creationism'], [4, '6. Evolution'], [4, '7. Science'], [4, '8. Harmonization'], [4, '9. General Revelation'],
  [3, 'B. The New Testament’s View of the Historicity of Genesis 1–3'], [3, 'C. General Revelation'], [4, 'Summary and Conclusions']
]
// Headings the PDF sets in italics (or nothing) rather than in bold.
const SUBHEADINGS = ['Role of Reason', 'Knowledge of God', 'Creation Roots']
const SPLIT = OUTLINE.findIndex(([, h]) => h.startsWith('2. What is the meaning of the Hebrew'))

// A heading's letters and digits alone, without its "1." or "A." label: what two spellings share.
const key = (s) => s.toLowerCase().replace(/'{2,}|[=*]/g, '').replace(/^\s*(?:\d+|[a-e]|[ivx]+)\.\s+/i, '').replace(/(\d)(?:st|nd|rd|th)/g, '$1').replace(/[^a-z0-9]+/g, '')

// The wiki copy up to the marker, with its headings marked (the outline's first part) and the italics
// the PDF sets that the paste lost put back (a run that occurs once in the text, unitalicized).
// italicRuns: the text of every italic run on the first pages of the PDF.
export function creationBeginning (wikitext, italicRuns, report) {
  const lines = wikitext.split('\n')
  const kept = lines.slice(0, lines.findIndex((l) => /DRAFT BELOW/.test(l)))
  let at = 0
  for (const [level, heading] of OUTLINE.slice(0, SPLIT)) {
    const want = key(heading)
    const found = kept.findIndex((l, i) => i >= at && l.length < 200 && !/^(\*|#|;|:|\||\{|<)/.test(l) && key(l) === want)
    if (found === -1) {
      report?.push(`creation: no line for the heading "${heading}"`)
      continue
    }
    kept[found] = `${'='.repeat(level)} ${heading} ${'='.repeat(level)}`
    at = found + 1
  }
  let text = kept.join('\n').trim().replace(/^(?=The ‘six days’ are understood in the same sense)/m, 'a. ') // the first of a lettered list, whose label the paste lost

  let added = 0
  let skipped = 0
  for (const run of new Set(italicRuns.map((r) => r.replace(/\s+/g, ' ').trim()).filter((r) => r.length >= 8))) {
    const pattern = new RegExp(run.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'), 'g')
    const hits = [...text.matchAll(pattern)].filter((m) => (text.slice(0, m.index).match(/''/g) ?? []).length % 2 === 0 && !text.slice(text.lastIndexOf('\n', m.index) + 1, m.index).startsWith('='))
    if (hits.length === 1) {
      text = text.slice(0, hits[0].index) + `''${hits[0][0]}''` + text.slice(hits[0].index + hits[0][0].length)
      added++
    } else if (hits.length > 1) {
      skipped++
    }
  }
  report?.push(`creation: ${added} italic runs put back from the PDF; ${skipped} more occur more than once and were left`)
  return text
}

// runsTsv: page, size, B/I/BI (or nothing), baseline, text (\n written \\n), one run per line, from
// scripts/pdf-runs.swift. Returns the Markdown of everything from "2. What is the meaning of the Hebrew
// word Yôm?" on, with real footnotes ([^59] …). `wikitext` lends the places where its paragraphs began.
export function creationFromPdf (runsTsv, wikitext, report) {
  const unescape = (t) => t.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\')
  const runs = runsTsv.split('\n').map((l) => l.split('\t')).filter((p) => p.length >= 5)
    .map((p) => ({ page: Number(p[0]), size: Number(p[1]), kind: p[2], text: unescape(p.slice(4).join('\t')) }))

  // The wiki copy's paragraphs after the marker start where the report's did: a line that begins as one did starts a new one.
  const startsOf = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').split(/\s+/).slice(0, 5).join(' ')
  const wikiLines = wikitext.split('\n')
  const knownStarts = new Set(wikiLines.slice(wikiLines.findIndex((l) => /DRAFT BELOW/.test(l)))
    .map((l) => startsOf(l.replace(/'{2,}|^[•\s]+|&nbsp;|_/g, ''))).filter((s) => s.split(' ').length >= 4))

  const notes = new Map() // number → text
  const body = [] // { heading, text } or { text }
  let remaining = OUTLINE.slice(SPLIT)
  let started = false
  let lastNote = null
  let lastRef = 58 // the last note the wiki copy has

  const mark = (text, kind) => {
    if (!text.trim()) return text
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)
    const wrap = kind.includes('B') && kind.includes('I') ? '***' : kind.includes('B') ? '**' : kind.includes('I') ? '*' : ''
    return `${lead}${wrap}${core}${wrap}${trail}`
  }
  const add = (text) => {
    if (body.length === 0 || body[body.length - 1].heading) body.push({ text: '' })
    body[body.length - 1].text += text
  }

  for (const page of [...new Set(runs.map((r) => r.page))].filter((n) => n >= 31)) {
    let inNotes = false
    let current = null
    let pending = '' // a bold heading being collected
    const flushHeading = () => {
      // The bold lines are headings, one to a line, except that a heading may wrap: take the most
      // lines that say one heading of the outline.
      let lines = pending.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
      pending = ''
      while (lines.length > 0) {
        let n = lines.length
        let found = -1
        for (; n > 0 && found === -1; n--) {
          const want = key(lines.slice(0, n).join(' '))
          found = remaining.findIndex(([, h]) => key(h) === want)
        }
        if (found === -1) {
          if (started) {
            report?.push(`creation: a bold line that is not in the outline: "${lines[0]}"`)
            add(`\n**${lines[0]}**\n`)
          }
          lines = lines.slice(1)
          continue
        }
        n++
        if (started || found === 0) {
          started = true
          body.push({ heading: remaining[found][0], text: remaining[found][1] })
          remaining = remaining.slice(found + 1)
        }
        lines = lines.slice(n)
      }
    }
    const pageRuns = runs.filter((x) => x.page === page)
    for (let [i, r] of pageRuns.entries()) {
      const digits = /^\s*\d+\s*$/.test(r.text)
      const small = r.size <= 8.5
      if (small && digits) {
        const n = Number(r.text.trim())
        // A note's number is the next number, and its 10 pt text follows it (in the text the number is
        // 8 pt); other small numbers, in a note or not, are verse numbers.
        // (a note may open with a quotation mark or a large first letter before its 10 pt text)
        let next = i + 1
        while (pageRuns[next] && pageRuns[next].size !== 10 && pageRuns[next].text.trim().length <= 2) next++
        const followedByNote = pageRuns[next]?.size === 10
        if (followedByNote && (lastNote === null || n === lastNote + 1)) {
          inNotes = true
          current = lastNote = n
          notes.set(n, '')
        } else if ((r.size >= 7.75 || n === lastRef + 1) && started && !inNotes) {
          // a reference in the text: 8 pt, or the next number whatever its size
          flushHeading()
          lastRef = n
          add(`[^${n}]${r.text.endsWith('\n') ? '\n' : ''}`)
        } else if (inNotes && current !== null) {
          notes.set(current, `${notes.get(current)}<sup>${n}</sup>`)
        } else if (started) {
          add(`<sup>${n}</sup>`)
        }
      } else if (small) {
        // a raised ordinal: 28th
        if (pending) pending += r.text
        else if (inNotes && current !== null) notes.set(current, `${notes.get(current)}<sup>${r.text.trim()}</sup>`)
        else if (started) add(`<sup>${r.text.trim()}</sup>`)
      } else if (r.size === 10) {
        inNotes = true
        current ??= lastNote // a note continued from the page before
        if (current !== null) notes.set(current, (notes.get(current) ?? '') + mark(r.text.replace(/\n/g, ' '), r.kind))
      } else if (inNotes && current !== null && r.size > 10 && r.text.trim().length <= 2) {
        notes.set(current, notes.get(current) + r.text) // the quotation mark or large letter a note opens with
      } else if (!inNotes && r.size >= 11.5) {
        if (pending && !/[A-Za-z0-9]/.test(r.text)) {
          pending += r.text // a quotation mark between two bold runs
          continue
        }
        if (r.kind.includes('B')) {
          pending += r.text
          continue
        }
        flushHeading()
        if (!started) {
          // the part the wiki copy lacks starts in a lettered list, at "b."
          const at = r.text.indexOf('b. The six days are taken as sequential')
          if (at === -1) continue
          started = true
          r = { ...r, text: r.text.slice(at) }
        }
        // line numbers 1–36 down the margin, and the page number, are in the text
        add(mark(r.text.replace(/(?:^|\n)(?:\d{1,2}\n){4,}/g, '\n').replace(/\n23\d\d\s*$/, '\n'), r.kind))
      }
    }
    flushHeading()
  }
  if (remaining.length > 0) report?.push(`creation: headings not found in the PDF: ${remaining.map(([, h]) => h).join('; ')}`)

  // Lines to paragraphs: a line break inside a paragraph is a space; a paragraph ends at a short line,
  // before a bullet, or before a line that starts as a paragraph of the wiki copy did.
  const out = []
  for (const block of body) {
    if (block.heading) {
      out.push(`${'#'.repeat(block.heading)} ${block.text}`)
      continue
    }
    let paragraph = ''
    let previous = ''
    const flush = () => {
      if (paragraph) out.push(paragraph.replace(/\s+/g, ' ').trim())
      paragraph = ''
    }
    for (const line of block.text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      if (SUBHEADINGS.includes(line.replace(/[*_]/g, '').trim())) {
        flush()
        out.push(`#### ${line.replace(/[*_]/g, '').trim()}`)
        previous = ''
        continue
      }
      const bullet = /^[!•] /.test(line)
      const numbered = /^\d+\. [A-Z]/.test(line) && /[.:?”"]$/.test(previous)
      // a wiki paragraph start counts after a sentence's end that falls short of the margin (a full line may only be wrapping)
      const plainBefore = previous.replace(/\[\^\d+\]|<sup>.*?<\/sup>/g, '')
      const starts = knownStarts.has(startsOf(line.replace(/[*_]+/g, ''))) && /[.?!”")\]:]$/.test(plainBefore) && plainBefore.length < 80
      // (a line that opens with a note number follows a line that only broke for the number's run)
      const shortBefore = previous && !/^\[\^\d+\]/.test(line) && previous.replace(/\[\^\d+\]|<sup>.*?<\/sup>/g, '').length < 45 && /[.?!”"]$/.test(previous.replace(/\[\^\d+\]/g, ''))
      if (paragraph && (bullet || numbered || starts || shortBefore)) flush()
      paragraph += `${paragraph ? ' ' : ''}${bullet ? line.replace(/^[!•] /, '- ') : line}`
      previous = line
    }
    flush()
  }
  for (const [i, paragraph] of out.entries()) if (/^\d+$/.test(paragraph.replace(/[*_]/g, '').trim())) out[i] = '' // line and page numbers
  // the wiki copy has notes 1–58 (they begin on the pages before the heading this starts at)
  const defs = [...notes].filter(([n]) => n > 58).sort((a, b) => a[0] - b[0]).map(([n, text]) => `[^${n}]: ${text.replace(/\s+/g, ' ').trim()}`)
  report?.push(`creation: ${defs.length} footnotes and ${out.filter((l) => /^#/.test(l)).length} headings rebuilt from the PDF`)
  return `${out.filter(Boolean).join('\n\n')}\n\n${defs.join('\n\n')}\n`
}

// The committee at the end, which the PDF sets in two columns.
export const CREATION_ROSTER = [
  ['TE William S. Barker, II', 'RE Mark Belz'], ['TE C. John Collins', 'RE John Dishman'], ['TE J. Ligon Duncan, III', 'RE Samuel J. Duncan, Chairman'],
  ['TE Howard Griffith', 'RE Stuart Patterson'], ['TE W. Duncan Rankin', 'RE John B. White, Jr., Alternate'], ['TE Morton H. Smith', 'Advisor: Mark R. Wardell'], ['TE William H. Smith', '']
]
