import type { FileSystemAdapter } from '@/lib/fs'

const ASSETS_DIR = '_assets'

function uniqueName(originalName: string): string {
  const dot = originalName.lastIndexOf('.')
  const stem = dot > 0 ? originalName.slice(0, dot) : originalName
  const ext = dot > 0 ? originalName.slice(dot) : ''
  const safe = stem.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 6)
  return `${safe}-${ts}${rand}${ext}`
}

/**
 * Save a binary file to `_assets/` with a unique name.
 * Returns the vault-relative path (e.g. `_assets/photo-abc123.png`).
 */
export async function saveAsset(
  fs: FileSystemAdapter,
  fileName: string,
  data: Uint8Array,
): Promise<string> {
  await fs.mkdir(ASSETS_DIR)
  const name = uniqueName(fileName)
  const path = `${ASSETS_DIR}/${name}`
  await fs.writeFile(path, data)
  return path
}

/**
 * Read a vault-relative asset and return a blob: URL.
 * Caller is responsible for revoking the URL when done.
 */
export async function assetToBlobUrl(
  fs: FileSystemAdapter,
  vaultPath: string,
): Promise<string> {
  const data = await fs.readFile(vaultPath)
  const ext = vaultPath.split('.').pop()?.toLowerCase() ?? ''
  const mime = MIME_MAP[ext] ?? 'application/octet-stream'
  const blob = new Blob([data], { type: mime })
  return URL.createObjectURL(blob)
}

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
}

export function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)
}
