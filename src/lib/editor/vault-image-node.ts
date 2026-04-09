import { Node, mergeAttributes } from '@tiptap/core'

/**
 * Custom image node that stores vault-relative paths in the `src` attribute.
 * The actual rendering (blob URL resolution) is handled by a React NodeView
 * in the editor component — this node definition just ensures parseHTML/renderHTML
 * and the Tiptap schema are correct.
 */
export const VaultImage = Node.create({
  name: 'image',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)]
  },
})
