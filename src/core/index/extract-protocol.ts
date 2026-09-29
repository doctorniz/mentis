import type { SearchExtraction } from '@/core/registries/file-types'
import type { ExtractRequest } from './extract'

export interface ExtractMessage {
  id: number
  request: ExtractRequest
}

export type ExtractResponse =
  | { id: number; ok: true; result: SearchExtraction | null }
  | { id: number; ok: false; error: string }
