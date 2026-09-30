import type { FileSystemAdapter } from '@/lib/fs'
import { DEFAULT_ASSETS_DIR, assetToBlobUrl } from '@/lib/notes/assets'

/** Anything the browser can already load: a scheme, a protocol-relative URL or a fragment. */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i
const CSS_URL = /url\(\s*(["']?)(.*?)\1\s*\)/g

/**
 * Vault paths a slide image reference may mean, most likely first. A bare
 * name means the assets folder; an explicit vault path is tried as written.
 */
export function imageCandidates(src: string): string[] {
  if (!src || EXTERNAL.test(src)) return []
  let path = src
  try {
    path = decodeURIComponent(src)
  } catch {
    // keep the raw text
  }
  path = path.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '')
  if (!path || path.split('/').includes('..')) return []
  return path.startsWith(`${DEFAULT_ASSETS_DIR}/`) ? [path] : [`${DEFAULT_ASSETS_DIR}/${path}`, path]
}

export interface ImageResolver {
  /** Points every vault image in `root` at a blob URL. Unresolvable ones are left alone. */
  resolve(root: ParentNode): Promise<void>
  /** Revokes every blob URL this resolver created. */
  dispose(): void
}

export function createImageResolver(fs: FileSystemAdapter): ImageResolver {
  // Keyed by vault path; holds the promise so concurrent lookups share one blob.
  const urls = new Map<string, Promise<string | null>>()

  function load(path: string): Promise<string | null> {
    let pending = urls.get(path)
    if (!pending) {
      pending = fs
        .exists(path)
        .then((found) => (found ? assetToBlobUrl(fs, path) : null))
        .catch(() => null)
      urls.set(path, pending)
    }
    return pending
  }

  async function urlFor(src: string): Promise<string | null> {
    for (const path of imageCandidates(src)) {
      const url = await load(path)
      if (url) return url
    }
    return null
  }

  async function resolve(root: ParentNode): Promise<void> {
    const jobs: Promise<void>[] = []

    for (const img of root.querySelectorAll('img[src]')) {
      jobs.push(
        urlFor(img.getAttribute('src') ?? '').then((url) => {
          if (url) img.setAttribute('src', url)
        }),
      )
    }

    // Marp draws `![bg](…)` as a CSS background on a <figure>.
    for (const el of root.querySelectorAll('[style*="url("]')) {
      const style = el.getAttribute('style') ?? ''
      const sources = [...style.matchAll(CSS_URL)].map((m) => m[2])
      jobs.push(
        Promise.all(sources.map(urlFor)).then((found) => {
          let i = 0
          el.setAttribute(
            'style',
            style.replace(CSS_URL, (whole) => {
              const url = found[i++]
              return url ? `url("${url}")` : whole
            }),
          )
        }),
      )
    }

    await Promise.all(jobs)
  }

  return {
    resolve,
    dispose() {
      for (const pending of urls.values())
        void pending.then((url) => {
          if (url) URL.revokeObjectURL(url)
        })
      urls.clear()
    },
  }
}
