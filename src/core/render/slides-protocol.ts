import type { SlidesRender } from './slides-render'

export interface SlidesRequest {
  id: number
  source: string
}

export type SlidesResponse =
  | { id: number; ok: true; result: SlidesRender }
  | { id: number; ok: false; error: string }
