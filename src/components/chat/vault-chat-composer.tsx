'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { ChevronDown, Plus, Send, Square } from 'lucide-react'

import type { ModelEntry } from '@/lib/chat/providers/model-catalog'
import { cn } from '@/utils/cn'

const MAX_HEIGHT = 200

export type VaultChatComposerHandle = {
  insertText: (snippet: string) => void
}

export interface VaultChatComposerProps {
  disabled?: boolean
  isStreaming: boolean
  placeholder?: string
  onSend: (text: string) => void
  onCancel: () => void
  /** Pick images (or other); parent saves to vault and updates the textarea. */
  onAttachFiles?: (files: FileList) => void | Promise<void>
  modelSelect?: {
    value: string
    options: ModelEntry[]
    onChange: (modelId: string) => void
    disabled?: boolean
  }
  /** `footer` = docked bar with top border; `center` = used in empty-state stack (no bar border). */
  layout?: 'footer' | 'center'
}

/**
 * Rounded composer with a separate footer row (+ attach, model, send).
 */
export const VaultChatComposer = forwardRef<
  VaultChatComposerHandle,
  VaultChatComposerProps
>(function VaultChatComposer(
  {
    disabled = false,
    isStreaming,
    placeholder,
    onSend,
    onCancel,
    onAttachFiles,
    modelSelect,
    layout = 'footer',
  },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState('')

  useImperativeHandle(ref, () => ({
    insertText: (snippet) => {
      setValue((v) => {
        const prefix = v.length === 0 || v.endsWith('\n') ? '' : '\n'
        return `${v}${prefix}${snippet}\n`
      })
    },
  }))

  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el
    },
    [],
  )

  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  const submit = useCallback(() => {
    const text = value.trim()
    if (!text || disabled || isStreaming) return
    onSend(text)
    setValue('')
  }, [value, disabled, isStreaming, onSend])

  const busy = disabled || isStreaming

  return (
    <div
      className={cn(
        'bg-bg shrink-0',
        layout === 'footer' && 'border-border border-t px-3 py-3 md:px-4',
        layout === 'center' && 'w-full max-w-3xl px-0 py-0',
      )}
    >
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept="image/*"
        multiple
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0 && onAttachFiles) {
            void onAttachFiles(files)
          }
          e.currentTarget.value = ''
        }}
      />
      <div
        className={cn(
          'border-border mx-auto max-w-3xl rounded-[1.75rem] border bg-bg-secondary/80 px-3.5 pt-3 pb-2',
          'shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-none',
        )}
      >
        <textarea
          ref={setRefs}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape' && isStreaming) {
              e.preventDefault()
              onCancel()
            }
          }}
          rows={2}
          placeholder={placeholder ?? 'Ask your vault anything'}
          disabled={busy}
          className={cn(
            'text-fg placeholder:text-fg-muted w-full resize-none bg-transparent font-sans text-[12pt] leading-relaxed outline-none',
            'min-h-[3.25rem] disabled:cursor-not-allowed disabled:opacity-45',
          )}
          style={{ maxHeight: `${MAX_HEIGHT}px` }}
        />
        <div className="mt-2 flex items-center gap-2 pt-1">
          <button
            type="button"
            disabled={busy || !onAttachFiles}
            onClick={() => fileRef.current?.click()}
            title="Add image"
            className={cn(
              'text-fg-secondary hover:bg-bg-hover flex size-9 items-center justify-center rounded-full transition-colors',
              'disabled:pointer-events-none disabled:opacity-35',
            )}
            aria-label="Add image"
          >
            <Plus className="size-5 stroke-[1.75]" aria-hidden />
          </button>

          {modelSelect && modelSelect.options.length > 0 ? (
            <div className="relative min-w-0">
              <select
                value={modelSelect.value}
                disabled={busy || modelSelect.disabled}
                onChange={(e) => modelSelect.onChange(e.target.value)}
                className={cn(
                  'text-fg-secondary appearance-none rounded-lg py-1.5 pr-7 pl-2 font-sans text-[12pt] outline-none',
                  'hover:bg-bg-hover border-border bg-transparent border disabled:opacity-40',
                )}
                aria-label="Model"
              >
                {modelSelect.options.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="text-fg-muted pointer-events-none absolute top-1/2 right-1.5 size-4 -translate-y-1/2" />
            </div>
          ) : (
            <span className="min-w-4 flex-1" />
          )}

          <div className="ml-auto flex items-center gap-2">
            {isStreaming ? (
              <button
                type="button"
                onClick={onCancel}
                className="bg-danger text-accent-fg flex size-9 items-center justify-center rounded-full transition-opacity hover:opacity-90"
                title="Stop (Esc)"
                aria-label="Stop generating"
              >
                <Square className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={busy || value.trim().length === 0}
                className={cn(
                  'flex size-10 items-center justify-center rounded-full transition-opacity',
                  'border-border bg-bg-muted text-fg border',
                  'hover:opacity-95 disabled:opacity-35',
                )}
                title="Send"
                aria-label="Send"
              >
                <Send className="size-[1.15rem]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
