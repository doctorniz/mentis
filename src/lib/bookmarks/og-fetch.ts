export interface OgMetadata {
  title: string
  description: string
  ogImage: string
  favicon: string
}

function faviconUrl(url: string): string {
  try {
    const { hostname } = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`
  } catch {
    return ''
  }
}

function hostnameLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Microlink is a purpose-built metadata API — single fast JSON call, no CORS issues.
// Free tier: 50 req/day (generous for personal use).
const MICROLINK_API = 'https://api.microlink.io'

export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  const favicon = faviconUrl(url)
  const fallback: OgMetadata = {
    title: hostnameLabel(url),
    description: '',
    ogImage: '',
    favicon,
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5_000)

    const res = await fetch(`${MICROLINK_API}?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) return fallback

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as { status: string; data: any }
    if (json.status !== 'success' || !json.data) return fallback

    const { data } = json
    return {
      title: (data.title as string) || fallback.title,
      description: (data.description as string) || '',
      ogImage: (data.image?.url as string) || '',
      favicon,
    }
  } catch {
    return fallback
  }
}
