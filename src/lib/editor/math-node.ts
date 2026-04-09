import { Node, mergeAttributes } from '@tiptap/core'

let katexModule: typeof import('katex') | null = null
async function loadKatex() {
  if (!katexModule) katexModule = await import('katex')
  return katexModule.default
}

function renderKatexSync(
  dom: HTMLElement,
  latex: string,
  displayMode: boolean,
) {
  loadKatex().then((katex) => {
    try {
      katex.render(latex, dom, {
        displayMode,
        throwOnError: false,
        output: 'html',
      })
    } catch {
      dom.textContent = displayMode ? `$$${latex}$$` : `$${latex}$`
    }
  })
}

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-latex') ?? '',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }]
  },

  renderHTML({ node }) {
    const latex = String(node.attrs.latex ?? '')
    return [
      'span',
      mergeAttributes({
        'data-type': 'math-inline',
        'data-latex': latex,
        class: 'math-inline',
      }),
      `$${latex}$`,
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.classList.add('math-inline')
      dom.setAttribute('data-type', 'math-inline')
      dom.setAttribute('data-latex', node.attrs.latex)
      dom.textContent = `$${node.attrs.latex}$`
      renderKatexSync(dom, node.attrs.latex, false)
      return { dom }
    }
  },
})

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-latex') ?? '',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }]
  },

  renderHTML({ node }) {
    const latex = String(node.attrs.latex ?? '')
    return [
      'div',
      mergeAttributes({
        'data-type': 'math-block',
        'data-latex': latex,
        class: 'math-block',
      }),
      `$$${latex}$$`,
    ]
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div')
      dom.classList.add('math-block')
      dom.setAttribute('data-type', 'math-block')
      dom.setAttribute('data-latex', node.attrs.latex)
      dom.textContent = `$$${node.attrs.latex}$$`
      renderKatexSync(dom, node.attrs.latex, true)
      return { dom }
    }
  },
})
