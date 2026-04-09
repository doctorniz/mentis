import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import { Suggestion } from '@tiptap/suggestion'
import type { SuggestionProps } from '@tiptap/suggestion'
import { SlashCommandList } from '@/components/notes/slash-command-list'
import type { SlashItem } from '@/lib/editor/slash-items'
import { filterSlashItems } from '@/lib/editor/slash-items'

export const inkSlashPluginKey = new PluginKey('inkSlash')

export type { SlashItem } from '@/lib/editor/slash-items'

function placeSlashMenu(
  el: HTMLElement,
  clientRect: SuggestionProps<SlashItem, SlashItem>['clientRect'],
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

export const inkSlashCommands = Extension.create({
  name: 'inkSlashCommands',

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      Suggestion<SlashItem, SlashItem>({
        pluginKey: inkSlashPluginKey,
        editor,
        char: '/',
        allowedPrefixes: [' ', '\n'],
        allowSpaces: false,
        command: ({ editor, range, props }) => {
          props.command({ editor, range })
        },
        items: ({ query }) => filterSlashItems(query),
        render: () => {
          let renderer: ReactRenderer | null = null

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashCommandList, {
                editor: props.editor,
                props,
                className:
                  'border-border-strong bg-bg max-h-72 overflow-y-auto rounded-lg border py-1 text-sm shadow-lg',
              })
              document.body.append(renderer.element)
              placeSlashMenu(renderer.element as HTMLElement, props.clientRect)
            },

            onUpdate(props) {
              renderer?.updateProps(props)
              if (renderer?.element) {
                placeSlashMenu(renderer.element as HTMLElement, props.clientRect)
              }
            },

            onKeyDown({ event }) {
              if (event.key === 'Escape') {
                return true
              }
              const handler = renderer?.ref as
                | { onSlashKeyDown: (e: KeyboardEvent) => boolean }
                | null
                | undefined
              if (handler?.onSlashKeyDown) {
                return handler.onSlashKeyDown(event)
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
