/**
 * Guards the move from the hard-coded getFileType() switch to the registry.
 * `legacyGetFileType` is a frozen copy of the switch as it stood before the
 * registry; every name below must resolve identically through the registry.
 */
import { describe, expect, it } from 'vitest'
import { fileTypes } from '@/core/registries'
import { getFileType } from '@/types/files'

function legacyGetFileType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'md':
    case 'markdown':
      return 'markdown'
    case 'pdf':
      return 'pdf'
    case 'canvas':
      return 'canvas'
    case 'mind':
      return 'mindmap'
    case 'kanban':
      return 'kanban'
    case 'docx':
      return 'docx'
    case 'pptx':
      return 'pptx'
    case 'xlsx':
    case 'xls':
    case 'csv':
      return 'spreadsheet'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
      return 'image'
    case 'mp3':
    case 'wav':
    case 'm4a':
    case 'aac':
    case 'flac':
    case 'wma':
      return 'audio'
    case 'mp4':
    case 'webm':
    case 'ogg':
    case 'mov':
    case 'mkv':
    case 'avi':
      return 'video'
    case 'html':
    case 'htm':
    case 'css':
    case 'scss':
    case 'less':
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
    case 'py':
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'xml':
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'bat':
    case 'ps1':
    case 'sql':
    case 'graphql':
    case 'gql':
    case 'env':
    case 'ini':
    case 'conf':
    case 'cfg':
    case 'log':
    case 'txt':
      return 'code'
    default:
      return 'other'
  }
}

const EXTENSIONS = [
  'md',
  'markdown',
  'pdf',
  'canvas',
  'mind',
  'kanban',
  'docx',
  'pptx',
  'xlsx',
  'xls',
  'csv',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'mp3',
  'wav',
  'm4a',
  'aac',
  'flac',
  'wma',
  'mp4',
  'webm',
  'ogg',
  'mov',
  'mkv',
  'avi',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'mts',
  'cts',
  'py',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'sh',
  'bash',
  'zsh',
  'bat',
  'ps1',
  'sql',
  'graphql',
  'gql',
  'env',
  'ini',
  'conf',
  'cfg',
  'log',
  'txt',
]

const NAMES = [
  ...EXTENSIONS.map((e) => `file.${e}`),
  ...EXTENSIONS.map((e) => `Upper.${e.toUpperCase()}`),
  ...EXTENSIONS.map((e) => `nested/dir/a.b.${e}`),
  'a.md.bak',
  'archive.tar.gz',
  'noext',
  'Makefile',
  'LICENSE',
  '.env',
  '.gitignore',
  'md',
  'pdf',
  'txt',
  'weird.',
  'dots...md',
  'folder.pdf/readme',
  'x.docx.pdf',
  'x.pdf.docx',
]

const viaRegistry = (name: string) => fileTypes.resolve(name)?.id ?? 'other'

// Boards and maps moved to .kan.md / .map.md on purpose (see the describe
// below); every other name must still resolve exactly as the old switch did.
const RETIRED = /\.(mind|kanban)$/i
const PARITY_NAMES = NAMES.filter((n) => !RETIRED.test(n))

describe('registry parity with the old getFileType switch', () => {
  // Parity means every pre-registry type is still registered and resolves as
  // before — not that nothing new may exist. Modules added later (slides, …)
  // must not have to edit this test.
  it('still registers every pre-registry type', () => {
    const registered = new Set(fileTypes.all().map((d) => d.id))
    for (const id of new Set(EXTENSIONS.map(legacyGetFileType))) {
      expect(registered.has(id), `missing type "${id}"`).toBe(true)
    }
  })

  it.each(PARITY_NAMES)('%s', (name) => {
    expect(viaRegistry(name)).toBe(legacyGetFileType(name))
  })

  it('getFileType() now answers through the registry, unchanged', () => {
    for (const name of PARITY_NAMES) expect(getFileType(name)).toBe(legacyGetFileType(name))
  })
})

describe('markdown formats for boards and maps (replacing .kanban / .mind)', () => {
  it('resolves the compound suffixes', () => {
    expect(fileTypes.resolve('board.kan.md')?.id).toBe('kanban')
    expect(fileTypes.resolve('ideas.map.md')?.id).toBe('mindmap')
    expect(fileTypes.resolve('Plan.KAN.MD')?.id).toBe('kanban')
    expect(fileTypes.resolve('note.md')?.id).toBe('markdown')
  })

  it('retires the old suffixes', () => {
    expect(fileTypes.resolve('board.kanban')).toBeUndefined()
    expect(fileTypes.resolve('ideas.mind')).toBeUndefined()
  })

  it('no longer turns markdown into a board by frontmatter, and never reads to decide', async () => {
    let reads = 0
    const read = async () => {
      reads++
      return '---\ntype: kanban\n---\n## Todo\n'
    }
    expect((await fileTypes.detect('board.md', read, { fallback: 'markdown' }))?.id).toBe(
      'markdown',
    )
    expect(reads).toBe(0)
  })

  it('keeps boards and maps linkable from [[wiki-links]]', () => {
    for (const p of ['a.md', 'b.kan.md', 'c.map.md', 'd.slides.md']) {
      expect(fileTypes.resolve(p)?.linkable, p).toBe(true)
    }
    expect(fileTypes.resolve('e.pdf')?.linkable).toBeFalsy()
  })
})
