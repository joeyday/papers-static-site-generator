#!/usr/bin/env node
// One-time migration of Joey's Papers from MediaWiki to a vault of Markdown files.
//
//   node scripts/convert-wiki.js <wikitext-dir> <images-dir> <vault-dir> [<seed-dir> [<sources-dir>]]
//
// <wikitext-dir> holds the latest wikitext of every page, as <Namespace>/<Title>.txt (Main/,
// Template/, Project/ …), pulled out of the MediaWiki dump (the `page`, `revision` and `text`
// tables). <images-dir> is the wiki's upload folder (cms/images). The vault is written fresh:
// pages, partial/, image/, and the three JSON maps (abbreviations.json, initials.json and
// alt-text.json, whose entries still need a human). What the converter could not do for itself
// is printed at the end. A <seed-dir> (another vault) lends its abbreviations.json and
// initials.json as a starting point. A <sources-dir> holds the committee reports' own sources, from which
// those two pages are rebuilt (scripts/reports.js): republication.html (https://www.opc.org/GA/republication.html)
// and creation-runs.tsv (scripts/pdf-runs.swift run on https://www.pcahistory.org/pca/digest/studies/creation/report.pdf).
//
// pandoc does the wikitext; this script prepares the text for it (the wiki's own conventions
// become Markdown ones) and tidies what comes out. It is a one-time tool, kept for the record.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import slugify from 'slugify'
import { BIBLE_BOOKS, bookInfoByCwms, cwmsByName, oneChapterCwms } from '../lib/bible/refs.js'
import { scanBibleRefs } from '../lib/bible/scan.js'
import { checkReference } from '../lib/bible/validate.js'
import { CREATION_ROSTER, creationBeginning, creationFromPdf, republication } from './reports.js'

const [wikiDir, imagesDir, vaultDir, seedDir, sourcesDir] = process.argv.slice(2)
if (!vaultDir) {
  console.error('Usage: node scripts/convert-wiki.js <wikitext-dir> <images-dir> <vault-dir>')
  process.exit(1)
}

const report = { unknownTemplates: new Set(), brokenLinks: [], noImage: [], longSlugs: [], scripture: [], escaped: [], skipped: [], abbr: {} }
const HOME = 'Home'
const SITE = 'Joey’s Papers'

// ─── Which pages, and what they are called ───
// The file name is the title with what Obsidian forbids taken out; `title:` is written only
// when that changed it.
const unscore = (s) => s.replace(/_/g, ' ')
const read = (ns, name) => fs.readFileSync(path.join(wikiDir, ns, name), 'utf-8')
const stripTags = (s) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')

const REDIRECT = /^\s*#REDIRECT\s*\[\[([^\]]+)\]\]/i
const pages = [] // { old, title, file, text }
const redirects = new Map() // lowercase old name → lowercase old name it leads to

for (const file of fs.readdirSync(path.join(wikiDir, 'Main')).sort()) {
  const old = unscore(file.replace(/\.txt$/, '').replace(/__/g, '/'))
  const text = read('Main', file)
  const redirect = REDIRECT.exec(text)
  if (redirect) {
    redirects.set(old.toLowerCase(), unscore(redirect[1].split('#')[0]).toLowerCase())
    continue
  }
  const display = /\{\{DISPLAYTITLE:([^}]*)\}\}/i.exec(text)?.[1]
  let title = stripTags(display ?? old).trim()
  // The wiki's WCF chapters are named by their template: the page title is the chapter's.
  const wcf = /^wcf ([ivxl]+)$/i.exec(old)
  if (wcf) title = stripTags(/\{\{wcf title\|([^}]*)\}\}/i.exec(text)?.[1] ?? title)
  pages.push({ old, title, text, wcf: wcf ? wcf[1].toUpperCase() : null })
}
fs.mkdirSync(vaultDir, { recursive: true })

