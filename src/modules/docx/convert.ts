import type { ConvertInput, ConvertOutput } from '@/core/registries/file-types'

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

function cellText(cell: Element): string {
  return (cell.textContent ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
}

/** Turns mammoth's HTML into Markdown. Exported for tests. */
export async function htmlToMarkdown(html: string): Promise<string> {
  const TurndownService = (await import('turndown')).default
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
  })
  td.addRule('listItem', {
    filter: 'li',
    replacement(content, node, options) {
      const parent = node.parentNode as HTMLElement
      let prefix = `${options.bulletListMarker} `
      if (parent.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? 1)
        prefix = `${start + Array.from(parent.children).indexOf(node as Element)}. `
      }
      const body = content
        .replace(/^\n+/, '')
        .replace(/\n+$/, '\n')
        .replace(/\n/gm, `\n${' '.repeat(prefix.length)}`)
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '')
    },
  })
  td.addRule('table', {
    filter: 'table',
    replacement(_content, node) {
      const rows = Array.from((node as HTMLElement).querySelectorAll('tr')).map((tr) =>
        Array.from(tr.children).map(cellText),
      )
      if (rows.length === 0) return ''
      const width = Math.max(...rows.map((r) => r.length))
      const line = (r: string[]) =>
        `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
      const [head, ...body] = rows
      const rule = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`
      return `\n\n${[line(head), rule, ...body.map(line)].join('\n')}\n\n`
    },
  })
  return td.turndown(html).trim()
}

export default async function convertDocx({
  data,
  title,
  saveAsset,
}: ConvertInput): Promise<ConvertOutput> {
  const mammoth = (await import('mammoth')).default
  let imageCount = 0
  const arrayBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const ext = IMAGE_EXT[image.contentType]
        if (!ext) return { src: '' }
        const bytes = new Uint8Array(await image.readAsArrayBuffer())
        imageCount++
        const src = await saveAsset(`${title}-image-${imageCount}.${ext}`, bytes)
        return { src, alt: '' }
      }),
    },
  )

  const body = await htmlToMarkdown(result.value)
  const dropped = result.messages.filter((m) => m.type === 'warning').length
  return {
    content: `${body}\n`,
    suffix: '.md',
    warning:
      dropped > 0
        ? 'Some formatting in the document has no Markdown equivalent and was simplified.'
        : undefined,
  }
}
