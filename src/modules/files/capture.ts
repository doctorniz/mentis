import { Camera, Paperclip } from 'lucide-react'
import type { CaptureContext, CaptureDestination, ParseResult, WriteResult } from '@/core/registries/capture'

const none = (input: string): ParseResult => ({ values: {}, matchedSpans: [], residual: input })

/** The desktop capture overlay is its own window: files go in through the main one. */
const inMainWindow = () =>
  typeof location === 'undefined' || !location.pathname.endsWith('/capture.html')

/**
 * Asks for files with a file input, straight from the user's click or key
 * (a picker needs one), then copies them into the vault and opens a lone one.
 */
function pickFiles(
  { vaultFs }: CaptureContext,
  input: { accept?: string; capture?: string; multiple?: boolean },
): Promise<WriteResult | null> {
  const el = document.createElement('input')
  el.type = 'file'
  if (input.accept) el.accept = input.accept
  if (input.capture) el.setAttribute('capture', input.capture)
  el.multiple = input.multiple ?? false
  el.style.display = 'none'
  document.body.appendChild(el)
  return new Promise<WriteResult | null>((resolve, reject) => {
    const done = () => el.remove()
    el.addEventListener('cancel', () => {
      done()
      resolve(null)
    })
    el.addEventListener('change', () => {
      const files = el.files ? Array.from(el.files) : []
      done()
      if (!files.length) return resolve(null)
      import('@/lib/notes/new-files')
        .then(({ importFilesIntoVault }) => importFilesIntoVault(vaultFs, files))
        .then((count) => resolve(count ? {} : null), reject)
    })
    el.click()
  })
}

const file: CaptureDestination = {
  id: 'file',
  sigil: '/file',
  aliases: ['/import', '/attach'],
  label: 'File',
  icon: Paperclip,
  hint: 'Add a file from this device',
  immediate: true,
  parseNow: none,
  parse: async (input) => none(input),
  write: async () => null,
  pick: (ctx) => pickFiles(ctx, { multiple: true }),
  enabled: inMainWindow,
}

const photo: CaptureDestination = {
  id: 'photo',
  sigil: '/photo',
  aliases: ['/camera', '/picture'],
  label: 'Photo',
  icon: Camera,
  hint: 'Take a photo',
  immediate: true,
  parseNow: none,
  parse: async (input) => none(input),
  write: async () => null,
  pick: (ctx) => pickFiles(ctx, { accept: 'image/*', capture: 'environment' }),
  enabled: inMainWindow,
}

export default [file, photo]
