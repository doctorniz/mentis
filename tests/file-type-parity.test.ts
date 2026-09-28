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

  it.each(NAMES)('%s', (name) => {
    expect(viaRegistry(name)).toBe(legacyGetFileType(name))
  })

  it('getFileType() now answers through the registry, unchanged', () => {
    for (const name of NAMES) expect(getFileType(name)).toBe(legacyGetFileType(name))
  })
})

describe('kanban content claim, as the old detectEditorTabType applied it', () => {
  const read = (text: string) => async () => text
  const detect = async (path: string, text: string) =>
    (await fileTypes.detect(path, read(text), { fallback: 'markdown' }))?.id

  it('claims markdown with `type: kanban` frontmatter', async () => {
    expect(await detect('board.md', '---\ntype: kanban\n---\n## Todo\n')).toBe('kanban')
  })

  it('leaves other markdown alone', async () => {
    expect(await detect('note.md', '---\ntype: note\n---\nhi')).toBe('markdown')
    expect(await detect('note.md', '# no frontmatter')).toBe('markdown')
  })

  it('keeps markdown when the frontmatter does not parse', async () => {
    expect(await detect('bad.md', '---\ntype: [unclosed\n---\n')).toBe('markdown')
  })

  it('still applies to unknown files, which open as markdown', async () => {
    expect(await detect('board.whatever', '---\ntype: kanban\n---\n')).toBe('kanban')
  })

  it('never reads non-markdown files', async () => {
    const boom = async () => {
      throw new Error('should not read')
    }
    expect((await fileTypes.detect('x.pdf', boom, { fallback: 'markdown' }))?.id).toBe('pdf')
  })
})
