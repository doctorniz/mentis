// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createImageResolver, imageCandidates } from '@/core/render/resolve-images'

describe('imageCandidates', () => {
  it('tries the assets folder first, then the vault path as written', () => {
    expect(imageCandidates('pic.png')).toEqual(['_assets/pic.png', 'pic.png'])
    expect(imageCandidates('./photos/a%20b.png')).toEqual([
      '_assets/photos/a b.png',
      'photos/a b.png',
    ])
  })

  it('takes an explicit assets path as is', () => {
    expect(imageCandidates('_assets/pic.png')).toEqual(['_assets/pic.png'])
  })

  it('ignores external URLs and paths that climb out of the vault', () => {
    expect(imageCandidates('https://x.test/a.png')).toEqual([])
    expect(imageCandidates('data:image/png;base64,AAAA')).toEqual([])
    expect(imageCandidates('blob:abc')).toEqual([])
    expect(imageCandidates('../secret.png')).toEqual([])
    expect(imageCandidates('')).toEqual([])
  })
})

describe('createImageResolver', () => {
  const files = new Map<string, Uint8Array>([['_assets/a.png', new Uint8Array([1])]])
  const fs = {
    exists: async (p: string) => files.has(p),
    readFile: async (p: string) => {
      const f = files.get(p)
      if (!f) throw new Error('missing')
      return f
    },
  } as never

  afterEach(() => vi.restoreAllMocks())

  it('points vault images and Marp backgrounds at blob URLs, once per file', async () => {
    let n = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test/${++n}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const root = document.createElement('div')
    root.innerHTML =
      `<img src="a.png"><img src="_assets/a.png"><img src="https://x.test/b.png"><img src="missing.png">` +
      `<figure style="background-image:url(&quot;a.png&quot;);"></figure>`
    const resolver = createImageResolver(fs)
    await resolver.resolve(root)

    const srcs = [...root.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs).toEqual(['blob:test/1', 'blob:test/1', 'https://x.test/b.png', 'missing.png'])
    expect(root.querySelector('figure')!.getAttribute('style')).toContain('url("blob:test/1")')
    expect(n).toBe(1)

    resolver.dispose()
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:test/1'))
  })
})
