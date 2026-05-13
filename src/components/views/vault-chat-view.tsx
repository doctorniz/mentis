'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Copy,
  Download,
  Loader2,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from 'lucide-react'

import {
  VaultChatComposer,
  type VaultChatComposerHandle,
} from '@/components/chat/vault-chat-composer'
import { VaultChatMessage } from '@/components/chat/vault-chat-message'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { saveVaultChatUpload } from '@/lib/chat/chat-io'
import {
  ensureDeviceModelDownloaded,
  getDeviceModelStatus,
  type DeviceModelStatus,
} from '@/lib/chat/device-model-store'
import { formatUnknownError } from '@/lib/chat/format-chat-error'
import { getChatKey, CHAT_KEY_CHANGED_EVENT } from '@/lib/chat/key-store'
import {
  fetchModels,
  getCuratedModels,
  providerNeedsApiKey,
} from '@/lib/chat/providers/model-catalog'
import {
  chatModelDisplayLabel,
  chatProviderLabel,
  sanitizeExportBasename,
  threadToMarkdown,
  vaultChatGreeting,
} from '@/lib/chat/vault-chat-ui'
import {
  readVaultChatSidebarWidth,
  writeVaultChatSidebarWidth,
  readVaultChatSidebarCollapsed,
  writeVaultChatSidebarCollapsed,
  VAULT_CHAT_SIDEBAR,
} from '@/lib/chat/vault-chat-session'
import { saveVaultConfig } from '@/lib/vault'
import {
  useVaultChatStore,
  selectActiveVaultThread,
} from '@/stores/vault-chat'
import { useEditorStore } from '@/stores/editor'
import { useFileTreeStore } from '@/stores/file-tree'
import { useUiStore } from '@/stores/ui'
import { useVaultStore } from '@/stores/vault'
import type { VaultConfig } from '@/types/vault'
import { toast } from '@/stores/toast'
import {
  DEFAULT_CHAT_SETTINGS,
  type ChatMessage as ChatMessageT,
  type ChatSettings,
  type ChatThread,
} from '@/types/chat'
import { ViewMode } from '@/types/vault'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

function mergeSettings(from: ChatSettings | undefined): ChatSettings {
  return { ...DEFAULT_CHAT_SETTINGS, ...(from ?? {}) }
}

function threadMatchesSettings(
  thread: ChatThread | null | undefined,
  settings: ChatSettings,
): boolean {
  if (!thread?.chatBinding || !settings.provider) return true
  return (
    thread.chatBinding.provider === settings.provider &&
    thread.chatBinding.model === settings.model
  )
}

