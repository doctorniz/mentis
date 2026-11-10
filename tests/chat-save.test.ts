import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import type { FileSystemAdapter } from '@/lib/fs/types'
import {
  chatDir,
  sanitizeExportBasename,
  savedChatPath,
  threadToMarkdown,
} from '@/lib/chat/vault-chat-ui'
import type { ChatThread } from '@/types/chat'

const vault = (...taken: string[]) => {
  const files = new Set(taken)
  const dirs: string[] = []
  const fs = {
    exists: async (p: string) => files.has(p) || dirs.includes(p),
    mkdir: async (p: string) => void dirs.push(p),
  } as unknown as FileSystemAdapter
  return { fs, dirs }
}

const thread = (title: string): ChatThread =>
  ({
    schemaVersion: 1,
    id: 't',
    documentAssetId: '_vault',
    documentPath: '',
    title,
    createdAt: '',
    modifiedAt: '',
    messages: [
      { id: 'u', role: 'user', content: 'Hi', createdAt: '' },
      { id: 'a', role: 'assistant', content: 'Hello', createdAt: '' },
    ],
  }) as ChatThread

describe('where a saved chat goes', () => {
  it('is the Chat folder unless the setting says otherwise', () => {
    expect(chatDir(undefined)).toBe('Chat')
    expect(chatDir({ chatFolder: '' })).toBe('Chat')
    expect(chatDir({ chatFolder: '/Talks/AI/' })).toBe('Talks/AI')
  })

  it('makes the folder, and each one above it', async () => {
    const { fs, dirs } = vault('Talks')
    expect(await savedChatPath(fs, { chatFolder: 'Talks/AI' }, 'Plan')).toBe(
      'Talks/AI/Plan.chat.md',
    )
    expect(dirs).toEqual(['Talks/AI'])
  })

  it('never takes the name of a file already there', async () => {
    const { fs } = vault('Chat', 'Chat/Welcome.chat.md', 'Chat/Welcome 2.chat.md')
    expect(await savedChatPath(fs, null, 'Welcome')).toBe('Chat/Welcome 3.chat.md')
  })
})

describe('the file name from a title', () => {
  it('removes what a file system refuses', () => {
    expect(sanitizeExportBasename('a/b\\c?d:e')).toBe('a-b-c-d-e')
    expect(sanitizeExportBasename('tab\there')).toBe('tab-here')
  })

  it('has no trailing dot or space, and a name when nothing is left', () => {
    expect(sanitizeExportBasename('What now?. ')).toBe('What now-')
    expect(sanitizeExportBasename('...')).toBe('chat')
    expect(sanitizeExportBasename('   ')).toBe('chat')
  })

  it('moves reserved Windows names out of the way', () => {
    expect(sanitizeExportBasename('CON')).toBe('_CON')
    expect(sanitizeExportBasename('lpt1.txt')).toBe('_lpt1.txt')
    expect(sanitizeExportBasename('Console')).toBe('Console')
  })

  it('stays within 80 characters', () => {
    expect(sanitizeExportBasename('x'.repeat(200))).toHaveLength(80)
  })
})

describe('the saved chat header', () => {
  const titles = [
    '- groceries',
    '[draft]',
    '# idea',
    'say "hi"',
    'a: b',
    "it's: odd",
    '> quote',
    '',
  ]

  it.each(titles)('is valid YAML and keeps the title: %j', (title) => {
    const doc = matter(threadToMarkdown(thread(title), 'OpenAI', 'gpt: 4'))
    expect(doc.data.title).toBe(title)
    expect(doc.data.type).toBe('chat')
    expect(doc.data.provider).toBe('OpenAI')
    expect(doc.data.model).toBe('gpt: 4')
  })

  it('holds the conversation', () => {
    const doc = matter(threadToMarkdown(thread('T'), 'P', 'M'))
    expect(doc.content).toContain('## You')
    expect(doc.content).toContain('Hello')
  })
})
