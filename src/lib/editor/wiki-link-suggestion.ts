import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import { Suggestion } from '@tiptap/suggestion'
import type { SuggestionProps } from '@tiptap/suggestion'
import { WikiLinkList } from '@/components/notes/wiki-link-list'
import { findWikiLinkSuggestionMatch } from '@/lib/editor/find-wiki-suggestion-match'
import type { WikiLinkPick } from '@/lib/editor/wiki-link-types'

export const inkWikiLinkPluginKey = new PluginKey('inkWikiLink')

export type { WikiLinkPick } from '@/lib/editor/wiki-link-types'

function filterWikiCandidates(
  paths: string[],
  query: string,
  selfPath?: string,
): WikiLinkPick[] {
  const q = query.trim().toLowerCase()
  return paths
    .filter((p) => p !== selfPath)
    .map((path) => {
      const title = path.replace(/\.md$/i, '').split('/').pop() ?? path
      return {
        path,
        title,
        target: title,
        label: title,
      }
    })
    .filter(
      ({ title, path }) =>
        !q ||
        title.toLowerCase().includes(q) ||
        path.toLowerCase().includes(q.replace(/\s+/g, '-')),
    )
    .slice(0, 30)
}

function placeWikiMenu(
  el: HTMLElement,
  clientRect: SuggestionProps<WikiLinkPick, WikiLinkPick>['clientRect'],
) {
  const rect = clientRect?.()
  if (!rect) return
  const w = 280
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8))
  el.style.position = 'fixed'
  el.style.zIndex = '100'
  el.style.width = `${w}px`
  el.style.left = `${left}px`
  el.style.top = `${rect.bottom + 4}px`
}

export function createInkWikiLinkSuggestion(options: {
  getMarkdownPaths: () => string[]
  currentNotePath?: () => string | null
}) {
  return Extension.create({
    name: 'inkWikiLinkSuggestion',

    addProseMirrorPlugins() {
      const editor = this.editor
      const getPaths = options.getMarkdownPaths
      const currentPath = options.currentNotePath ?? (() => null)

      return [
        Suggestion<WikiLinkPick, WikiLinkPick>({
          pluginKey: inkWikiLinkPluginKey,
          editor,
          char: '[',
          allowSpaces: false,
          allowedPrefixes: null,
          allow: ({ state, range }) => {
            const end = range.from + 2
            if (end > state.doc.content.size || range.from < 0) return false
            return state.doc.textBetween(range.from, end) === '[['
          },
          findSuggestionMatch: findWikiLinkSuggestionMatch,
          command: ({ editor: ed, range, props }) => {
            ed.chain()
              .focus()
              .deleteRange(range)
              .insertContent({
                type: 'wikiLink',
                attrs: { target: props.target, label: props.label },
              })
              .run()
          },
          items: ({ query }) =>
            filterWikiCandidates(getPaths(), query, currentPath() ?? undefined),
          render: () => {
            let renderer: ReactRenderer | null = null
            return {
              onStart: (props) => {
                renderer = new ReactRenderer(WikiLinkList, {
                  editor: props.editor,
                  props,
                  className:
                    'border-border-strong bg-bg max-h-72 overflow-y-auto rounded-lg border py-1 text-sm shadow-lg',
                })
                document.body.append(renderer.element)
                placeWikiMenu(renderer.element as HTMLElement, props.clientRect)
              },
              onUpdate(props) {
                renderer?.updateProps(props)
                if (renderer?.element) {
                  placeWikiMenu(renderer.element as HTMLElement, props.clientRect)
                }
              },
              onKeyDown({ event }) {
                if (event.key === 'Escape') return true
                const handler = renderer?.ref as
                  | { onWikiLinkKeyDown: (e: KeyboardEvent) => boolean }
                  | null
                  | undefined
                if (handler?.onWikiLinkKeyDown) {
                  return handler.onWikiLinkKeyDown(event)
                }
                return false
              },
              onExit() {
                renderer?.element.remove()
                renderer?.destroy()
                renderer = null
              },
            }
          },
        }),
      ]
    },
  })
}
