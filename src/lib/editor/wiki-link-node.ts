import { Node, mergeAttributes } from '@tiptap/core'

/** Inline `[[target]]` / `[[target|label]]` (Obsidian-style). */
export const WikiLinkNode = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      target: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-target') ?? '',
      },
      label: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-label') ?? '',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="wiki-link"]',
        getAttrs: (el) => {
          const node = el as HTMLElement
          const target = node.getAttribute('data-target') ?? ''
          const label = node.getAttribute('data-label') ?? target
          return { target, label }
        },
      },
    ]
  },

  renderHTML({ node }) {
    const target = String(node.attrs.target ?? '')
    const label = String(node.attrs.label || target)
    return [
      'span',
      mergeAttributes({
        'data-type': 'wiki-link',
        'data-target': target,
        'data-label': label,
        class: 'wiki-link',
      }),
      label,
    ]
  },
})
