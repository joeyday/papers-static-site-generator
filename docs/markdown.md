# Joey's Papers Markdown

A description of the flavor of Markdown used for Joey's Papers: CommonMark plus a few extensions, wikilinks, partials, and some writing conventions for Scripture references, abbreviations and initials. It describes the syntax and what it means, not any particular program that reads it.

## Contents

1. [Documents and frontmatter](#documents-and-frontmatter)
2. [Title, subtitle and byline](#title-subtitle-and-byline)
3. [Standard Markdown](#standard-markdown)
4. [Extensions](#extensions)
5. [Attributes, spans and divs](#attributes-spans-and-divs)
6. [Wikilinks and images](#wikilinks-and-images)
7. [Partials](#partials)
8. [Comments and templating](#comments-and-templating)
9. [Scripture references](#scripture-references)
10. [Abbreviations, initials and other conventions](#abbreviations-initials-and-other-conventions)

## Documents and frontmatter

A document is a Markdown file. Its **name** is the filename without `.md`, and that is its title unless frontmatter says otherwise. Filenames can't contain colons, so a title with a colon goes in frontmatter.

Frontmatter is optional YAML between `---` lines at the very top of the file. Keys are lowercase, and these are the only keys; any other is an error, so a misspelt key is never silently ignored.

| Key | Type | Meaning |
|---|---|---|
| `title` | text | The title, if different from the filename. |
| `slug` | text | The address of the page, used exactly as written (`Christian_Baptism`, `cog11.5`). Without it, the address is the slugified filename (`My Page` → `my-page`). Allowed characters: letters, digits and `. _ - ~ * ! $ ( ) + , ; : @ =`. |
| `aliases` | list of text | Other names the page used to go by. Same character rules as `slug`. |
| `subtitle` | text | A line under the title. Markdown works in it (italics, links, footnotes, references). |
| `byline` | text | A line under the subtitle: an author, a date, a source (`by Joey Day`). Markdown works in it, images too. |
| `description` | text | A one-sentence summary. Without it, the first paragraph with text serves, trimmed to about 160 characters. |
| `hidden` | true/false | The page is not published, and nothing may link to it. |
| `about` | true/false | Add the "Who is Joey Day?" box at the bottom. |

Special names: `Home` is the root page and `404` is the not-found page. Slugs must be unique.

Two folders hold material that is not a page: `partial/` (see [Partials](#partials)) and `image/` (see [Images](#images)).

## Title, subtitle and byline

The title is never written in the body; it comes from the filename or frontmatter. Body headings therefore start at `##`.

A document may have a subtitle and a byline, both set in frontmatter:

```markdown
---
subtitle: A Short Defence
byline: by Joey Day
---
The text begins here.
```

Both belong to the header, under the title, subtitle first. Each runs through the same rules as the body, so it may hold emphasis, wikilinks, footnotes, references and images.

## Standard Markdown

CommonMark, with these on:

- Headings, paragraphs, `*emphasis*`, `**strong**`, blockquotes, ordered and unordered lists, horizontal rules, links, code spans and fenced code blocks.
- **Pipe tables.**
- **Strikethrough**, `~~text~~`.
- **Raw HTML**, for the occasional thing Markdown can't say.
- **Bare web addresses** are links.
- **Smart typography:** straight quotes become curly, `--` and `---` become dashes, `...` an ellipsis, `(c)` ©.

Every `##` and `###` heading gets an id from its text (`## The Law` is `#the-law`; a repeat becomes `#the-law-2`). A heading may set its own: `## The Law {#law}`.

## Extensions

| Syntax | Meaning |
|---|---|
| `~small text~` | Small text. Single tildes, paired like emphasis; it never crosses a block, and a lone `~` (as in "~100 arguments") is just a tilde. |
| `==highlight==` | Highlighted (marked) text. |
| `Term` newline `: Definition` | A definition list. |
| `[^1]` and `[^1]: Note` | A footnote. The "Notes" heading at the end is supplied; don't write one. |
| `[text]{.class}` | A span with a class. |
| `text {.class #id key=value}` | Attributes on a block or inline element. |
| `::: … :::` | A div. |

Definition lists:

```markdown
Justification
: God's declaring a sinner righteous.
: Also called *forensic* righteousness.
```

Footnote labels share one namespace across a page and every partial it includes. A partial with footnotes should namespace its labels (`[^ii-1]`) so two partials can't collide.

## Attributes, spans and divs

**Attributes** go in braces. At the end of a block they apply to that block; right after inline markup they apply to it. Braces take `.class`, `#id` and `key=value`:

```markdown
A paragraph with no first-line indent. {.no-indent}

## A heading with an id {#my-id}

An *emphasised phrase*{.smcp} in small capitals.
```

**Spans.** `[text]{.class}` wraps text in a span with that class: `the [Lord's Supper]{.smcp}`.

**Divs.** Open and close with `:::`:

```markdown
::: {.callout-right}
A pull quote, floated to the right.
:::

::: notice
A bare word after the colons is the class name.
:::

:::
No attributes at all is a plain callout.
:::
```

Inside the braces: `.class`, `#id`, `key="value"`.

### Conventional classes

These are the class names the site gives a meaning to:

| Class | On | Meaning |
|---|---|---|
| `no-indent` | paragraph, blockquote | No first-line indent. |
| `outdent` | paragraph, blockquote | Hanging indent (bibliography entries). |
| `line-group` | paragraph, blockquote | Verse or an address: ragged right, hanging runs, no hyphenation. A `[ ]{.indent}` span inside pulls a line back out. |
| `callout`, `callout-center` | div | A centred pull quote. A bare `:::` is a `callout`. |
| `callout-left`, `callout-right` | div | A pull quote beside the text. |
| `notice` | div | A boxed note, in smaller type (a disclaimer). |
| `columns` | div or list | Two columns. |
| `bibliography`, `inline-bibliography` | div | Hanging-indent entries; `bibliography` is also two columns. |
| `smcp` | span | Small capitals. |
| `dateline` | block | Display type, uppercase. |
| `signature` | container | Its images are signature-sized. |
| `endmark` | container | A small round author image at the end. |
| `chapter-nav` | div | Centred previous/next links at the foot of a chapter. |

## Wikilinks and images

### Page links

| Written | Links to |
|---|---|
| `[[Page]]` | The page, shown as `Page`. |
| `[[Page\|shown text]]` | The page, with your text. |
| `[[Page#Heading]]` | A heading in that page. |
| `[[#Heading]]` | A heading in this page. |

The target is a filename (case-insensitive) or a slug. A link to no page is an error. The heading part is the slugified heading text and is not checked against the target. Ordinary `[text](url)` links also work.

### Images

Pictures live in `image/`, in any subfolder, and are addressed by filename alone, so **every image filename is unique** (case-insensitive).

| Written | Meaning |
|---|---|
| `![[pic.jpg]]` | The image. Alone on its line it is a centred figure; within a line of text it is inline. |
| `![[pic.jpg\|300]]` | 300 px wide. |
| `![[pic.jpg\|300x200]]` | Width and height. |
| `[[pic.jpg]]`, `[[pic.jpg\|text]]` | A link *to* the image rather than showing it. |

Alt text is not written in the document. Each image's alt text is looked up by filename in `alt-text.json`, and every image needs one.

## Partials

A partial is a Markdown file in `partial/`, called by filename (case-insensitive, no path):

```markdown
{{wcf-i}}
{{some-partial|first argument|second argument}}
```

Inside a partial, `{{1}}`, `{{2}}`… are the arguments; `{{$args}}` is all of them joined with `, `; `{{$n}}` is how many were given. A placeholder with no argument is empty. Arguments are separated by `|`, but a `|` inside a `[[wikilink|text]]` doesn't count, so a link can be passed as an argument.

Partials may call partials; a loop or an unknown name is an error. Code in a partial is literal. After a definition marker (`: {{partial}}`) the expansion's later lines stay inside the definition.

**Partials are the only way to share text between pages.** There is no page transclusion: `![[Page]]` is not supported.

## Comments and templating

`%% … %%` is a comment. It may span lines and disappears before anything else reads the page, so a commented-out link or partial does nothing.

Fenced code and code spans are never touched by partials, comments, wikilinks or templating. Indented code blocks (four spaces) aren't protected; use fences.

EJS is allowed in pages and partials but is unused. `<% code %>` runs and `<%= value %>` prints, with `page` (`name`, `title`, `slug` of the page being written) and `frontmatter` in scope. It is evaluated before wikilinks, so a link in a branch not taken is never looked up.

## Scripture references

A reference written as plain text is a link to that passage (in the ESV unless another translation follows). The grammar:

A book name or abbreviation, then a chapter, then an optional verse or range. Case matters, so "I am 30 years old" is not Amos 30.

| Written | Meaning |
|---|---|
| `Jn 3:16` | John 3:16 |
| `Jn 3:16-18`, `Jn 3:16–18` | A verse range (hyphen, en dash or em dash) |
| `Ro 1:1–2:5` | A range across chapters |
| `Ro 1–2` | Chapters 1 and 2 |
| `Ro 8` | The whole chapter |
| `Genesis 1:1`, `Psalm 23` | Full names also work |

### Book names

Standard abbreviations: `Ge Ex Lev Nu Dt Jos Jdg Ru 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Ne Est Job Ps Pr Ecc SS Isa Jer La Eze Da Hos Joel Am Ob Jnh Mic Na Hab Zep Hag Zec Mal Mt Mk Lk Jn Ac Ro 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe 2Pe 1Jn 2Jn 3Jn Jude Rev`. Full names (`1 Corinthians`, `Song of Songs`, `Psalm`) are accepted too.

- **Numbered books are abbreviated with no space:** `1Co`, `2Ti`, `1Jn`. `1 Co` is not a reference. Full names have the space: `1 Corinthians`.
- **Abbreviate, except** a lone reference in prose that spells its book out (`Genesis 1:1`) may stay spelled out. In lists and everything else, use the abbreviation.
- A Roman numeral before a book is Arabic: `2 Kings`, not `II Kings`.
- No space after the colon: `Mt 21:25`.

### Continuations

A bare number after `;` or `,` continues the reference before it:

| Written | Meaning |
|---|---|
| `Jn 3:16; 5:24` | Jn 3:16 and Jn 5:24 |
| `Jn 3:16, 18` | Jn 3:16 and 3:18: after a **comma** a bare number is a **verse** |
| `Heb 4:2; 11` | Heb 4:2 and all of Heb 11: after a **semicolon** it is a **chapter** |
| `Jn 3:16; 1Co 1:21` | A new book starts a new reference |

A chain must be unbroken: only whitespace may separate one reference from the next separator, so a year or page number later in the sentence isn't mistaken for a verse. A chain ends at the end of a paragraph, list item, table cell or the like, and at the end of an italic title, so `*Title*, 12:293` is a page, not a verse.

### Translations

A translation abbreviation right after a reference, or after its whole chain, applies to all of it: `Jn 3:16; 5:24 KJV`. Recognised: ESV, KJV, NASB, NIV, NKJV, NLT, NRSV. The default is ESV.

### Books of one chapter

Obadiah, Philemon, 2 John, 3 John and Jude have one chapter. Write a verse with its chapter, `Jude 1:7`, which reads as `Jude 7`. A bare `Jude 7` means chapter 7, which doesn't exist. In a chain, `1:5` after such a book likewise reads as `5`.

### Opting out

A reference must be one that could exist: a chapter or verse its book lacks (`Ro 12:71`) is an error. Put a `!` in front of anything that only looks like a reference: `!Ps 9:1` is plain text. An opted-out reference also ends any chain, so the number after it isn't read as continuing an earlier reference.

References inside links, headings and code are not treated as references.

## Abbreviations, initials and other conventions

These are conventions about how text is written, each backed by a list kept with the content.

**Abbreviations.** Every all-caps word of two or more letters (`NASA`, `UBS5`, `KJV`) must be explained: listed with its expansion in `abbreviations.json` (it then carries its expansion as a tooltip and is set in small capitals), or be a Roman numeral, or a divine name. A word that is none of these but should stand as written takes a `!`: `!NASA`. The `!` is dropped from the text. Words in an `abbreviations.json` are matched case-sensitively, as whole words, longest first (`e.g.`, `cf.`, `JS–H`).

**Initials.** Two or more initials (`R.C.`, `J.R.R.`) must be listed in `initials.json` along with the surname, as `"R.C. Sproul"`. Both `R.C. Sproul` and `Sproul, R.C.` find that entry. Initials with no surname beside them are an error. A single initial or title (`Dr.`) is left alone.

**Roman numerals.** Valid Roman numerals of two or more letters (`XIV`, `III`) are set in small capitals, and so is a dotted pair (`X.III`). A single `I`, `V` or `X` is not. A `!` in front (`!XIV`, `!X.III`) opts a numeral out: it stays plain and the `!` is dropped.

**Divine names.** `LORD`, `GOD`, `YHWH`, `I AM` (and `I AM THAT I AM`, `I AM WHAT I AM`, `I AM WHO I AM`) and `I WILL BE` (with the same three extensions) are set in small capitals with a full-size first letter. Write them in capitals in the source.

**Ellipses.** A spaced ellipsis (`. . .`) is kept together on one line.

**Left alone.** None of these conventions applies inside code, preformatted text, existing abbreviations, or web addresses.

**Required lists.** `abbreviations.json`, `initials.json` and `alt-text.json` are plain JSON objects at the root of the content. Any may be `{}`.

| File | Shape |
|---|---|
| `abbreviations.json` | `{ "CCEL": "Christian Classics Ethereal Library" }` |
| `initials.json` | `{ "R.C. Sproul": "Robert Charles Sproul" }` |
| `alt-text.json` | `{ "bark.jpg": "A photograph of bark" }` |
