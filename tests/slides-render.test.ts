import { describe, expect, it } from 'vitest'
import { renderSlides } from '@/core/render/slides-render'
import createSlides from '@/modules/slides/create'
import { createSlidesRenderer, type SlidesWorkerLike } from '@/core/render/slides-client'
import type { SlidesRequest, SlidesResponse } from '@/core/render/slides-protocol'

describe('renderSlides', () => {
  it('renders one svg per slide', () => {
    const { html } = renderSlides(
      '---\nmarp: true\n---\n\n# One\n\n---\n\n# Two\n\n---\n\n# Three\n',
    )
    expect(html.match(/<svg/g)).toHaveLength(3)
  })

  it('renders KaTeX math without pointing fonts at a CDN', () => {
    const { html, css } = renderSlides(createSlides({ title: 'Deck' }))
    expect(html).toContain('katex')
    expect(css).not.toMatch(/url\(\s*["']?https?:/)
  })

  it('does not emit a browser script', () => {
    expect(renderSlides('---\nmarp: true\n---\n\n# A\n').html).not.toContain('<script')
  })
})

class FakeWorker implements SlidesWorkerLike {
  onmessage: ((event: MessageEvent<SlidesResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  posted: SlidesRequest[] = []
  terminated = false
  postMessage(message: SlidesRequest) {
    this.posted.push(message)
  }
  terminate() {
    this.terminated = true
  }
  reply(id: number, html: string) {
    this.onmessage?.({
      data: { id, ok: true, result: { html, css: '' } },
    } as MessageEvent<SlidesResponse>)
  }
}

describe('createSlidesRenderer', () => {
  it('does not start a worker until the first render', () => {
    let spawned = 0
    createSlidesRenderer(() => {
      spawned++
      return new FakeWorker()
    })
    expect(spawned).toBe(0)
  })

  it('resolves a render with the worker result', async () => {
    const w = new FakeWorker()
    const r = createSlidesRenderer(() => w)
    const p = r.render('a')
    w.reply(w.posted[0].id, '<a/>')
    expect(await p).toEqual({ html: '<a/>', css: '' })
  })

  it('keeps only the newest source waiting and drops superseded renders', async () => {
    const w = new FakeWorker()
    const r = createSlidesRenderer(() => w)
    const first = r.render('one')
    const second = r.render('two')
    const third = r.render('three')

    // Only the first is in flight; the rest wait behind it.
    expect(w.posted.map((m) => m.source)).toEqual(['one'])
    expect(await second).toBeNull()

    w.reply(w.posted[0].id, 'stale')
    expect(await first).toBeNull()
    expect(w.posted.map((m) => m.source)).toEqual(['one', 'three'])

    w.reply(w.posted[1].id, 'fresh')
    expect(await third).toEqual({ html: 'fresh', css: '' })
  })

  it('rejects and restarts after a worker failure', async () => {
    const workers: FakeWorker[] = []
    const r = createSlidesRenderer(() => {
      const w = new FakeWorker()
      workers.push(w)
      return w
    })
    const p = r.render('a')
    workers[0].onerror?.({ message: 'boom', preventDefault() {} } as ErrorEvent)
    await expect(p).rejects.toThrow('boom')
    expect(workers[0].terminated).toBe(true)

    const again = r.render('b')
    expect(workers).toHaveLength(2)
    workers[1].reply(workers[1].posted[0].id, 'ok')
    expect(await again).toEqual({ html: 'ok', css: '' })
  })

  it('stops the worker after the idle spell', async () => {
    const w = new FakeWorker()
    const r = createSlidesRenderer(() => w, 10)
    const p = r.render('a')
    w.reply(w.posted[0].id, 'x')
    await p
    await new Promise((res) => setTimeout(res, 30))
    expect(w.terminated).toBe(true)
  })
})