const forbidden = /[\\/:*?"<>|#^[\]]/g
function fileName (page) {
  if (page.old.toLowerCase() === 'home') return HOME
  if (page.wcf) return `WCF ${page.wcf}`
  if (page.old.toLowerCase() === 'wcf') return 'Westminster Confession of Faith'
  return page.title.replace(/\//g, '-').replace(forbidden, '').replace(/\s+/g, ' ').trim()
}
for (const page of pages) page.file = fileName(page)

const byOld = new Map(pages.map((p) => [p.old.toLowerCase(), p]))
function resolve (target) {
  let key = unscore(target).trim().toLowerCase()
  for (let i = 0; i < 5 && redirects.has(key); i++) key = redirects.get(key)
  return byOld.get(key)
}

// ─── Wikitext, prepared for pandoc ───
// What pandoc can't know becomes a sentinel word (kept in `bits`) that comes back as the
// Markdown it stands for.
const bits = []
const bit = (markdown) => `ZZBIT${bits.push(markdown) - 1}ZZ`

const PARTIALS = {
  'by-joey-day': 'by Joey Day ![[avatar_prisma.jpg]] {.byline}',
  endmark: '&nbsp;<span class="endmark">![[avatar_prisma.jpg]]</span>',
  signature: '![[Signature.png|250]] {.signature}',
  'wcf nav': '<nav class="chapter-nav">\n\n[[WCF {{1}}|‹ Previous]] · [[WCF {{2}}|Next ›]]\n\n</nav>'
}

const INTERWIKI = { w: 'https://en.wikipedia.org/wiki/', wikipedia: 'https://en.wikipedia.org/wiki/', wikiquote: 'https://en.wikiquote.org/wiki/' }
const images = new Set()

const partialName = (page) => `wcf-${page.wcf.toLowerCase()}`

function prepare (page) {
  let t = page.text
  const flags = { about: false }

  t = t.replace(/__[A-Z]+__/g, '').replace(/\{\{DISPLAYTITLE:[^}]*\}\}\s*/gi, '').replace(/\{\{SITENAME\}\}/g, SITE)
  t = t.replace(/\{\{who-is-joey-day\}\}\s*/gi, () => { flags.about = true; return '' })

  // The notes list is written by the generator now.
  t = t.replace(/^==\s*Notes\s*==\s*\n<div class="ref-list"[^>]*>\s*<references\s*\/>\s*<\/div>\s*/gim, '')
  t = t.replace(/^==\s*Notes\s*==\s*\n<references\s*\/>\s*/gim, '').replace(/<references\s*\/>/g, '')

  // Subtitle, byline and dateline: paragraphs of their own, marked with an attribute.
  t = t.replace(/<(div|p)\s+(?:id|class)="(subtitle|byline)">([\s\S]*?)<\/\1>/g, (_, __, kind, body) =>
    `\n\n${body.replace(/<br\s*\/?>\s*/g, ' · ').trim()} ${bit(`{.${kind}}`)}\n\n`)
  t = t.replace(/<span (?:id|class)="dateline">([\s\S]*?)<\/span>/g, (_, body) => bit(`[${body}]{.dateline}`))

  // A paragraph with a class is a paragraph with an attribute.
  t = t.replace(/<p class="([\w -]+)">([\s\S]*?)<\/p>/g, (_, cls, body) => `${body.trim()} ${bit(cls.split(' ').map((c) => `.${c}`).join(' ').replace(/^/, '{') + '}')}`)
  t = t.replace(/<p style="[^"]*column-count: 2[^"]*">([\s\S]*?)<\/p>/g, (_, body) => `${body.trim()} ${bit('{.columns}')}`)
  t = t.replace(/<p id="([\w-]+)">/g, '<p>') // a stray id
  t = t.replace(/<span class="indent">([\s\S]*?)<\/span>/g, (_, body) => bit(`[${body}]{.indent}`))
  t = t.replace(/<span style="[^"]*smcp[^"]*">([\s\S]*?)<\/span>/g, (_, body) => bit(`[${body}]{.smcp}`))
  t = t.replace(/<span style="text-transform: none;?">([\s\S]*?)<\/span>/g, '$1')
  t = t.replace(/<div class="(bibliography|inline-bibliography)">\s*([\s\S]*?)\s*<\/div>/g, (_, cls, body) => `${bit(`::: {.${cls}}`)}\n\n${body}\n\n${bit(':::')}`)
  t = t.replace(/<div class="(?:ref-list|footnotes)"[^>]*>\s*([\s\S]*?)\s*<\/div>/g, '$1')

  // Abbreviations are the generator's business: the text is plain, and the expansions seen
  // here go to abbreviations.json.
  t = t.replace(/<abbr title="([^"]*)">([^<]*)<\/abbr>/g, (_, title, word) => {
    if (/^[A-Z]{2,}[A-Z0-9]*$/.test(word)) report.abbr[word] ??= title
    return word
  })
  t = t.replace(/<small>\s*<abbr>([^<]*)<\/abbr>\s*<\/small>/g, '$1').replace(/<abbr>([^<]*)<\/abbr>/g, '$1')
  t = t.replace(/<small>([A-Z][A-Z0-9&.-]*)<\/small>/g, '$1') // the generator wraps abbreviations itself
  t = t.replace(/<small>([\s\S]*?)<\/small>/g, (_, body) => bit('~') + body + bit('~'))
  t = t.replace(/<mark>([\s\S]*?)<\/mark>/g, (_, body) => bit('==') + body + bit('=='))

  // Pictures: [[File:name|options]]
  t = t.replace(/\[\[(?:File|Image):([^\]|]+)((?:\|[^\]]*)?)\]\]/gi, (_, name, rest) => {
    name = name.trim()
    images.add(name)
    const width = /\|(\d+)px/.exec(rest)?.[1]
    return bit(`![[${name}${width ? `|${width}` : ''}]]`)
  })

  t = t.replace(/\[\[Bash_\(Unix_shell\)\|/g, '[[w:Bash_(Unix_shell)|') // a Wikipedia link written without its prefix
  // Links out: the wiki's ESV prefix is a Scripture reference, which the generator links itself;
  // its LDS prefix is a Book of Mormon verse; and there are other wikis and Category tags.
  t = t.replace(/\[\[esv:[^|\]]*\|([^\]]*)\]\]/gi, (_, label) => label.replace(/&nbsp;/g, ' '))
  t = t.replace(/\[\[esv:([^\]|]*)\]\]/gi, (_, ref) => ref.replace(/[+_]/g, ' '))
  t = t.replace(/\[\[lds:([\w]+)\/(\d+)\/(\d+)[^\]|]*\|([^\]]*)\]\]/gi, (_, book, chapter, verse, text) =>
    `[${text}](https://www.churchofjesuschrist.org/study/scriptures/bofm/${book.replace(/_/g, '-')}/${chapter}?lang=eng&id=p${verse}#p${verse})`)
  t = t.replace(/\[\[Category:[^\]]*\]\]\s*/gi, '')
  t = t.replace(/\[\[(w|wikipedia|wikiquote):([^\]|]+)(?:\|([^\]]*))?\]\]/gi, (_, wiki, target, text) =>
    `[${text ?? target}](${INTERWIKI[wiki.toLowerCase()]}${encodeURI(target.trim().replace(/ /g, '_'))})`)

  // Templates. The ones with a Markdown equivalent are kept as partial calls; the rest are reported.
  // The Confession's chapters are partials, included by their own page and by the whole Confession.
  t = t.replace(/\{\{:([^}]+)\}\}/g, (_, name) => {
    const chapter = resolve(name)
    return `\n\n== ${chapter.title} ==\n\n${bit(`{{${partialName(chapter)}}}`)}\n\n`
  })
  t = t.replace(/\{\{([^}|]+)((?:\|[^}]*)?)\}\}/g, (all, name, args) => {
    const key = name.trim().toLowerCase()
    if (key === 'wcf notes') {
      page.nav = args
      return ''
    }
    if (key === 'wcf title') return ''
    if (key === 'by-joey-day' || key === 'signature') return `\n\n${bit(`{{${key}}}`)}\n\n`
    if (key in PARTIALS) return bit(`{{${key}${args}}}`)
    report.unknownTemplates.add(`${page.old}: ${all}`)
    return ''
  })
  return { text: t, flags }
}

