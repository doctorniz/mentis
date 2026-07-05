import { Node, mergeAttributes } from '@tiptap/core'

/**
 * Split the Obsidian-style pipe-width suffix out of an alt string:
 * `![cat photo|400](pic.png)` arrives from marked as alt="cat photo|400".
 * The suffix only counts as a width when it's all digits.
 */
export function splitAltWidth(rawAlt: string | null): { alt: string | null; width: number | null } {
  if (!rawAlt) return { alt: rawAlt, width: null }
  const m = rawAlt.match(/^(.*)\|(\d{2,4})$/)
  if (!m) return { alt: rawAlt, width: null }
  return { alt: m[1] || null, width: Number(m[2]) }
}

/**
 * Shared per-attribute parse config for both image node variants.
 * Attribute-level `parseHTML` (not a rule-level `getAttrs`) because
 * Tiptap's own attribute parsing overrides rule-level values.
 */
export function imageNodeAttributes() {
  return {
    src: { default: null as string | null },
    alt: {
      default: null as string | null,
      parseHTML: (el: HTMLElement) => splitAltWidth(el.getAttribute('alt')).alt,
    },
    title: { default: null as string | null },
    width: {
      default: null as number | null,
      parseHTML: (el: HTMLElement) => {
        const w = el.getAttribute('width')
        if (w) return Number(w) || null
        return splitAltWidth(el.getAttribute('alt')).width
      },
    },
  }
}

/**
 * Custom image node that stores vault-relative paths in the `src` attribute.
 * The actual rendering (blob URL resolution) is handled by a React NodeView
 * in the editor component — this node definition just ensures parseHTML/renderHTML
 * and the Tiptap schema are correct. `width` (px, optional) round-trips to
 * markdown as the pipe suffix `![alt|400](src)`.
 */
export const VaultImage = Node.create({
  name: 'image',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return imageNodeAttributes()
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)]
  },
})
