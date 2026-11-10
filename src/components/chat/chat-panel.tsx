import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Sparkles, Trash2, X } from 'lucide-react'

import { useVaultSession } from '@/contexts/vault-fs-context'
import { getChatKey, CHAT_KEY_CHANGED_EVENT } from '@/lib/chat/key-store'
import { providerNeedsApiKey } from '@/lib/chat/providers/meta'
import { useChatStore, selectActiveThread } from '@/stores/chat'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import { DEFAULT_CHAT_SETTINGS, type ChatSettings } from '@/types/chat'
import { HOME_VIEW } from '@/core/registries'
import { cn } from '@/utils/cn'

import { useContextWindow } from '@/lib/chat/use-context-window'
import { ContextMeter } from './context-meter'
import { SummaryMarker } from './summary-marker'
import { ModelPicker } from './model-picker'
import { ChatInput } from './chat-input'
import { ChatMessage } from './chat-message'

interface ChatPanelProps {
  /** Stable UUID under which threads live; mint one in parent if missing. */
  chatAssetId: string
  /** Path of the document the chat is scoped to. */
  documentPath: string
  /** Close the panel — typically toggles the editor column back to full width. */
  onClose?: () => void
  /** When true, render only a thin clickable header bar instead of the full UI. */
  collapsed?: boolean
  /** Called when the user clicks the collapsed bar to expand, or the header to collapse. */
  onCollapsedChange?: (collapsed: boolean) => void
}

function mergeSettings(from: ChatSettings | undefined): ChatSettings {
  return { ...DEFAULT_CHAT_SETTINGS, ...(from ?? {}) }
}

