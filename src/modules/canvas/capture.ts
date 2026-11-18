import { Layout } from 'lucide-react'
import type { CaptureDestination, ParseResult } from '@/core/registries/capture'

const none = (input: string): ParseResult => ({ values: {}, matchedSpans: [], residual: input })

/** A new drawing, opened at once, as New › Canvas makes it. */
const canvas: CaptureDestination = {
  id: 'canvas',
  sigil: '/canvas',
  aliases: ['/draw', '/drawing'],
  label: 'Canvas',
  icon: Layout,
  hint: 'A new drawing',
  immediate: true,
  parseNow: none,
  parse: async (input) => none(input),
  write: async () => null,
  pick: async ({ vaultFs }) => {
    const [{ fileTypes }, { createFileOfType }] = await Promise.all([
      import('@/core/registries'),
      import('@/lib/notes/new-files'),
    ])
    const def = fileTypes.get('canvas')
    if (!def) return null
    return (await createFileOfType(vaultFs, def)) ? {} : null
  },
  // The desktop capture overlay is its own window: drawings open in the main one.
  enabled: () => typeof location === 'undefined' || !location.pathname.endsWith('/capture.html'),
}

export default [canvas]
