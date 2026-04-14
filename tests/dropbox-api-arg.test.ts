import { describe, expect, it } from 'vitest'
import { encodeDropboxApiArgHeader } from '@/lib/sync/providers/dropbox'

describe('encodeDropboxApiArgHeader', () => {
  it('matches JSON for ASCII-only payloads', () => {
    const payload = { path: '/Mentis/Vault/hello.txt' }
    expect(encodeDropboxApiArgHeader(payload)).toBe(JSON.stringify(payload))
  })

  it('encodes Unicode in JSON so every char is U+0000–U+00FF (fetch-safe header)', () => {
    const payload = { path: '/Mentis/Vault/café.md' }
    const header = encodeDropboxApiArgHeader(payload)
    for (let i = 0; i < header.length; i++) {
      expect(header.charCodeAt(i)).toBeLessThanOrEqual(0xff)
    }
    expect(header).not.toBe(JSON.stringify(payload))
    const roundTrip = new TextDecoder().decode(
      Uint8Array.from(header, (c) => c.charCodeAt(0)),
    )
    expect(roundTrip).toBe(JSON.stringify(payload))
  })
})
