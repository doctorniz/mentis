import { Node, mergeAttributes } from '@tiptap/core'

/**
 * Schema-only PDF embed node for the markdown bridge.
 * Stores the vault-relative file path and page specifier (single or range).
 */
export const PdfEmbedNode = Node.create({
  name: 'pdfEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      file: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-file'),
        renderHTML: (attrs) => ({ 'data-file': attrs.file }),
      },
      page: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-page'),
        renderHTML: (attrs) => ({ 'data-page': attrs.page }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="pdf-embed"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'pdf-embed' }),
      `![[${HTMLAttributes['data-file']}#page=${HTMLAttributes['data-page']}]]`,
    ]
  },
})
