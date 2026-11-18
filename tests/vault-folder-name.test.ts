import { describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

import { folderName } from '@/lib/vault/desktop'

describe('folderName', () => {
  it('names a desktop folder by its last part', () => {
    expect(folderName('C:\\Users\\me\\Notes')).toBe('Notes')
    expect(folderName('/home/me/Test Vaults/')).toBe('Test Vaults')
  })

  it('decodes an Android folder', () => {
    const tree = 'content://com.android.externalstorage.documents/tree/primary%3ATest%20Vaults'
    expect(folderName(tree)).toBe('Test Vaults')
    expect(folderName(`${tree}%2FWork%20notes`)).toBe('Work notes')
    expect(folderName(`${tree}|My Vault`)).toBe('My Vault')
  })

  it('falls back when the folder is a whole volume', () => {
    expect(folderName('content://com.android.externalstorage.documents/tree/primary%3A')).toBe(
      'Vault',
    )
  })
})