// ─── Guesses ───
// Joey asked for guesses at what the build needs, to get the site building: every one is to be
// reviewed before a release (docs/plan.md). Abbreviations that are really abbreviations:
const GUESSED_ABBREVIATIONS = {
  'A.B.': 'Artium Baccalaureus (Bachelor of Arts)',
  'B.C.': 'Before Christ',
  'B.C.E.': 'Before the Common Era',
  'D.C.': 'District of Columbia',
  'H.G.': 'Holy Ghost',
  'J.B.O.': 'a Masonic cipher (expansion unknown)',
  'J.C.': 'Jesus Christ',
  'N.J.': 'New Jersey',
  'N.Y.': 'New York',
  AIM: 'AOL Instant Messenger',
  API: 'Application Programming Interface',
  APA: 'American Psychological Association',
  AWOL: 'Absent Without Leave',
  BASOR: 'Bulletin of the American Schools of Oriental Research',
  BOM: 'Book of Mormon',
  BYU: 'Brigham Young University',
  CEA: 'Consumer Electronics Association',
  CG: 'Computer Graphics',
  CPART: 'Center for the Preservation of Ancient Religious Texts',
  CSC: 'Creation Study Committee',
  CSS3: 'Cascading Style Sheets, Level 3',
  DB2: 'IBM Db2',
  DIRECTV: 'DIRECTV',
  DLL: 'Dynamic-Link Library',
  DNA: 'Deoxyribonucleic Acid',
  DOS: 'Disk Operating System',
  DSS: 'Dead Sea Scrolls',
  FAIR: 'Faithful Answers, Informed Response',
  FARMS: 'Foundation for Ancient Research and Mormon Studies',
  FTP: 'File Transfer Protocol',
  HD: 'High Definition',
  HSM: 'Harvard Semitic Monographs',
  HTR: 'Harvard Theological Review',
  ICBI: 'International Council on Biblical Inerrancy',
  ICU: 'Intensive Care Unit',
  IDE: 'Integrated Development Environment',
  IRT: 'Issues in Religion and Theology',
  ISO: 'International Organization for Standardization',
  IVP: 'InterVarsity Press',
  JAOS: 'Journal of the American Oriental Society',
  JETS: 'Journal of the Evangelical Theological Society',
  JSJ: 'Journal for the Study of Judaism',
  JSP: 'Journal for the Study of the Pseudepigrapha',
  JST: 'Joseph Smith Translation',
  JTS: 'Journal of Theological Studies',
  LAT1: 'L-type Amino Acid Transporter 1',
  LC: 'Larger Catechism',
  LCC: 'Library of Christian Classics',
  LDSFAQ: 'Latter-day Saint Frequently Asked Questions',
  LED: 'Light-Emitting Diode',
  MHRA: 'Modern Humanities Research Association',
  MLA: 'Modern Language Association',
  MPWA: 'Minutes of the Presbyterian Church in America',
  MSN: 'Microsoft Network',
  MTC: 'Missionary Training Center',
  NABT: 'National Association of Biology Teachers',
  NET: 'New English Translation',
  NICU: 'Neonatal Intensive Care Unit',
  NSTA: 'National Science Teachers Association',
  NTS: 'New Testament Studies',
  OPC: 'Orthodox Presbyterian Church',
  OS: 'Operating System',
  OTP: 'The Old Testament Pseudepigrapha',
  PC: 'Personal Computer',
  PCUS: 'Presbyterian Church in the United States',
  PIM: 'Personal Information Manager',
  PNW: 'Pacific Northwest',
  QWERTY: 'QWERTY keyboard layout',
  RE: 'Ruling Elder',
  RLDS: 'Reorganized Church of Jesus Christ of Latter Day Saints',
  ROM: 'Read-Only Memory',
  RPCES: 'Reformed Presbyterian Church, Evangelical Synod',
  RV: 'Recreational Vehicle',
  SBL: 'Society of Biblical Literature',
  SBLDS: 'Society of Biblical Literature Dissertation Series',
  SQL: 'Structured Query Language',
  SSAR: 'Society for the Study of Alternative Religions',
  SSH: 'Secure Shell',
  TE: 'Teaching Elder',
  TLNF: 'The Law of Nature and the Federal Covenants (guess)',
  TTY: 'Teletype',
  UCLA: 'University of California, Los Angeles',
  UI: 'User Interface',
  UNIX: 'Unix',
  UNO: 'Uno (card game)',
  US: 'United States',
  UX: 'User Experience',
  VLC: 'VideoLAN Client',
  WELS: 'Wisconsin Evangelical Lutheran Synod',
  WMV: 'Windows Media Video',
  WTJ: 'Westminster Theological Journal',
  XMPP: 'Extensible Messaging and Presence Protocol',
  ZTK: 'Zeitschrift für Theologie und Kirche',
  FINIS: 'The end'
}
const GUESSED_INITIALS = {
  'C.S. Lewis': 'Clive Staples Lewis',
  'G.T. Shedd': 'William Greenough Thayer Shedd',
  'J.R.R. Tolkien': 'John Ronald Reuel Tolkien',
  'F.E. Robbins': 'Frank Egleston Robbins',
  'T.G. Madsen': 'Truman Grant Madsen',
  'T.D. Jakes': 'Thomas Dexter Jakes',
  'J.V. Fesko': 'John V. Fesko',
  'G.J. Wenham': 'Gordon John Wenham',
  'R.E. Longacre': 'Robert E. Longacre',
  'A.F. Mitchell': 'Alexander F. Mitchell',
  'J.V. Estelle': 'John V. Fesko (Estelle’s co-author)'
}
// All-caps words that are only text (headings set in capitals, names, a Masonic phrase), or
// codes with no expansion: each is opted out with a "!" where it stands.
const PROSE_CAPS = new Set(`ACCOUNT ADULT ALSO AMET AMONG AN AND ARE ASSEMBLY AT AUTHORITY BAPTISM BAPTISMAL BE BEFORE BELOW BOOK BY CHRISTIAN COVENANT COWDERY DAVID DIVINE DR DRAFT EIGHT
  ESSENTIAL FOR FORMULA FROM FS200 GE GENERAL GENTILE GLOSSARY HAND HARRIS HIRAM HYRUM IMMERSION INFANT INSTITUTED IS IT JACOB JEWS JOHN JOSEPH JR KB0010089 LOREM MARTIN MODE
  MORMON MOTE NEPHI OF OLIVER ONLY PAGE PETER PFI1 PLATES PROPER PROPOSAL QS RECOMMENDATIONS REFORMATION REPORTING SAMUEL SINAI SINCE SIT SMITH SO SR SYMBOLISM TAKEN TESTIMONY THE
  THING THREE TL TO UPON WAS WHAT WHITMER WITH WITNESSES WORLD WRITTEN`.split(/\s+/))
