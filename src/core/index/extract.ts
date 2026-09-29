import type { SearchExtraction, SearchExtractor } from '@/core/registries/file-types'

/**
 * Runs a file type's search extractor. Extractors are discovered the way the
 * registries discover modules: `src/modules/<type id>/search.ts`, loaded on
 * demand so PDF.js, JSZip and SheetJS are fetched only when a file of that
 * type is extracted. This file must not import the file-type registry (it
 * would drag every module's registration, and React, into the worker).
 */
const extractors = import.meta.glob<{ default: SearchExtractor }>('/src/modules/*/search.ts')

export interface ExtractRequest {
  /** File-type registry id; also the name of the module directory. */
  typeId: string
  path: string
  data: string | Uint8Array
}

export type ExtractRunner = (request: ExtractRequest) => Promise<SearchExtraction | null>

/** Type ids that have an extractor module. */
export function extractorTypeIds(): string[] {
  return Object.keys(extractors).map((key) => key.split('/').slice(-2)[0])
}

export const runExtractor: ExtractRunner = async ({ typeId, path, data }) => {
  const load = extractors[`/src/modules/${typeId}/search.ts`]
  if (!load) throw new Error(`No search extractor for file type "${typeId}"`)
  return (await load()).default({ path, data })
}
