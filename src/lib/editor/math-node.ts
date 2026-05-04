import { Node, mergeAttributes } from '@tiptap/core'

let katexModule: typeof import('katex') | null = null
async function loadKatex() {
  if (!katexModule) katexModule = await import('katex')
  return katexModule.default
}

function renderKatexInto(
  dom: HTMLElement,
  latex: string,
  displayMode: boolean,
) {
  loadKatex().then((katex) => {
    try {
      katex.render(latex || (displayMode ? '\\square' : '\\square'), dom, {
        displayMode,
        throwOnError: false,
        output: 'html',
      })
    } catch {
      dom.textContent = displayMode ? `$$${latex}$$` : `$${latex}$`
    }
  })
}

/**
 * Builds an interactive node view for a math atom.
 * Clicking on the rendered KaTeX switches to an inline edit input/textarea.
 * Enter (inline) or Ctrl+Enter (block) commits; Escape cancels.
 */
function makeMathNodeView(displayMode: boolean) {
  return ({
    node: initialNode,
    getPos,
    editor,
  }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node: any
    getPos: () => number | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor: any
  }) => {
    let currentLatex = String(initialNode.attrs.latex ?? '')
    let editing = false

    const tag = displayMode ? 'div' : 'span'

    const wrapper = document.createElement(tag)
    wrapper.classList.add(displayMode ? 'math-block' : 'math-inline')
    wrapper.setAttribute('data-type', displayMode ? 'math-block' : 'math-inline')
    wrapper.setAttribute('data-latex', currentLatex)
    wrapper.title = 'Click to edit'
    wrapper.style.cursor = 'pointer'

    const renderEl = document.createElement(tag)
    renderEl.classList.add('math-render')
    wrapper.appendChild(renderEl)

    function render(latex: string) {
      renderEl.innerHTML = ''
      renderKatexInto(renderEl, latex, displayMode)
    }
    render(currentLatex)

    let inputEl: HTMLInputElement | HTMLTextAreaElement | null = null

    function startEditing() {
      if (editing || !editor.isEditable) return
      editing = true
      wrapper.setAttribute('data-editing', 'true')
      wrapper.title = ''
      wrapper.style.cursor = 'default'

      renderEl.style.display = 'none'

      if (displayMode) {
        const ta = document.createElement('textarea')
        ta.value = currentLatex
        ta.rows = Math.max(2, currentLatex.split('\n').length)
        ta.placeholder = 'Enter LaTeX… (Ctrl+Enter to confirm)'
        ta.className =
          'math-edit-input math-edit-textarea font-mono text-sm w-full rounded border border-accent/40 bg-bg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50 resize-y'
        ta.style.minWidth = '16rem'
        inputEl = ta
      } else {
        const inp = document.createElement('input')
        inp.type = 'text'
        inp.value = currentLatex
        inp.placeholder = 'Enter LaTeX… (Enter to confirm)'
        inp.className =
          'math-edit-input font-mono text-sm rounded border border-accent/40 bg-bg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent/50'
        inp.style.minWidth = '10rem'
        inputEl = inp
      }

      wrapper.appendChild(inputEl)

      requestAnimationFrame(() => {
        if (inputEl instanceof HTMLInputElement) {
          inputEl.select()
        }
        inputEl?.focus()
      })

      function commit() {
        if (!editing) return
        editing = false
        wrapper.removeAttribute('data-editing')
        wrapper.title = 'Click to edit'
        wrapper.style.cursor = 'pointer'
        const newLatex = inputEl!.value.trim()
        inputEl!.remove()
        inputEl = null
        renderEl.style.display = ''
        currentLatex = newLatex
        render(newLatex)

        const pos = getPos()
        if (pos !== undefined) {
          const tr = editor.state.tr.setNodeMarkup(pos, undefined, { latex: newLatex })
          editor.view.dispatch(tr)
        }
        // Return focus to editor after commit
        editor.commands.focus()
      }

      function cancel() {
        if (!editing) return
        editing = false
        wrapper.removeAttribute('data-editing')
        wrapper.title = 'Click to edit'
        wrapper.style.cursor = 'pointer'
        inputEl!.remove()
        inputEl = null
        renderEl.style.display = ''
        render(currentLatex)
        editor.commands.focus()
      }

      inputEl.addEventListener('keydown', (e) => {
        const ke = e as KeyboardEvent
        if (ke.key === 'Escape') {
          ke.preventDefault()
          ke.stopPropagation()
          cancel()
          return
        }
        if (ke.key === 'Enter') {
          if (!displayMode) {
            ke.preventDefault()
            ke.stopPropagation()
            commit()
          } else if (ke.ctrlKey || ke.metaKey) {
            ke.preventDefault()
            ke.stopPropagation()
            commit()
          }
        }
      })

      inputEl.addEventListener('blur', () => {
        // Small delay to allow Escape keydown to fire first
        setTimeout(() => {
          if (editing) commit()
        }, 80)
      })
    }

    wrapper.addEventListener('click', (e) => {
      e.stopPropagation()
      startEditing()
    })

    return {
      dom: wrapper,

      update(newNode: { type: { name: string }; attrs: Record<string, unknown> }) {
        if (newNode.type.name !== initialNode.type.name) return false
        const newLatex = String(newNode.attrs['latex'] ?? '')
        wrapper.setAttribute('data-latex', newLatex)
        if (!editing) {
          currentLatex = newLatex
          render(newLatex)
        }
        return true
      },

      stopEvent(event: Event) {
        // While editing, absorb all events so Tiptap doesn't steal keystrokes
        if (!editing) return false
        return event.target === inputEl
      },

      ignoreMutation() {
        // Mutations from KaTeX rendering / edit input are internal — don't re-parse
        return true
      },
    }
  }
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
    return makeMathNodeView(false)
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
    return makeMathNodeView(true)
  },
})
