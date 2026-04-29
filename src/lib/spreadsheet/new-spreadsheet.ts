import type { FileSystemAdapter } from '@/lib/fs'
import { createBlankXlsx } from './xlsx-io'

/** Next available `untitled.xlsx`, `untitled-1.xlsx`, … at vault root. */
export async function allocateUntitledSpreadsheetPath(fs: FileSystemAdapter): Promise<string> {
  const base = 'untitled'
  let candidate = `${base}.xlsx`
  let i = 0
  while (await fs.exists(candidate)) {
    i += 1
    candidate = `${base}-${i}.xlsx`
  }
  return candidate
}

export async function createUntitledSpreadsheet(fs: FileSystemAdapter): Promise<string> {
  const path = await allocateUntitledSpreadsheetPath(fs)
  const bytes = createBlankXlsx()
  await fs.writeFile(path, bytes)
  return path
}
