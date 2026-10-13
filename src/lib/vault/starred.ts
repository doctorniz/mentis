import type { FileSystemAdapter } from '@/lib/fs'
import { saveVaultConfig } from '@/lib/vault'
import { useFileTreeStore } from '@/stores/file-tree'
import { useVaultStore } from '@/stores/vault'

const trim = (p: string) => p.replace(/^\/+|\/+$/g, '')

/**
 * Stars after `from` moved to `to` (`null`: deleted). A folder carries the
 * stars of everything under it. Returns `paths` itself when nothing changed.
 */
export function remapStarred(paths: string[], from: string, to: string | null): string[] {
  const src = trim(from)
  const dst = to === null ? null : trim(to)
  let changed = false
  const out: string[] = []
  for (const p of paths) {
    const path = trim(p)
    const inside = path === src || path.startsWith(`${src}/`)
    if (!inside) {
      out.push(p)
      continue
    }
    changed = true
    if (dst !== null) out.push(dst + path.slice(src.length))
  }
  return changed ? [...new Set(out)] : paths
}

/** Where stars were kept before they moved into the vault (per browser). */
const legacyKey = (vaultPath: string) => `mentis:starred:${vaultPath}`

function takeLegacyStars(vaultPath: string): string[] {
  try {
    const raw = localStorage.getItem(legacyKey(vaultPath))
    if (raw === null) return []
    localStorage.removeItem(legacyKey(vaultPath))
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Loads the vault's stars from `config.json` into the file tree and writes
 * every later change back. Returns a function that stops it.
 */
export function startStarredSync(vaultFs: FileSystemAdapter, vaultPath: string): () => void {
  const saved = useVaultStore.getState().config?.starred ?? []
  const legacy = takeLegacyStars(vaultPath)
  const initial = legacy.length > 0 ? [...new Set([...saved, ...legacy])] : saved
  useFileTreeStore.setState({ starredPaths: initial })

  let writing = Promise.resolve()
  const persist = (starred: string[]) => {
    useVaultStore.getState().updateConfig({ starred })
    writing = writing
      .then(() => {
        const config = useVaultStore.getState().config
        return config ? saveVaultConfig(vaultFs, config) : undefined
      })
      .catch(() => {})
  }
  if (initial !== saved) persist(initial)

  const stop = useFileTreeStore.subscribe((state, prev) => {
    if (state.starredPaths !== prev.starredPaths) persist(state.starredPaths)
  })
  return () => {
    stop()
    useFileTreeStore.setState({ starredPaths: [] })
  }
}

/** Keep stars attached to files that move, and drop those of deleted files. */
export function moveStars(from: string, to: string | null): void {
  const current = useFileTreeStore.getState().starredPaths
  const next = remapStarred(current, from, to)
  if (next !== current) useFileTreeStore.setState({ starredPaths: next })
}
