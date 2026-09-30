import type JSZip from 'jszip'
import type { ConvertInput, ConvertOutput } from '@/core/registries/file-types'

function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
}

const ITEM_RE = /^\s*(-|\d+\.) /

/** The text of one `<a:p>`, with bold and italic runs marked up. */
function paragraphText(p: string): string {
  const parts: string[] = []
  for (const run of p.match(/<a:r>[\s\S]*?<\/a:r>|<a:br\s*\/>/g) ?? []) {
    if (run.startsWith('<a:br')) {
      parts.push(' ')
      continue
    }
    const raw = run.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/)?.[1]
    if (raw === undefined) continue
    const text = decode(raw)
    if (!text.trim()) {
      parts.push(text)
      continue
    }
    const rPr = run.match(/<a:rPr[^>]*>/)?.[0] ?? ''
    const lead = text.match(/^\s*/)![0]
    const trail = text.match(/\s*$/)![0]
    let core = text.trim()
    if (attr(rPr, 'b') === '1') core = `**${core}**`
    if (attr(rPr, 'i') === '1') core = `*${core}*`
    parts.push(lead + core + trail)
  }
  return parts.join('').replace(/\s+/g, ' ').trim()
}

/** A line that would otherwise be read as a heading, rule or quote. */
function guard(line: string): string {
  return /^(#|>|-{3,}|={3,})/.test(line) ? `\\${line}` : line
}

function paragraphsOf(xml: string): string[] {
  return xml.match(/<a:p>[\s\S]*?<\/a:p>|<a:p\s[^>]*>[\s\S]*?<\/a:p>/g) ?? []
}

function shapeToMarkdown(sp: string, isFirstSlide: boolean): string[] {
  const ph = sp.match(/<p:ph\b[^>]*>/)?.[0]
  const phType = ph ? (attr(ph, 'type') ?? 'body') : undefined
  const isTitle = phType === 'title' || phType === 'ctrTitle'
  const bulletsByDefault = phType === 'body' || phType === 'obj'

  const out: string[] = []
  for (const p of paragraphsOf(sp)) {
    const text = paragraphText(p)
    if (!text) continue
    if (isTitle) {
      out.push(`${isFirstSlide ? '#' : '##'} ${text.replace(/\*\*/g, '')}`)
      continue
    }
    const pPr = p.match(/<a:pPr[^>]*>/)?.[0] ?? ''
    const level = Math.min(Number(attr(pPr, 'lvl') ?? 0) || 0, 6)
    const numbered = /<a:buAutoNum\b/.test(p)
    const bulleted =
      numbered || /<a:buChar\b/.test(p) || (bulletsByDefault && !/<a:buNone\b/.test(p))
    if (bulleted) out.push(`${'  '.repeat(level)}${numbered ? '1.' : '-'} ${text}`)
    else out.push(guard(text))
  }
  return out
}

function tableToMarkdown(frame: string): string[] {
  const rows = (frame.match(/<a:tr\b[\s\S]*?<\/a:tr>/g) ?? []).map((tr) =>
    (tr.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) ?? []).map((tc) =>
      paragraphsOf(tc).map(paragraphText).filter(Boolean).join(' ').replace(/\|/g, '\\|'),
    ),
  )
  if (rows.length === 0) return []
  const width = Math.max(...rows.map((r) => r.length))
  const line = (r: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
  const [head, ...body] = rows
  const rule = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`
  return [[line(head), rule, ...body.map(line)].join('\n')]
}

function notesToMarkdown(xml: string): string {
  const paras: string[] = []
  for (const sp of xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) ?? []) {
    const ph = sp.match(/<p:ph\b[^>]*>/)?.[0]
    if (!ph || attr(ph, 'type') !== 'body') continue
    for (const p of paragraphsOf(sp)) {
      const t = paragraphText(p).replace(/\*/g, '')
      if (t) paras.push(t)
    }
  }
  return paras.join('\n').replace(/--+>/g, '—')
}

/** Slide part paths in presentation order. */
async function slideOrder(zip: JSZip): Promise<string[]> {
  const all = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
  const byNumber = [...all].sort(
    (a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1]),
  )
  const pres = await zip.files['ppt/presentation.xml']?.async('text')
  const rels = await zip.files['ppt/_rels/presentation.xml.rels']?.async('text')
  if (!pres || !rels) return byNumber

  const targets = new Map<string, string>()
  for (const rel of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = attr(rel, 'Id')
    const target = attr(rel, 'Target')
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `ppt/${target}`)
  }
  const ordered: string[] = []
  for (const tag of pres.match(/<p:sldId\b[^>]*>/g) ?? []) {
    const target = targets.get(attr(tag, 'r:id') ?? '')
    if (target && zip.files[target]) ordered.push(target)
  }
  return ordered.length === all.length ? ordered : byNumber
}

async function notesFor(zip: JSZip, slidePath: string): Promise<string> {
  const relsPath = slidePath.replace('slides/', 'slides/_rels/') + '.rels'
  const rels = await zip.files[relsPath]?.async('text')
  const tag = rels?.match(/<Relationship\b[^>]*notesSlide[^>]*>/)?.[0] ?? ''
  const target = attr(tag, 'Target')
  if (!target) return ''
  const path = target.startsWith('/') ? target.slice(1) : `ppt/${target.replace(/^\.\.\//, '')}`
  const xml = await zip.files[path]?.async('text')
  return xml ? notesToMarkdown(xml) : ''
}

/** Turns a `.pptx` into a Marp deck. Exported for tests. */
export async function pptxToSlidesMarkdown(
  data: Uint8Array,
  title: string,
): Promise<{ content: string; skippedImages: number }> {
  const JSZipCtor = (await import('jszip')).default
  const zip = await JSZipCtor.loadAsync(data)
  const slidePaths = await slideOrder(zip)

  const slides: string[] = []
  let skippedImages = 0
  for (const [index, path] of slidePaths.entries()) {
    const xml = await zip.files[path].async('text')
    skippedImages += (xml.match(/<p:pic>/g) ?? []).length

    const blocks: string[] = []
    const shapes =
      xml.match(/<p:sp>[\s\S]*?<\/p:sp>|<p:graphicFrame>[\s\S]*?<\/p:graphicFrame>/g) ?? []
    for (const shape of shapes) {
      if (shape.startsWith('<p:graphicFrame')) blocks.push(...tableToMarkdown(shape))
      else blocks.push(...shapeToMarkdown(shape, index === 0))
    }

    let body = ''
    blocks.forEach((line, i) => {
      const listContinues = i > 0 && ITEM_RE.test(line) && ITEM_RE.test(blocks[i - 1])
      body += i === 0 ? line : listContinues ? `\n${line}` : `\n\n${line}`
    })

    const notes = await notesFor(zip, path)
    slides.push((notes ? `${body}${body ? '\n\n' : ''}<!--\n${notes}\n-->` : body).trim())
  }

  const frontMatter = `---\nmarp: true\ntitle: ${JSON.stringify(title)}\npaginate: true\n---`
  return { content: `${frontMatter}\n\n${slides.join('\n\n---\n\n')}\n`, skippedImages }
}

export default async function convertPptx({ data, title }: ConvertInput): Promise<ConvertOutput> {
  const { content, skippedImages } = await pptxToSlidesMarkdown(data, title)
  const n = skippedImages
  return {
    content,
    suffix: '.slides.md',
    warning:
      n > 0
        ? `${n} image${n === 1 ? '' : 's'} could not be converted and ${n === 1 ? 'was' : 'were'} left out.`
        : undefined,
  }
}