function ChatThreadsSidebarBody({
  searchQuery,
  onSearchChange,
  threadsAll,
  activeThreadId,
  isStreaming,
  onNewChat,
  onSelect,
  onDelete,
  onToggleFavourite,
  onRequestCollapse,
}: {
  searchQuery: string
  onSearchChange: (q: string) => void
  threadsAll: ChatThread[]
  activeThreadId: string | null
  isStreaming: boolean
  onNewChat: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onToggleFavourite: (id: string) => void
  onRequestCollapse?: () => void
}) {
  const q = searchQuery.trim().toLowerCase()
  const pool = useMemo(
    () =>
      q
        ? threadsAll.filter((t) => t.title.toLowerCase().includes(q))
        : threadsAll,
    [threadsAll, q],
  )

  const favourites = useMemo(
    () =>
      pool
        .filter((t) => t.favouritedAt)
        .sort((a, b) => (b.favouritedAt ?? '').localeCompare(a.favouritedAt ?? '')),
    [pool],
  )

  const recent = useMemo(
    () =>
      pool
        .filter((t) => !t.favouritedAt)
        .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
        .slice(0, 20),
    [pool],
  )

  function ThreadRow({ t }: { t: ChatThread }) {
    const active = t.id === activeThreadId
    const starred = Boolean(t.favouritedAt)
    return (
      <div
        className={cn(
          'group mx-1 flex items-center gap-1 rounded-md px-2 py-1 transition-colors',
          active
            ? 'bg-accent/10 text-accent font-medium'
            : 'text-fg hover:bg-bg-hover',
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(t.id)}
          className="min-w-0 flex-1 truncate py-0.5 text-left text-[13px]"
          title={t.title}
        >
          {t.title || 'New chat'}
        </button>
        <button
          type="button"
          onClick={() => onToggleFavourite(t.id)}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md transition-colors',
            starred
              ? 'text-amber-500'
              : 'text-fg-muted opacity-0 hover:text-amber-600 group-hover:opacity-100',
          )}
          title={starred ? 'Unfavourite' : 'Favourite'}
          aria-label={starred ? 'Unfavourite' : 'Favourite'}
        >
          <Star className={cn('size-3', starred && 'fill-current')} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(t.id)}
          disabled={isStreaming}
          className="text-fg-muted hover:text-danger flex size-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-30"
          title="Delete"
        >
          <Trash2 className="size-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — matches vault tree header */}
      <div className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {onRequestCollapse && (
            <Button
              variant="ghost"
              size="sm"
              className="text-fg-muted hover:text-fg size-7 shrink-0 p-0"
              onClick={onRequestCollapse}
              aria-label="Collapse chat list"
              title="Collapse chat list"
            >
              <PanelLeftClose className="size-3.5" />
            </Button>
          )}
          <span className="text-fg truncate text-xs font-semibold tracking-wide uppercase">
            Chat
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-fg-muted hover:text-fg size-7 shrink-0 p-0"
          onClick={() => void onNewChat()}
          disabled={isStreaming}
          aria-label="New chat"
          title="New chat"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      {/* New chat row */}
      <button
        type="button"
        onClick={() => void onNewChat()}
        disabled={isStreaming}
        className="text-fg-secondary hover:bg-bg-hover mx-1 mt-1.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium disabled:opacity-40"
      >
        <Plus className="size-3.5 shrink-0" />
        New chat
      </button>

      {/* Search row */}
      <div className="border-border mx-2 mt-1.5 mb-2 flex items-center gap-2 rounded-md border px-2 py-1">
        <Search className="text-fg-muted size-3.5 shrink-0" />
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search chats"
          className="text-fg placeholder:text-fg-muted min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          aria-label="Search chats"
        />
      </div>

      {/* Thread lists */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
        <div className="text-fg-muted px-3 pb-1 pt-1.5 text-[10px] font-semibold tracking-widest uppercase">
          Favourites
        </div>
        {favourites.length === 0 ? (
          <p className="text-fg-muted/60 px-3 pb-2 text-xs">None yet.</p>
        ) : (
          <div className="mb-2 flex flex-col">
            {favourites.map((t) => (
              <ThreadRow key={t.id} t={t} />
            ))}
          </div>
        )}
        <div className="text-fg-muted px-3 pb-1 pt-1.5 text-[10px] font-semibold tracking-widest uppercase">
          Recent
        </div>
        {recent.length === 0 ? (
          <p className="text-fg-muted/60 px-3 text-xs">No chats.</p>
        ) : (
          <div className="flex flex-col pb-2">
            {recent.map((t) => (
              <ThreadRow key={t.id} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Tier-1 whole-vault chat. Thread list + main transcript; see `stores/vault-chat`.
 */
export function VaultChatView() {
  const { vaultFs, vaultPath, config: sessionConfig } = useVaultSession()
  const vaultConfig = useVaultStore((s) => s.config)
  const updateVaultConfig = useVaultStore((s) => s.updateConfig)

  const settings = useMemo(
    () => mergeSettings(vaultConfig?.chat ?? sessionConfig.chat),
    [vaultConfig?.chat, sessionConfig.chat],
  )

  const threads = useVaultChatStore((s) => s.threads)
  const activeThreadId = useVaultChatStore((s) => s.activeThreadId)
  const isStreaming = useVaultChatStore((s) => s.isStreaming)
  const error = useVaultChatStore((s) => s.error)
  const initialized = useVaultChatStore((s) => s.initialized)
  const init = useVaultChatStore((s) => s.init)
  const selectThread = useVaultChatStore((s) => s.selectThread)
  const createThread = useVaultChatStore((s) => s.createThread)
  const deleteThread = useVaultChatStore((s) => s.deleteThread)
  const toggleFavourite = useVaultChatStore((s) => s.toggleFavourite)
  const sendMessage = useVaultChatStore((s) => s.sendMessage)
  const cancel = useVaultChatStore((s) => s.cancel)
  const activeThread = useVaultChatStore(selectActiveVaultThread)

  const [apiKey, setApiKey] = useState<string | null>(null)
  const [keyChecked, setKeyChecked] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [deviceStatus, setDeviceStatus] = useState<DeviceModelStatus>('missing')
  const [deviceBusy, setDeviceBusy] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<{ id: string; label: string }[]>(
    [],
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<VaultChatComposerHandle>(null)
  const resizeStartRef = useRef<{ x: number; w: number }>({
    x: 0,
    w: VAULT_CHAT_SIDEBAR.default,
  })

  const [sidebarWidth, setSidebarWidth] = useState<number>(VAULT_CHAT_SIDEBAR.default)
  const [sidebarResizing, setSidebarResizing] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    setSidebarWidth(readVaultChatSidebarWidth(vaultPath))
    setSidebarCollapsed(readVaultChatSidebarCollapsed())
  }, [vaultPath])

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      writeVaultChatSidebarCollapsed(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (!sidebarResizing) return
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (e: MouseEvent) => {
      const d = resizeStartRef.current
      const next = Math.max(
        VAULT_CHAT_SIDEBAR.min,
        Math.min(VAULT_CHAT_SIDEBAR.max, d.w + e.clientX - d.x),
      )
      setSidebarWidth(next)
    }
    const onUp = () => {
      setSidebarResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setSidebarWidth((w) => {
        writeVaultChatSidebarWidth(vaultPath, w)
        return w
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [sidebarResizing, vaultPath])

  useEffect(() => {
    void init({ vaultFs, vaultPath })
  }, [vaultFs, vaultPath, init])

  useEffect(() => {
    if (!activeThread?.messages.length) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [activeThread?.messages.length, activeThread?.modifiedAt, isStreaming])

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
    if (!providerNeedsApiKey(settings.provider)) {
      setApiKey('__local__')
      setKeyChecked(true)
      return
    }
    void getChatKey(settings.provider, vaultPath)
      .then((rec) => {
        if (cancelled) return
        setApiKey(rec?.apiKey ?? null)
        setKeyChecked(true)
      })
      .catch(() => {
        if (cancelled) return
        setApiKey(null)
        setKeyChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [settings.provider, vaultPath, keyVersion])

  useEffect(() => {
    if (settings.provider !== 'device') {
      setDeviceStatus('ready')
      return
    }
    void getDeviceModelStatus(settings.model).then(setDeviceStatus)
  }, [settings.provider, settings.model])

  useEffect(() => {
    if (settings.provider !== 'ollama') {
      setOllamaModels([])
      return
    }
    let cancelled = false
    void fetchModels('ollama', '', settings.baseUrl)
      .then((rows) => {
        if (!cancelled) setOllamaModels(rows)
      })
      .catch(() => {
        if (!cancelled) setOllamaModels([])
      })
    return () => {
      cancelled = true
    }
  }, [settings.provider, settings.baseUrl])

  const providerMissing = !settings.provider
  const keyMissing =
    keyChecked && !apiKey && !!settings.provider && providerNeedsApiKey(settings.provider)
  const deviceNeedsModel =
    settings.provider === 'device' && deviceStatus === 'missing'
  const bindingMismatch = !threadMatchesSettings(activeThread, settings)

  const composerDisabled =
    providerMissing ||
    keyMissing ||
    !activeThread ||
    !initialized ||
    deviceNeedsModel ||
    bindingMismatch

  const displayBinding = activeThread?.chatBinding
  const headerProviderId = displayBinding?.provider ?? settings.provider
  const headerModelId = displayBinding?.model ?? settings.model
  const headerHasPair = Boolean(headerProviderId && headerModelId)
  const headerProviderLabel = chatProviderLabel(headerProviderId)
  const headerModelLabel =
    headerProviderId && headerModelId
      ? chatModelDisplayLabel(headerProviderId, headerModelId)
      : '—'

  const modelOptions = useMemo(() => {
    if (!settings.provider) return []
    const curated = getCuratedModels(settings.provider)
    let opts =
      curated.length > 0
        ? [...curated]
        : settings.provider === 'ollama' && ollamaModels.length > 0
          ? [...ollamaModels]
          : settings.model
            ? [{ id: settings.model, label: settings.model }]
            : []
    if (
      settings.model &&
      opts.length > 0 &&
      !opts.some((m) => m.id === settings.model)
    ) {
      opts = [...opts, { id: settings.model, label: settings.model }]
    }
    return opts
  }, [settings.provider, settings.model, ollamaModels])

  const patchChatSettings = useCallback(
    async (patch: Partial<ChatSettings>) => {
      const cfg = useVaultStore.getState().config
      if (!cfg) return
      const next: VaultConfig = {
        ...cfg,
        chat: { ...mergeSettings(cfg.chat), ...patch },
      }
      await saveVaultConfig(vaultFs, next)
      updateVaultConfig({ chat: next.chat })
    },
    [vaultFs, updateVaultConfig],
  )

  const handleSend = useCallback(
    (text: string) => {
      if (!apiKey || !settings.provider) return
      void sendMessage({ vaultFs, settings, apiKey, input: text })
    },
    [apiKey, settings, sendMessage, vaultFs],
  )

  const handleNewThread = useCallback(async () => {
    if (isStreaming) return
    await createThread()
    setMobileSidebarOpen(false)
  }, [isStreaming, createThread])

  const handleDeleteThread = useCallback(
    async (threadId: string) => {
      await deleteThread({ vaultFs, threadId })
    },
    [deleteThread, vaultFs],
  )

  const handleToggleFavourite = useCallback(
    async (threadId: string) => {
      await toggleFavourite({ vaultFs, threadId })
    },
    [toggleFavourite, vaultFs],
  )

  const handleLoadDeviceModel = useCallback(async () => {
    setDeviceBusy(true)
    try {
      await ensureDeviceModelDownloaded(settings.model)
      setDeviceStatus('ready')
      toast.success('Model ready')
    } catch (e) {
      toast.error(formatUnknownError(e))
    } finally {
      setDeviceBusy(false)
    }
  }, [settings.model])

  const openAiSettings = useCallback(() => {
    window.dispatchEvent(new CustomEvent('ink:open-settings-ai'))
  }, [])

  const exportMarkdown = useCallback(() => {
    if (!activeThread) return
    const md = threadToMarkdown(
      activeThread,
      headerProviderLabel,
      headerModelLabel,
    )
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sanitizeExportBasename(activeThread.title)}.md`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Downloaded')
  }, [activeThread, headerProviderLabel, headerModelLabel])

  const copyTranscript = useCallback(async () => {
    if (!activeThread) return
    const text = threadToMarkdown(
      activeThread,
      headerProviderLabel,
      headerModelLabel,
    )
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied')
    } catch {
      toast.error('Copy failed')
    }
  }, [activeThread, headerProviderLabel, headerModelLabel])

  const saveTranscriptToVault = useCallback(async () => {
    if (!activeThread) return
    const md = threadToMarkdown(
      activeThread,
      headerProviderLabel,
      headerModelLabel,
    )
    const name = `${sanitizeExportBasename(activeThread.title)}.md`
    const path = name.startsWith('/') ? name.slice(1) : name
    try {
      await vaultFs.writeTextFile(path, md)
      toast.success('Saved to vault')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }, [activeThread, headerProviderLabel, headerModelLabel, vaultFs])

  const handleAttachFiles = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        try {
          const path = await saveVaultChatUpload(vaultFs, file)
          composerRef.current?.insertText(`![[${path}]]`)
        } catch (e) {
          console.error(e)
          toast.error('Could not add file')
        }
      }
    },
    [vaultFs],
  )

  const composerPlaceholder = useMemo(() => {
    if (providerMissing) return 'Choose a provider in Settings → AI'
    if (keyMissing) return 'Add an API key in Settings → AI'
    if (deviceNeedsModel) return 'Load the local model first'
    if (bindingMismatch)
      return 'Match provider and model in Settings to continue this chat'
    return 'Ask your vault anything'
  }, [providerMissing, keyMissing, deviceNeedsModel, bindingMismatch])

  const hasMessages = Boolean(activeThread && activeThread.messages.length > 0)
  const showModelSelector =
    !hasMessages &&
    Boolean(settings.provider && modelOptions.length > 0)

  return (
    <div
      className={cn(
        'bg-bg flex h-full min-h-0 w-full',
      )}
    >
      {/* Collapsed strip — matches vault tree collapsed strip */}
      {sidebarCollapsed && (
        <div className="border-border bg-bg hidden h-full w-10 shrink-0 flex-col items-center border-r pt-2 md:flex">
          <Button
            variant="ghost"
            size="sm"
            className="text-fg-muted hover:text-fg size-9 shrink-0 p-0"
            onClick={toggleSidebarCollapsed}
            aria-label="Expand chat list"
            title="Chat list"
          >
            <MessageSquare className="size-5" />
          </Button>
        </div>
      )}

      {/* Expanded sidebar */}
      {!sidebarCollapsed && (
        <aside
          className="border-border bg-bg hidden shrink-0 flex-col overflow-hidden border-r md:flex"
          style={{ width: sidebarWidth }}
        >
          <ChatThreadsSidebarBody
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            threadsAll={threads}
            activeThreadId={activeThreadId}
            isStreaming={isStreaming}
            onNewChat={handleNewThread}
            onSelect={(id) => {
              selectThread(id)
              setMobileSidebarOpen(false)
            }}
            onDelete={(id) => void handleDeleteThread(id)}
            onToggleFavourite={(id) => void handleToggleFavourite(id)}
            onRequestCollapse={toggleSidebarCollapsed}
          />
        </aside>
      )}

      {/* Resize grip — only when sidebar is expanded */}
      {!sidebarCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat list"
          onMouseDown={(e) => {
            e.preventDefault()
            resizeStartRef.current = { x: e.clientX, w: sidebarWidth }
            setSidebarResizing(true)
          }}
          className={cn(
            'hover:bg-accent/20 hidden w-1.5 shrink-0 cursor-col-resize md:block',
            sidebarResizing && 'bg-accent/25',
          )}
        />
      )}

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="border-border shrink-0 border-b px-3 py-2 md:px-4">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex min-w-0 items-center gap-2 md:hidden">
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(true)}
                  className="text-fg-secondary hover:bg-bg-hover flex size-9 items-center justify-center rounded-lg"
                  aria-label="Open chat list"
                >
                  <Menu className="size-5" />
                </button>
              </div>

              <div className="text-fg flex min-w-0 flex-wrap items-center gap-2 text-sm">
                {headerHasPair ? (
                  <>
                    <span className="text-fg-secondary shrink-0 font-normal">
                      {headerProviderLabel}
                    </span>
                    <span className="text-fg-muted" aria-hidden>
                      ·
                    </span>
                    <span className="max-w-[200px] truncate font-semibold sm:max-w-xs md:max-w-md">
                      {headerModelLabel}
                    </span>
                  </>
                ) : (
                  <span className="text-fg-muted">—</span>
                )}
              </div>

              <div className="ml-auto flex flex-wrap items-center gap-1">
                {keyMissing && (
                  <button
                    type="button"
                    onClick={openAiSettings}
                    className="text-accent hover:bg-accent/10 rounded-md px-2 py-1 text-sm"
                  >
                    API key
                  </button>
                )}
                <button
                  type="button"
                  onClick={openAiSettings}
                  className="text-fg-secondary hover:bg-bg-hover flex items-center gap-1 rounded-md px-2 py-1 text-sm"
                  title="AI settings"
                >
                  <SlidersHorizontal className="size-3.5" />
                  AI
                </button>
                {hasMessages && (
                  <>
                    <button
                      type="button"
                      onClick={() => void copyTranscript()}
                      className="text-fg-secondary hover:bg-bg-hover flex size-8 items-center justify-center rounded-md"
                      title="Copy"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={exportMarkdown}
                      className="text-fg-secondary hover:bg-bg-hover flex size-8 items-center justify-center rounded-md"
                      title="Download"
                    >
                      <Download className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveTranscriptToVault()}
                      className="text-fg-secondary hover:bg-bg-hover rounded-md px-2 py-1 text-xs"
                      title="Save as note in vault"
                    >
                      Save
                    </button>
                  </>
                )}
              </div>
            </div>
          </header>
          <p className="text-fg-muted border-border border-b px-3 py-1.5 text-xs leading-snug md:px-4">
            Answers are grounded in your vault via local search. Artificial
            intelligence can make mistakes—verify important information.
          </p>

          {deviceNeedsModel && (
            <div className="border-border flex shrink-0 justify-center border-b px-4 py-5">
              <button
                type="button"
                disabled={deviceBusy}
                onClick={() => void handleLoadDeviceModel()}
                className="bg-accent text-accent-fg hover:bg-accent-hover shadow-sm flex items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deviceBusy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Load model
              </button>
            </div>
          )}

          {!hasMessages ? (
            <>
              {error && (
                <div className="text-danger border-border shrink-0 border-b px-4 py-2 text-xs">
                  {error}
                </div>
              )}
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
                <h1 className="text-fg text-center font-serif text-3xl font-normal tracking-tight">
                  {vaultChatGreeting()}
                </h1>
                <p className="text-fg-muted max-w-md text-center font-serif text-[12pt]">
                  Search-backed answers from your notes, PDFs, and canvases.
                </p>
                <VaultChatComposer
                  ref={composerRef}
                  layout="center"
                  disabled={composerDisabled}
                  isStreaming={isStreaming}
                  placeholder={composerPlaceholder}
                  onSend={handleSend}
                  onCancel={cancel}
                  onAttachFiles={handleAttachFiles}
                  modelSelect={
                    showModelSelector
                      ? {
                          value: settings.model,
                          options: modelOptions,
                          onChange: (id) => {
                            void patchChatSettings({ model: id })
                          },
                        }
                      : undefined
                  }
                />
              </div>
            </>
          ) : (
            <>
              <div
                ref={scrollRef}
                className="vault-chat-messages min-h-0 flex-1 overflow-y-auto"
              >
                <div className="mx-auto max-w-3xl py-2">
                  {activeThread!.messages.map((m) => (
                    <VaultChatMessageRow key={m.id} message={m} />
                  ))}
                </div>
              </div>

              {error && (
                <div className="text-danger border-border border-t px-4 py-2 font-serif text-xs">
                  {error}
                </div>
              )}

              <VaultChatComposer
                ref={composerRef}
                layout="footer"
                disabled={composerDisabled}
                isStreaming={isStreaming}
                placeholder={composerPlaceholder}
                onSend={handleSend}
                onCancel={cancel}
                onAttachFiles={handleAttachFiles}
                modelSelect={undefined}
              />
            </>
          )}
        </section>

      <Dialog.Root open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[210] bg-black/40 md:hidden" />
          <Dialog.Content
            className="border-border bg-bg fixed top-0 left-0 z-[211] flex h-full w-[min(100vw-2rem,320px)] flex-col border-r shadow-xl outline-none md:hidden"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">Chat list</Dialog.Title>
            <div className="min-h-0 flex-1 overflow-hidden">
              <ChatThreadsSidebarBody
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                threadsAll={threads}
                activeThreadId={activeThreadId}
                isStreaming={isStreaming}
                onNewChat={handleNewThread}
                onSelect={(id) => {
                  selectThread(id)
                  setMobileSidebarOpen(false)
                }}
                onDelete={(id) => void handleDeleteThread(id)}
                onToggleFavourite={(id) => void handleToggleFavourite(id)}
                onRequestCollapse={() => setMobileSidebarOpen(false)}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

function VaultChatMessageRow({ message }: { message: ChatMessageT }) {
  const { vaultFs } = useVaultSession()

  const openPath = useCallback(
    async (path: string) => {
      useUiStore.getState().setActiveView(ViewMode.Vault)
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

  return (
    <div>
      <VaultChatMessage message={message} onVaultPathOpen={openPath} />
    </div>
  )
}
