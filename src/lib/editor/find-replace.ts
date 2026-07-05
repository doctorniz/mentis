import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Node as PmNode } from '@tiptap/pm/model'

export type FindMatch = { from: number; to: number }

export type FindReplaceState = {
  term: string
  matches: FindMatch[]
  activeIndex: number
}

type FindMeta =
  | { type: 'set-term'; term: string; selectionFrom: number }
  | { type: 'set-active'; index: number }
  | { type: 'clear' }

export const findReplaceKey = new PluginKey<FindReplaceState>('inkFindReplace')

const EMPTY: FindReplaceState = { term: '', matches: [], activeIndex: 0 }

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Case-insensitive search across each textblock's inline content. Blocks
 * are matched on their joined text so a term spanning mark boundaries
 * (e.g. half-bold) still hits; block boundaries never match, which is
 * what a reader expects from "one line at a time" find.
 */
export function findMatches(doc: PmNode, term: string): FindMatch[] {
  if (!term) return []
  const re = new RegExp(escapeRegExp(term), 'gi')
  const results: FindMatch[] = []

  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true

    const segments: { text: string; from: number }[] = []
    node.descendants((child, childPos) => {
      if (child.isText && child.text) {
        segments.push({ text: child.text, from: pos + 1 + childPos })
      }
      return true
    })
    if (segments.length === 0) return false

    // Map an offset in the joined block text back to an absolute doc position.
    const mapOffset = (offset: number): number => {
      let consumed = 0
      for (const seg of segments) {
        if (offset <= consumed + seg.text.length) return seg.from + (offset - consumed)
        consumed += seg.text.length
      }
      const last = segments[segments.length - 1]!
      return last.from + last.text.length
    }

    const joined = segments.map((s) => s.text).join('')
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(joined))) {
      results.push({ from: mapOffset(m.index), to: mapOffset(m.index + m[0].length) })
      if (re.lastIndex === m.index) re.lastIndex++
    }
    return false
  })

  return results
}

/** Index of the first match at/after `pos`, wrapping to 0 — so opening find lands near the cursor. */
function nearestIndex(matches: FindMatch[], pos: number): number {
  const i = matches.findIndex((m) => m.from >= pos)
  return i === -1 ? 0 : i
}

function buildDecorations(doc: PmNode, state: FindReplaceState): DecorationSet {
  if (state.matches.length === 0) return DecorationSet.empty
  const decos = state.matches.map((m, i) =>
    Decoration.inline(m.from, m.to, {
      class: i === state.activeIndex ? 'find-match find-match-active' : 'find-match',
    }),
  )
  return DecorationSet.create(doc, decos)
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inkFindReplace: {
      /** Set (or update) the search term; matches recompute and the nearest one activates. */
      setFindTerm: (term: string) => ReturnType
      /** Move to the next/previous match, select it, and scroll it into view. */
      findNext: () => ReturnType
      findPrev: () => ReturnType
      /** Replace the active match, keeping the same index so "replace, replace…" walks forward. */
      replaceActive: (replacement: string) => ReturnType
      replaceAllMatches: (replacement: string) => ReturnType
      /** Drop the term, matches, and decorations. */
      clearFind: () => ReturnType
    }
  }
}

export const FindReplace = Extension.create({
  name: 'inkFindReplace',

  addCommands() {
    const move = (dir: 1 | -1) => {
      return ({
        state,
        tr,
        dispatch,
      }: {
        state: EditorState
        tr: Transaction
        dispatch?: (tr: Transaction) => void
      }) => {
        const fr = findReplaceKey.getState(state)
        if (!fr || fr.matches.length === 0) return false
        if (dispatch) {
          const index = (fr.activeIndex + dir + fr.matches.length) % fr.matches.length
          const match = fr.matches[index]!
          tr.setMeta(findReplaceKey, { type: 'set-active', index } satisfies FindMeta)
          tr.setSelection(TextSelection.create(tr.doc, match.from, match.to))
          tr.scrollIntoView()
          dispatch(tr)
        }
        return true
      }
    }

    return {
      setFindTerm:
        (term) =>
        ({ state, tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findReplaceKey, {
              type: 'set-term',
              term,
              selectionFrom: state.selection.from,
            } satisfies FindMeta)
            // Scroll the activated match into view without moving the caret;
            // the state isn't applied yet, so compute the target directly.
            const matches = findMatches(state.doc, term)
            if (matches.length > 0) {
              const match = matches[nearestIndex(matches, state.selection.from)]!
              tr.setSelection(TextSelection.create(tr.doc, match.from, match.to))
              tr.scrollIntoView()
            }
            dispatch(tr)
          }
          return true
        },

      findNext: () => move(1),
      findPrev: () => move(-1),

      replaceActive:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const fr = findReplaceKey.getState(state)
          const match = fr?.matches[fr.activeIndex]
          if (!fr || !match) return false
          if (dispatch) {
            tr.insertText(replacement, match.from, match.to)
            tr.scrollIntoView()
            dispatch(tr)
          }
          return true
        },

      replaceAllMatches:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const fr = findReplaceKey.getState(state)
          if (!fr || fr.matches.length === 0) return false
          if (dispatch) {
            // Replace back-to-front so earlier match positions stay valid.
            for (let i = fr.matches.length - 1; i >= 0; i--) {
              const m = fr.matches[i]!
              tr.insertText(replacement, m.from, m.to)
            }
            dispatch(tr)
          }
          return true
        },

      clearFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findReplaceKey, { type: 'clear' } satisfies FindMeta)
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<FindReplaceState>({
        key: findReplaceKey,
        state: {
          init: () => EMPTY,
          apply(tr, prev) {
            const meta = tr.getMeta(findReplaceKey) as FindMeta | undefined
            if (meta) {
              switch (meta.type) {
                case 'set-term': {
                  const matches = findMatches(tr.doc, meta.term)
                  return {
                    term: meta.term,
                    matches,
                    activeIndex: nearestIndex(matches, meta.selectionFrom),
                  }
                }
                case 'set-active':
                  return { ...prev, activeIndex: meta.index }
                case 'clear':
                  return EMPTY
              }
            }
            if (tr.docChanged && prev.term) {
              const matches = findMatches(tr.doc, prev.term)
              return {
                term: prev.term,
                matches,
                activeIndex: Math.min(prev.activeIndex, Math.max(0, matches.length - 1)),
              }
            }
            return prev
          },
        },
        props: {
          decorations(state) {
            const fr = findReplaceKey.getState(state)
            return fr ? buildDecorations(state.doc, fr) : DecorationSet.empty
          },
        },
      }),
    ]
  },
})