const URLISH = /(https?:\/\/[^\s)>\]]+|\]\([^)]*\)|\[\[[^\]]*\]\]|\{[^}]*\})/

function optOutCaps (line) {
  return line.split(URLISH).map((piece, i) => i % 2 === 1 ? piece : piece.replace(/(?<![\w!</])([A-Z]{2,}[A-Z0-9]*)(?!\w)/g, (w) => PROSE_CAPS.has(w) ? `!${w}` : w)).join('')
}

// ─── Markdown, tidied ───
// Scripture: every named reference gets its book's standard abbreviation, as the generator
// writes them (Jn, 1Co); nothing is merged or reordered, since the order of a list of proof
// texts is the author's. The spellings the scanner doesn't know are read here too.
const LOOSE = {
  Ge: ['Gen', 'Gn'],
  Ex: ['Exod', 'Exo'],
  Lev: ['Lv', 'Levit'],
  Nu: ['Num', 'Nm', 'Numb'],
  Dt: ['Deut', 'Deu'],
  Jos: ['Josh'],
  Jdg: ['Judg'],
  Ru: ['Rth'],
  '1Sa': ['1Sam'],
  '2Sa': ['2Sam'],
  '1Ki': ['1Kgs'],
  '2Ki': ['2Kgs'],
  '1Ch': ['1Chr'],
  '2Ch': ['2Chr'],
  Ne: ['Neh'],
  Est: ['Esth'],
  Ps: ['Pss', 'Psa'],
  Pr: ['Prov', 'Prv'],
  Ecc: ['Eccl'],
  SS: ['Song', 'SOS'],
  Jer: ['Jr'],
  La: ['Lam'],
  Eze: ['Ezek'],
  Da: ['Dan'],
  Ob: ['Obad'],
  Jnh: ['Jon'],
  Mic: ['Mc'],
  Na: ['Nah'],
  Hab: ['Hb'],
  Zep: ['Zeph'],
  Hag: ['Hg'],
  Zec: ['Zech'],
  Mal: ['Ml'],
  Mt: ['Matt'],
  Mk: ['Mrk'],
  Lk: ['Luk'],
  Jn: ['Joh'],
  Ac: ['Act'],
  Ro: ['Rom', 'Rm'],
  '1Co': ['1Cor'],
  '2Co': ['2Cor'],
  Gal: ['Ga'],
  Php: ['Phil'],
  '1Th': ['1Thess'],
  '2Th': ['2Thess'],
  '1Ti': ['1Tim'],
  '2Ti': ['2Tim'],
  Phm: ['Philem'],
  Jas: ['Jm'],
  '1Pe': ['1Pet'],
  '2Pe': ['2Pet'],
  '1Jn': ['1Joh'],
  '2Jn': ['2Joh'],
  '3Jn': ['3Joh'],
  Rev: ['Rv']
}
const stripped = (name) => name.replace(/\s+/g, '')
const cwmsByLooseName = new Map()
for (const names of BIBLE_BOOKS) for (const name of names) cwmsByLooseName.set(stripped(name), names[names.length - 1])
for (const [cwms, names] of Object.entries(LOOSE)) for (const name of names) cwmsByLooseName.set(name, cwms)
const NAME_BEFORE_NUMBER = /(?<![\w.])([123]\s?)?([A-Z][a-z]+(?:\s+of\s+[A-Z][a-z]+)?)(\.?)(?=\s*\d)/g