export function ChatPanel({
  chatAssetId,
  documentPath,
  onClose,
  collapsed = false,
  onCollapsedChange,
}: ChatPanelProps) {
  const { vaultFs, vaultPath, config: sessionConfig } = useVaultSession()
  // The open vault's live config: the session's copy is from when the vault opened.
  const vaultConfig = useVaultStore((s) => s.config)
  const chatSettings = vaultConfig?.chat ?? sessionConfig.chat
  const settings = useMemo(() => mergeSettings(chatSettings), [chatSettings])

  const openVaultPath = useCallback(
    async (path: string) => {
      useUiStore.getState().setActiveView(HOME_VIEW)
      useFileTreeStore.getState().setSelectedPath(path)
      useEditorStore.getState().addRecentFile(path)
      const { detectEditorTabType } = await import('@/lib/notes/editor-tab-from-path')
      const type = await detectEditorTabType(vaultFs, path)
      useEditorStore.getState().openTab({
        id: crypto.randomUUID(),
        path,
        type,
        title: path.split('/').pop() ?? path,
        isDirty: false,
      })
    },
    [vaultFs],
  )

  const threads = useChatStore((s) => s.threads)
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const error = useChatStore((s) => s.error)
  const openDocument = useChatStore((s) => s.openDocument)
  const closeDocument = useChatStore((s) => s.closeDocument)
  const selectThread = useChatStore((s) => s.selectThread)
  const createThread = useChatStore((s) => s.createThread)
  const deleteThread = useChatStore((s) => s.deleteThread)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const cancel = useChatStore((s) => s.cancel)

  const activeThread = useChatStore(selectActiveThread)

  const [apiKey, setApiKey] = useState<string | null>(null)
  const [keyChecked, setKeyChecked] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const contextWindow = useContextWindow(settings, keyChecked ? apiKey : null)
  const compacting = useChatStore((s) => s.compacting)

  // Load threads whenever the document changes.
  useEffect(() => {
    void openDocument({ vaultFs, chatAssetId, documentPath })
    return () => closeDocument()
    // chatAssetId is the stable id — documentPath is informational; reloading
    // on rename is fine because `openDocument` is idempotent.
  }, [vaultFs, chatAssetId, documentPath, openDocument, closeDocument])

  // Pull the API key for the configured provider; recheck when provider
  // changes or when the key-changed signal fires from settings.
  const [keyVersion, setKeyVersion] = useState(0)

  useEffect(() => {
    const handler = () => setKeyVersion((v) => v + 1)
    window.addEventListener(CHAT_KEY_CHANGED_EVENT, handler)
    return () => window.removeEventListener(CHAT_KEY_CHANGED_EVENT, handler)
  }, [])

  useEffect(() => {
    let cancelled = false
    setKeyChecked(false)
    if (!settings.provider) {
      setApiKey(null)
      setKeyChecked(true)
      return
    }
    // A local server needs no key; one is sent only if it was saved.
    const optional = !providerNeedsApiKey(settings.provider)
    void getChatKey(settings.provider, vaultPath)
      .then((rec) => {
        if (cancelled) return
        setApiKey(rec?.apiKey ?? (optional ? '' : null))
        setKeyChecked(true)
      })
      .catch(() => {
        if (cancelled) return
        setApiKey(optional ? '' : null)
        setKeyChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [settings.provider, vaultPath, keyVersion])

  // Autoscroll to bottom on new messages / streaming deltas.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [activeThread?.messages.length, activeThread?.modifiedAt, isStreaming])

  const handleSend = useCallback(
    (text: string) => {
      if (apiKey === null || !settings.provider) return
      void sendMessage({
        vaultFs,
        settings,
        apiKey,
        contextWindow,
        documentPath,
        input: text,
      })
    },
    [apiKey, settings, contextWindow, sendMessage, vaultFs, documentPath],
  )

  const handleNewThread = useCallback(async () => {
    if (isStreaming) return
    await createThread({ chatAssetId, documentPath })
  }, [isStreaming, createThread, chatAssetId, documentPath])

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      await deleteThread({ vaultFs, chatAssetId, threadId })
    },
    [deleteThread, vaultFs, chatAssetId],
  )

  // No provider, or one without a model yet: not set up.
  const providerMissing = !settings.provider || !settings.model
  const keyMissing = keyChecked && apiKey === null && !!settings.provider
  const composerDisabled = providerMissing || keyMissing || !activeThread

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onCollapsedChange?.(false)}
        className="border-border hover:bg-bg-hover flex w-full shrink-0 items-center gap-2 border-t px-3 py-2 text-left transition-colors"
        aria-expanded={false}
        aria-label="Expand chat"
      >
        <ChevronRight className="text-fg-muted size-3.5 shrink-0" aria-hidden />
        <Sparkles className="text-accent size-3.5 shrink-0" aria-hidden />
        <span className="text-fg-secondary min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide uppercase">
          Chat
        </span>
        {activeThread && activeThread.messages.length > 0 && (
          <span className="bg-accent/10 text-accent shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
            {activeThread.messages.length}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="bg-bg flex h-full min-h-0 w-full flex-col">
      <header className="border-border flex items-center justify-between gap-2 border-t px-3 py-2">
        <button
          type="button"
          onClick={() => onCollapsedChange?.(true)}
          className="flex items-center gap-2 text-left"
          aria-expanded={true}
          aria-label="Collapse chat"
        >
          <ChevronDown className="text-fg-muted size-3.5 shrink-0" aria-hidden />
          <Sparkles className="text-accent size-4" />
          <span className="text-fg text-sm font-medium">Chat</span>
        </button>
        <div className="flex items-center gap-1">
          <ModelPicker settings={settings} disabled={isStreaming} className="max-w-44" />
          <button
            type="button"
            onClick={handleNewThread}
            disabled={isStreaming}
            title="New chat"
            className="text-fg-secondary hover:bg-bg-hover hover:text-fg flex size-7 items-center justify-center rounded-md disabled:opacity-40"
          >
            <Plus className="size-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close chat"
              className="text-fg-secondary hover:bg-bg-hover hover:text-fg flex size-7 items-center justify-center rounded-md"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </header>

      {threads.length > 1 && (
        <nav className="border-border bg-bg flex shrink-0 items-center gap-1 overflow-x-auto border-b px-2 py-1.5">
          {threads.map((t) => (
            <div
              key={t.id}
              className={cn(
                'group flex items-center gap-1 rounded-md px-2 py-1 text-xs',
                t.id === activeThreadId
                  ? 'bg-accent/15 text-accent'
                  : 'text-fg-secondary hover:bg-bg-hover',
              )}
            >
              <button
                type="button"
                onClick={() => selectThread(t.id)}
                className="max-w-[140px] truncate"
                title={t.title}
              >
                {t.title || 'New chat'}
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteThread(t.id)}
                className="text-fg-muted hover:text-danger opacity-0 transition-opacity group-hover:opacity-100"
                title="Delete chat"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </nav>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-2">
        {!activeThread || activeThread.messages.length === 0 ? (
          <EmptyState providerMissing={providerMissing} keyMissing={keyMissing} />
        ) : (
          activeThread.messages.map((m) => (
            <Fragment key={m.id}>
              <ChatMessage message={m} onVaultPathOpen={openVaultPath} />
              {activeThread.summary?.upToMessageId === m.id && (
                <SummaryMarker summary={activeThread.summary} />
              )}
            </Fragment>
          ))
        )}
      </div>

      {compacting && (
        <div role="status" className="text-fg-muted px-3 py-1.5 text-xs">
          Summarising earlier messages…
        </div>
      )}
      {error && <div className="text-danger border-border border-t px-3 py-2 text-xs">{error}</div>}

      {!providerMissing && (
        <div className="flex justify-end px-3 pt-1.5">
          <ContextMeter
            messages={activeThread?.messages ?? []}
            summary={activeThread?.summary}
            window={contextWindow}
          />
        </div>
      )}

      <ChatInput
        disabled={composerDisabled}
        isStreaming={isStreaming}
        placeholder={
          providerMissing
            ? 'Choose a provider and model in Settings → AI'
            : keyMissing
              ? 'Add an API key in Settings → AI'
              : undefined
        }
        onSend={handleSend}
        onCancel={cancel}
      />
    </div>
  )
}

function EmptyState({
  providerMissing,
  keyMissing,
}: {
  providerMissing: boolean
  keyMissing: boolean
}) {
  return (
    <div className="text-fg-secondary flex h-full flex-col items-center justify-center px-6 py-12 text-center text-sm">
      <Sparkles className="text-accent/60 mb-3 size-8" />
      {providerMissing ? (
        <>
          <p className="font-medium">Chat isn&apos;t set up yet</p>
          <p className="text-fg-muted mt-1 text-xs">
            Choose a provider and model in Settings → AI to start asking questions about this
            document.
          </p>
        </>
      ) : keyMissing ? (
        <>
          <p className="font-medium">API key required</p>
          <p className="text-fg-muted mt-1 text-xs">
            Open Settings → AI and paste your key for this provider. Keys are stored locally in the
            browser, never synced.
          </p>
        </>
      ) : (
        <>
          <p className="font-medium">Ask about this document</p>
          <p className="text-fg-muted mt-1 text-xs">
            Answers are grounded in the open file&apos;s content. The model won&apos;t see the rest
            of your vault.
          </p>
        </>
      )}
    </div>
  )
}
