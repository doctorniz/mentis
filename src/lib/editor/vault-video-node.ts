import { Node, mergeAttributes } from '@tiptap/core'

/**
 * Static vault-video node — used by the markdown bridge and server-side
 * HTML generation. Renders as a `<div data-type="vault-video">` placeholder.
 * For live editing use VaultVideoExtension (React node view).
 */
export const VaultVideo = Node.create({
  name: 'vaultVideo',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-src') ?? null,
      },
      title: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-title') ?? null,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="vault-video"]' }]
  },

  renderHTML({ node }) {
    return [
      'div',
      mergeAttributes({
        'data-type': 'vault-video',
        'data-src': node.attrs.src ?? '',
        'data-title': node.attrs.title ?? '',
        class: 'vault-video-placeholder',
      }),
      node.attrs.src ?? '',
    ]
  },
})
