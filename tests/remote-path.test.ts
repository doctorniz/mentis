import { describe, expect, it } from 'vitest'
import { readableRemotePath } from '@/lib/sync/remote-path'

describe('readableRemotePath', () => {
  it('decodes an address-encoded folder name', () => {
    expect(readableRemotePath('/Apps/Mentis/primary%3ATest%20Vaults')).toBe(
      '/Apps/Mentis/primary:Test Vaults',
    )
  })
  it('leaves a plain path, an empty one and a stray % alone', () => {
    expect(readableRemotePath('/Apps/Mentis/My Vault')).toBe('/Apps/Mentis/My Vault')
    expect(readableRemotePath('')).toBe('')
    expect(readableRemotePath(undefined)).toBe('')
    expect(readableRemotePath('/Apps/100%')).toBe('/Apps/100%')
  })
})
