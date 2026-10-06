import { fileTypes } from '@/core/registries'
import type { FileSystemAdapter } from '@/lib/fs'
import { saveAsset } from '@/lib/notes/assets'
import { freePath } from '@/lib/fs/unique-path'

function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf('/')
  return { dir: i === -1 ? '' : path.slice(0, i + 1), name: i === -1 ? path : path.slice(i + 1) }
}

export function canConvert(path: string): boolean {
  return fileTypes.resolve(path)?.convertTo !== undefined
}

export function convertLabel(path: string): string | undefined {
  return fileTypes.resolve(path)?.convertTo?.label
}

export interface ConvertResult {
  path: string
  warning?: string
}

/**
 * Converts `path` with its type's converter and writes the result beside it.
 * The original is never touched; an existing file is never overwritten.
 */
export async function convertVaultFile(
  fs: FileSystemAdapter,
  path: string,
): Promise<ConvertResult> {
  const spec = fileTypes.resolve(path)?.convertTo
  if (!spec) throw new Error('This file type cannot be converted.')

  const { dir, name } = splitPath(path)
  const suffix = fileTypes.matchedSuffix(path) ?? ''
  const title = name.slice(0, name.length - suffix.length)

  const [data, convert] = await Promise.all([fs.readFile(path), spec.run().then((m) => m.default)])
  const out = await convert({
    data,
    title,
    saveAsset: (fileName, bytes) => saveAsset(fs, fileName, bytes),
  })

  const target = await freePath(dir, title, out.suffix, (p) => fs.exists(p))
  await fs.writeTextFile(target, out.content)
  window.dispatchEvent(new CustomEvent('ink:vault-changed'))
  return { path: target, warning: out.warning }
}