const scan = (line) => scanBibleRefs(line, { lastCwms: null, lastChapter: null, chapterLevel: false, translation: 'ESV' })

function normalizeScripture (line, where) {
  // a name the scanner doesn't know becomes the standard abbreviation
  line = line.replace(NAME_BEFORE_NUMBER, (all, number = '', word, period) => {
    const cwms = cwmsByLooseName.get(number.trim() + stripped(word))
    return cwms && (period || !cwmsByName.has((number + word).toLowerCase().replace(/\s+/g, ' '))) ? cwms : all
  })
  // every named reference gets its book's abbreviation
  for (const item of scan(line).filter((i) => i.named && !i.optOut).reverse()) {
    const written = line.slice(item.start, item.end)
    const name = /^(\d?\s*[A-Za-z][A-Za-z ]*?)(?=\s*\d)/.exec(written)?.[1]
    const abbr = name && bookInfoByCwms.get(item.cwms).bookCwms
    if (!name || name === abbr) continue
    line = line.slice(0, item.start) + abbr + line.slice(item.start + name.length)
    report.scripture.push(`${where}: ${name} → ${abbr}`)
  }
  // in a book of one chapter a lone number is a verse ("Jude 25" is "Jude 1:25")
  for (const item of scan(line).filter((i) => i.named && !i.optOut && oneChapterCwms.has(i.cwms) && i.verseStart === undefined && i.chapter !== '1').reverse()) {
    const written = line.slice(item.start, item.end)
    const at = item.start + /^!?\d?\s*[A-Za-z ]+?\s*/.exec(written)[0].length
    line = line.slice(0, at) + '1:' + line.slice(at)
  }
  // a reference that can't exist is opted out, with the chain of references it belongs to
  const escapes = new Set()
  let head = null
  for (const item of scan(line)) {
    if (item.optOut) continue
    if (item.named) head = item
    if (checkReference(item) && head) escapes.add(head.start)
  }
  for (const at of [...escapes].sort((a, b) => b - a)) {
    report.escaped.push(`${where}: ${line.slice(at, at + 30)}`)
    line = line.slice(0, at) + '!' + line.slice(at)
  }
  return line
}

