// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from '@/lib/chat/key-store'

const newKey = (extractable = false) =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt'])

describe('keys encrypted for storage', () => {
  it('round-trips, and the stored bytes do not contain the key', async () => {
    const key = await newKey()
    const rec = await encryptSecret(key, 'sk-test-123')
    expect(await decryptSecret(key, rec)).toBe('sk-test-123')
    const stored = new TextDecoder('latin1').decode(rec.data)
    expect(stored).not.toContain('sk-test')
    expect(rec.data.byteLength).toBeGreaterThan('sk-test-123'.length)
  })

  it('uses a new IV each time, so the same key never looks the same twice', async () => {
    const key = await newKey()
    const a = await encryptSecret(key, 'sk-same')
    const b = await encryptSecret(key, 'sk-same')
    expect(Array.from(a.iv)).not.toEqual(Array.from(b.iv))
    expect(Array.from(new Uint8Array(a.data))).not.toEqual(Array.from(new Uint8Array(b.data)))
  })

  it('does not decrypt under another key, or after tampering', async () => {
    const rec = await encryptSecret(await newKey(), 'sk-test-123')
    await expect(decryptSecret(await newKey(), rec)).rejects.toThrow()
    const key = await newKey()
    const good = await encryptSecret(key, 'sk-test-123')
    const bytes = new Uint8Array(good.data)
    bytes[0] = bytes[0]! ^ 0xff
    await expect(decryptSecret(key, { iv: good.iv, data: bytes.buffer })).rejects.toThrow()
  })

  it('handles non-ASCII keys', async () => {
    const key = await newKey()
    expect(await decryptSecret(key, await encryptSecret(key, 'clé-🔑'))).toBe('clé-🔑')
  })
})
