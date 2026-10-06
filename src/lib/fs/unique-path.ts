import type { FileSystemAdapter } from '@/lib/fs/types'

/**
 * The first of `Name<suffix>`, `Name 2<suffix>`, `Name 3<suffix>`, … that
 * `exists` says is free. This is the one collision rule for every file the
 * app creates: a space and a number, starting at 2.
 */
export async function freePath(
  dir: string,
  stem: string,
  suffix: string,
  exists: (path: string) => Promise<boolean>,
): Promise<string> {
  for (let n = 1; ; n++) {
    const path = `${dir}${n === 1 ? stem : `${stem} ${n}`}${suffix}`
    if (!(await exists(path))) return path
  }
}

/**
 * `path` if nothing is there, else the next free `Name 2.ext`, … beside it.
 * Pass `suffix` for compound suffixes (`.kan.md`) so the number goes before
 * the whole suffix; otherwise the last extension is used.
 */
export async function uniqueVaultPath(
  fs: FileSystemAdapter,
  path: string,
  suffix?: string,
): Promise<string> {
  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash + 1) : ''
  const name = slash >= 0 ? path.slice(slash + 1) : path
  const ext =
    suffix && name.toLowerCase().endsWith(suffix.toLowerCase())
      ? name.slice(name.length - suffix.length)
      : name.lastIndexOf('.') > 0
        ? name.slice(name.lastIndexOf('.'))
        : ''
  return freePath(dir, name.slice(0, name.length - ext.length), ext, (p) => fs.exists(p))
}