function convert (page) {
  const { text, flags } = prepare(page)
  let md = page.markdown ?? execFileSync('pandoc', ['-f', 'mediawiki', '-t', 'markdown-smart+wikilinks_title_after_pipe-raw_attribute-header_attributes', '--wrap=none'], { input: text, encoding: 'utf-8', maxBuffer: 1 << 28 })
  if (page.append) md += `\n\n${page.append}`
  md = md.replace(/ZZBIT(\d+)ZZ/g, (_, i) => bits[i])

  // pandoc's leftovers
  md = md.replace(/!\[\]\(([^)]*?)\s+"[^"]*"\)(\{[^}]*\})?/g, '![[$1]]') // an image pandoc found for itself
  md = md.replace(/\\(["'.])/g, '$1')
  md = md.replace(/\n{3,}/g, '\n\n')

  // Links: [[old name|text]] to the new file name, and [text](old-name "wikilink")
  md = md.replace(/\[\[([^\]|#]+)(#[^\]|]*)?(\|[^\]]*)?\]\]/g, (all, target, frag = '', text = '') => {
    if (/\.\w{2,4}$/.test(target)) return all // an image
    if (/^WCF [IVXL]+$/.test(target)) return all // the navigation's own links
    const found = resolve(target)
    if (!found) {
      report.brokenLinks.push(`${page.old}: [[${target}]]`)
      return all
    }
    return `[[${found.file}${frag}${text || (found.file === target ? '' : `|${target.trim()}`)}]]`
  })
  md = md.replace(/\[([^\]]+)\]\(([^)\s]+) "wikilink"\)/g, (all, text, target) => {
    const found = resolve(target)
    if (!found) {
      report.brokenLinks.push(`${page.old}: [${text}](${target})`)
      return all
    }
    return `[[${found.file}|${text}]]`
  })

  md = md.split('\n').map((line) => (line.startsWith('```') ? line : optOutCaps(normalizeScripture(line, page.old)))).join('\n')
  return { md: md.trim() + '\n', flags }
}

// ─── Writing the vault ───
const yamlString = (s) => (/^[\w][\w ,.'’()&-]*$/.test(s) && !/^(true|false|null|yes|no|\d+)$/i.test(s) && !s.includes(': ') ? s : JSON.stringify(s))
const slugOf = (s) => slugify(s, { lower: true, strict: true })

// The two committee reports are rebuilt from their sources, when there are any.
const source = (name) => (sourcesDir && fs.existsSync(path.join(sourcesDir, name)) ? fs.readFileSync(path.join(sourcesDir, name), 'utf-8') : null)
const reportNotes = []
const republicationHtml = source('republication.html')
const creationRuns = source('creation-runs.tsv')
for (const page of pages) {
  if (page.old === 'republication' && republicationHtml) page.markdown = republication(republicationHtml)
  if (page.old === 'creation' && creationRuns) {
    const italics = creationRuns.split('\n').map((l) => l.split('\t')).filter((p) => p.length >= 5 && p[2] === 'I' && Number(p[0]) < 33).map((p) => p[4].replace(/\\n/g, ' '))
    const original = page.text
    page.text = creationBeginning(original, italics, reportNotes)
    const roster = `<table>${CREATION_ROSTER.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`
    page.append = creationFromPdf(creationRuns, original, reportNotes)
      .replace(/^Advisory Committee on Creation TE .*$/m, `## Advisory Committee on Creation\n\n${roster}`)
  }
}

for (const page of pages) {
  const { md, flags } = convert(page)
  const front = []
  if (page.title !== page.file) front.push(`title: ${yamlString(page.title)}`)
  // A title long enough to make an unwieldy address keeps the short one the wiki had.
  if (slugOf(page.file).length > 50 && page.file !== HOME) {
    const slug = slugOf(page.old)
    front.push(`slug: ${slug}`)
    report.longSlugs.push(`${page.file} → ${slug}`)
  }
  if (flags.about) front.push('about: true')
  let body = md
  if (page.wcf) {
    // The chapter's text is a partial (its footnotes labelled for the chapter, so a page that
    // includes several keeps them apart); the page includes it between a subtitle and the nav.
    fs.mkdirSync(path.join(vaultDir, 'partial'), { recursive: true })
    const label = page.wcf.toLowerCase()
    fs.writeFileSync(path.join(vaultDir, 'partial', `${partialName(page)}.md`), md.replace(/\[\^([^\]\s]+)\]/g, `[^${label}-$1]`))
    body = `Westminster Confession of Faith, 1647 {.subtitle}\n\n{{${partialName(page)}}}\n\n{{wcf nav${page.nav}}}\n`
  }
  const out = front.length > 0 ? `---\n${front.join('\n')}\n---\n${body}` : body
  fs.writeFileSync(path.join(vaultDir, `${page.file}.md`), out)
}

// the error page
if (fs.existsSync(path.join(wikiDir, 'Project', 'Error_404.txt'))) {
  const body = read('Project', 'Error_404.txt').replace(/__[A-Z]+__/g, '').replace(/\{\{SITENAME\}\}/g, SITE).trim()
  fs.writeFileSync(path.join(vaultDir, '404.md'), `---\ntitle: Page not found\n---\n${body}\n`)
}

fs.mkdirSync(path.join(vaultDir, 'partial'), { recursive: true })
for (const [name, text] of Object.entries(PARTIALS)) fs.writeFileSync(path.join(vaultDir, 'partial', `${name}.md`), text + '\n')

// Pictures: the wiki keeps each in a folder named for the start of its file name's hash.
fs.mkdirSync(path.join(vaultDir, 'image'), { recursive: true })
const altText = {}
for (const name of [...images, 'avatar_prisma.jpg', 'Signature.png']) {
  const file = name
  const found = fs.readdirSync(imagesDir, { recursive: true }).find((f) => path.basename(f) === file && !/^(thumb|archive|deleted|temp)[/]/.test(f))
  if (!found) {
    report.noImage.push(name)
    continue
  }
  fs.copyFileSync(path.join(imagesDir, found), path.join(vaultDir, 'image', name))
  altText[name] = path.basename(name, path.extname(name)).replace(/[-_]+/g, ' ')
}

fs.writeFileSync(path.join(vaultDir, 'alt-text.json'), JSON.stringify(altText, null, 2) + '\n')
const seed = (name) => (seedDir ? JSON.parse(fs.readFileSync(path.join(seedDir, name), 'utf-8')) : {})
fs.writeFileSync(path.join(vaultDir, 'abbreviations.json'), JSON.stringify({ ...seed('abbreviations.json'), ...GUESSED_ABBREVIATIONS, ...report.abbr }, null, 2) + '\n')
fs.writeFileSync(path.join(vaultDir, 'initials.json'), JSON.stringify({ ...seed('initials.json'), ...GUESSED_INITIALS }, null, 2) + '\n')

console.log(`${pages.length} pages written to ${vaultDir}; ${redirects.size} redirects folded into links.`)
for (const [heading, list] of [
  ['Templates with no equivalent (dropped)', [...report.unknownTemplates]],
  ['Links to no page', report.brokenLinks],
  ['Pictures not found', report.noImage],
  ['Long titles given their old short slug', report.longSlugs],
  ['The committee reports, rebuilt from their sources', reportNotes],
  ['References that can’t exist, opted out with !', report.escaped],
  ['Scripture names rewritten (the kinds)', [...new Set(report.scripture.map((r) => r.replace(/^.*?: /, '')))]]
]) {
  if (list.length === 0) continue
  console.log(`\n${heading} (${list.length}):`)
  for (const item of list.slice(0, 40)) console.log(`  ${item}`)
  if (list.length > 40) console.log(`  … and ${list.length - 40} more`)
}
