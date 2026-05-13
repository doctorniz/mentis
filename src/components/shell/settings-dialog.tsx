'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  Check,
  FolderOpen,
  Loader2,
  X,
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useVaultStore } from '@/stores/vault'
import { DEFAULT_VAULT_CONFIG, type VaultConfig } from '@/types/vault'
import { saveVaultConfig } from '@/lib/vault'
import { migrateDailyNotesFolder } from '@/lib/notes/daily-note'
import { DAILY_NOTES_DIR } from '@/types/vault'
import { VaultDropboxSyncPanel } from '@/components/views/vault-dropbox-sync-panel'
import {
  clearChatKey,
  getChatKey,
  setChatKey,
  notifyChatKeyChanged,
} from '@/lib/chat/key-store'
import { testConnection } from '@/lib/chat/providers/test-connection'
import {
  fetchModels,
  getCuratedModels,
  getDefaultModel,
  providerNeedsApiKey,
  providerNeedsBaseUrl,
  type ModelEntry,
} from '@/lib/chat/providers/model-catalog'
import {
  DEVICE_MODEL_PROGRESS_EVENT,
  ensureDeviceModelDownloaded,
  getDeviceModelStatus,
  type DeviceModelStatus,
} from '@/lib/chat/device-model-store'
import {
  DEFAULT_CHAT_SETTINGS,
  type ChatProviderId,
  type ChatSettings,
} from '@/types/chat'
import { cn } from '@/utils/cn'

/* ------------------------------------------------------------------ */
/*  Shared field primitives                                            */
/* ------------------------------------------------------------------ */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-fg-tertiary mb-3 text-[10px] font-bold uppercase tracking-widest">
      {children}
    </h3>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-fg text-sm font-medium">{label}</p>
        {hint && <p className="text-fg-muted mt-0.5 text-xs leading-relaxed">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const INPUT_CLS =
  'border-border bg-bg-secondary text-fg rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50 w-48'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
        'border border-transparent',
        checked ? 'bg-accent' : 'bg-bg-tertiary border-border',
      )}
    >
      <span
        className={cn(
          'pointer-events-none size-4 rounded-full bg-white shadow transition-transform duration-200 ease-out',
          checked ? 'translate-x-6' : 'translate-x-0',
        )}
      />
    </button>
  )
}

function NumberInput({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          if (!isNaN(n)) onChange(n)
        }}
        className="border-border bg-bg-secondary text-fg w-20 rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50"
      />
      {suffix && <span className="text-fg-muted text-xs">{suffix}</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Folder picker (loads available directories from the vault)         */
/* ------------------------------------------------------------------ */

function FolderPicker({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const { vaultFs } = useVaultSession()
  const [folders, setFolders] = useState<string[]>([])

  useEffect(() => {
    void (async () => {
      const result: string[] = ['/']
      async function walk(dir: string) {
        try {
          const entries = await vaultFs.readdir(dir)
          for (const e of entries) {
            if (e.isDirectory && !e.name.startsWith('.')) {
              const p = dir === '/' ? `/${e.name}` : `${dir}/${e.name}`
              result.push(p)
              await walk(p)
            }
          }
        } catch { /* ignore */ }
      }
      await walk('/')
      setFolders(result)
    })()
  }, [vaultFs])

  return (
    <div className="relative flex items-center gap-1.5">
      <FolderOpen className="text-fg-muted pointer-events-none absolute left-2.5 size-3.5" />
      <select
        value={value || '/'}
        onChange={(e) => onChange(e.target.value)}
        className="border-border bg-bg-secondary text-fg w-48 rounded-md border py-1.5 pr-2.5 pl-8 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50"
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {folders.map((f) => (
          <option key={f} value={f}>
            {f === '/' ? 'Root' : f}
          </option>
        ))}
      </select>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Tab content sections                                               */
/* ------------------------------------------------------------------ */

function VaultTab({
  draft,
  set,
}: {
  draft: VaultConfig
  set: <K extends keyof VaultConfig>(key: K, value: VaultConfig[K]) => void
}) {
  return (
    <div>
      <SectionHeader>General</SectionHeader>
      <div className="divide-border divide-y">
        <Row label="Vault name">
          <input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            className={INPUT_CLS}
            placeholder="My Vault"
          />
        </Row>
        <Row label="Default folder for new files">
          <FolderPicker
            value={draft.defaultNewFileFolder}
            onChange={(v) => set('defaultNewFileFolder', v)}
          />
        </Row>
        <Row label="Template folder">
          <FolderPicker
            value={draft.templateFolder}
            onChange={(v) => set('templateFolder', v)}
          />
        </Row>
        <Row label="Default PDF page style">
          <select
            value={draft.pdfPageStyle ?? 'blank'}
            onChange={(e) => set('pdfPageStyle', e.target.value as VaultConfig['pdfPageStyle'])}
            className={INPUT_CLS}
          >
            <option value="blank">Blank</option>
            <option value="lined">Lined</option>
            <option value="grid">Grid</option>
          </select>
        </Row>
      </div>
    </div>
  )
}

function EditorTab({
  draft,
  set,
}: {
  draft: VaultConfig
  set: <K extends keyof VaultConfig>(key: K, value: VaultConfig[K]) => void
}) {
  return (
    <div>
      <SectionHeader>Attachments</SectionHeader>
      <div className="divide-border divide-y">
        <Row
          label="Attachment folder"
          hint="Where uploaded images and videos are saved when embedded in notes."
        >
          <FolderPicker
            value={draft.attachmentFolder ?? '_assets'}
            onChange={(v) => set('attachmentFolder', v)}
          />
        </Row>
      </div>

      <div className="mt-6">
        <SectionHeader>Daily Notes</SectionHeader>
        <div className="divide-border divide-y">
          <Row label="Show today's date in sidebar">
            <Toggle
              checked={draft.dailyNotesEnabled !== false}
              onChange={(v) => set('dailyNotesEnabled', v)}
            />
          </Row>
          {draft.dailyNotesEnabled !== false && (
            <Row
              label="Daily notes folder"
              hint="Folder is created on first use. Changing this will move existing daily notes."
            >
              <input
                value={draft.dailyNotesFolder ?? DAILY_NOTES_DIR}
                onChange={(e) => set('dailyNotesFolder', e.target.value)}
                placeholder={DAILY_NOTES_DIR}
                className={INPUT_CLS}
              />
            </Row>
          )}
        </div>
      </div>

      <div className="mt-6">
        <SectionHeader>Auto-save</SectionHeader>
        <div className="divide-border divide-y">
          <Row label="Enable auto-save">
            <Toggle
              checked={draft.autoSave.enabled}
              onChange={(v) => set('autoSave', { ...draft.autoSave, enabled: v })}
            />
          </Row>
          {draft.autoSave.enabled && (
            <Row label="Save interval">
              <NumberInput
                value={Math.round(draft.autoSave.intervalMs / 1000)}
                min={5}
                max={3600}
                suffix="seconds"
                onChange={(v) =>
                  set('autoSave', { ...draft.autoSave, intervalMs: v * 1000 })
                }
              />
            </Row>
          )}
          <Row label="Save on focus loss">
            <Toggle
              checked={draft.autoSave.saveOnBlur}
              onChange={(v) => set('autoSave', { ...draft.autoSave, saveOnBlur: v })}
            />
          </Row>
        </div>
      </div>
    </div>
  )
}

function SnapshotsTab({
  draft,
  set,
}: {
  draft: VaultConfig
  set: <K extends keyof VaultConfig>(key: K, value: VaultConfig[K]) => void
}) {
  return (
    <div>
      <SectionHeader>Version history</SectionHeader>
      <div className="divide-border divide-y">
        <Row label="Enable version history">
          <Toggle
            checked={draft.snapshots.enabled}
            onChange={(v) => set('snapshots', { ...draft.snapshots, enabled: v })}
          />
        </Row>
        {draft.snapshots.enabled && (
          <>
            <Row label="Max snapshots per file">
              <NumberInput
                value={draft.snapshots.maxPerFile}
                min={1}
                max={100}
                onChange={(v) =>
                  set('snapshots', { ...draft.snapshots, maxPerFile: v })
                }
              />
            </Row>
            <Row label="Retention period">
              <NumberInput
                value={draft.snapshots.retentionDays}
                min={1}
                max={365}
                suffix="days"
                onChange={(v) =>
                  set('snapshots', { ...draft.snapshots, retentionDays: v })
                }
              />
            </Row>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Dialog root                                                        */
/* ------------------------------------------------------------------ */

function CalendarSettingsTab() {
  return (
    <div>
      <SectionHeader>Calendar sync</SectionHeader>
      <p className="text-fg-secondary mb-4 text-xs leading-relaxed">
        Calendar events are stored locally in your vault as markdown files (
        <code className="bg-bg-tertiary rounded px-1 font-mono text-[10px]">_marrow/_calendar/</code>).
        External sync options are coming soon.
      </p>
      <div className="divide-border divide-y">
        {/* Google Calendar — coming soon */}
        <div className="flex items-center justify-between gap-4 py-3 opacity-40 select-none">
          <div className="flex items-center gap-3">
            <div className="bg-bg-tertiary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <CalendarDays className="text-fg-muted size-4" />
            </div>
            <div>
              <p className="text-fg text-sm font-medium">Google Calendar</p>
              <p className="text-fg-muted text-xs">Two-way sync via CalDAV / OAuth</p>
            </div>
          </div>
          <span className="border-border text-fg-muted rounded-full border px-2.5 py-0.5 text-[10px] font-medium">
            Coming soon
          </span>
        </div>

        {/* Apple Calendar — coming soon */}
        <div className="flex items-center justify-between gap-4 py-3 opacity-40 select-none">
          <div className="flex items-center gap-3">
            <div className="bg-bg-tertiary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <CalendarDays className="text-fg-muted size-4" />
            </div>
            <div>
              <p className="text-fg text-sm font-medium">Apple Calendar</p>
              <p className="text-fg-muted text-xs">Subscribe or import/export via .ics</p>
            </div>
          </div>
          <span className="border-border text-fg-muted rounded-full border px-2.5 py-0.5 text-[10px] font-medium">
            Coming soon
          </span>
        </div>

        {/* Outlook — coming soon */}
        <div className="flex items-center justify-between gap-4 py-3 opacity-40 select-none">
          <div className="flex items-center gap-3">
            <div className="bg-bg-tertiary flex size-9 shrink-0 items-center justify-center rounded-lg">
              <CalendarDays className="text-fg-muted size-4" />
            </div>
            <div>
              <p className="text-fg text-sm font-medium">Outlook / Microsoft 365</p>
              <p className="text-fg-muted text-xs">Two-way sync via Microsoft Graph API</p>
            </div>
          </div>
          <span className="border-border text-fg-muted rounded-full border px-2.5 py-0.5 text-[10px] font-medium">
            Coming soon
          </span>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  AI tab                                                              */
/* ------------------------------------------------------------------ */

interface ProviderOption {
  id: ChatProviderId
  label: string
  hint: string
  keyPlaceholder: string
  baseUrlPlaceholder: string
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    hint: 'One key unlocks Anthropic, OpenAI, Gemini, and many open models.',
    keyPlaceholder: 'sk-or-v1-…',
    baseUrlPlaceholder: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    hint: 'Requires a browser-enabled API key with direct browser access enabled.',
    keyPlaceholder: 'sk-ant-…',
    baseUrlPlaceholder: 'https://api.anthropic.com/v1',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'Works with Azure OpenAI, LM Studio via a custom base URL.',
    keyPlaceholder: 'sk-…',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    hint: 'Get an API key at ai.google.dev.',
    keyPlaceholder: 'AIza…',
    baseUrlPlaceholder: 'https://generativelanguage.googleapis.com/v1beta',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    hint: 'Run `ollama serve` locally. No API key needed.',
    keyPlaceholder: '(optional)',
    baseUrlPlaceholder: 'http://localhost:11434',
  },
  {
    id: 'device',
    label: 'Local',
    hint: 'Gemma 4 E2B runs in your browser via WebGPU. First download is required.',
    keyPlaceholder: '',
    baseUrlPlaceholder: '',
  },
]

function chatDraft(draft: VaultConfig): ChatSettings {
  return { ...DEFAULT_CHAT_SETTINGS, ...(draft.chat ?? {}) }
}

function AiTab({
  draft,
  set,
  vaultId,
}: {
  draft: VaultConfig
  set: <K extends keyof VaultConfig>(key: K, value: VaultConfig[K]) => void
  vaultId: string
}) {
  const chat = chatDraft(draft)
  const [apiKey, setApiKey] = useState<string>('')
  const [keyStatus, setKeyStatus] = useState<'empty' | 'set' | 'loaded'>('empty')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState<string>('')
  // `models` is only used for dynamic-discovery providers (ollama).
  // Cloud providers use `getCuratedModels` synchronously instead.
  const [models, setModels] = useState<ModelEntry[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [deviceLoading, setDeviceLoading] = useState(false)
  const [deviceLoadFailed, setDeviceLoadFailed] = useState(false)
  const [deviceStatus, setDeviceStatus] = useState<DeviceModelStatus>('missing')
  const [deviceProgress, setDeviceProgress] = useState(0)

  const provider = chat.provider
  const needsKey = provider ? providerNeedsApiKey(provider) : false
  const needsBaseUrl = provider ? providerNeedsBaseUrl(provider) : false

  // Curated list for this provider (all providers except Ollama have one).
  const curatedModels = provider ? getCuratedModels(provider) : []
  const hasCurated = curatedModels.length > 0
  // Explicit state so selecting "Other (custom)…" reliably shows the text input.
  // Initialised true when the saved model is already outside the curated list.
  const [isCustomMode, setIsCustomMode] = useState<boolean>(() => {
    if (!hasCurated || !chat.model) return false
    return !curatedModels.some((m) => m.id === chat.model)
  })

  // Load key from IndexedDB whenever provider changes.
  useEffect(() => {
    let cancelled = false
    if (!provider) {
      setApiKey('')
      setKeyStatus('empty')
      return
    }
    if (!needsKey) {
      setApiKey('')
      setKeyStatus('loaded')
      return
    }
    void getChatKey(provider, vaultId)
      .then((rec) => {
        if (cancelled) return
        if (rec?.apiKey) {
          setApiKey(rec.apiKey)
          setKeyStatus('loaded')
        } else {
          setApiKey('')
          setKeyStatus('empty')
        }
      })
      .catch(() => {
        if (cancelled) return
        setApiKey('')
        setKeyStatus('empty')
      })
    return () => {
      cancelled = true
    }
  }, [provider, vaultId, needsKey])

  // Reset UI state when provider changes.
  useEffect(() => {
    setTestStatus('idle')
    setTestError('')
    setModels([])
    setDeviceLoadFailed(false)
    setDeviceProgress(0)
    if (provider === 'device') {
      void getDeviceModelStatus(chat.model)
        .then(setDeviceStatus)
        .catch(() => setDeviceStatus('missing'))
    }
    setIsCustomMode(false)
  }, [provider, chat.model])

  // Auto-fetch models for providers that don't need API keys (ollama)
  useEffect(() => {
    if (!provider) return
    if (provider === 'device') return
    if (needsKey) return
    let cancelled = false
    setModelsLoading(true)
    void fetchModels(provider, '', chat.baseUrl)
      .then((result) => {
        if (cancelled) return
        setModels(result)
      })
      .catch(() => {
        if (cancelled) return
        setModels([])
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false)
      })
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, needsKey])

  useEffect(() => {
    if (provider !== 'device') return
    const onProgress = (evt: Event) => {
      const detail = (evt as CustomEvent<{ progress?: number }>).detail
      const raw = detail?.progress
      if (typeof raw !== 'number' || Number.isNaN(raw) || raw < 0 || raw > 1) return
      setDeviceProgress(raw)
    }
    window.addEventListener(DEVICE_MODEL_PROGRESS_EVENT, onProgress as EventListener)
    return () =>
      window.removeEventListener(DEVICE_MODEL_PROGRESS_EVENT, onProgress as EventListener)
  }, [provider])

  const setChat = useCallback(
    <K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) => {
      set('chat', { ...chat, [key]: value })
    },
    [chat, set],
  )

  const handleTest = useCallback(async () => {
    if (!provider) return
    setTestStatus('testing')
    setTestError('')
    const result = await testConnection(provider, apiKey.trim(), chat.baseUrl)
    if (result.ok) {
      setTestStatus('success')
      // Save the key for key-based providers.
      if (needsKey && apiKey.trim()) {
        await setChatKey(provider, vaultId, { apiKey: apiKey.trim() })
        setKeyStatus('loaded')
        notifyChatKeyChanged()
      }
      // Only fetch models dynamically for local providers (ollama etc.) that
      // don't have a curated list. Cloud providers use getCuratedModels() directly.
      if (!getCuratedModels(provider).length) {
        setModelsLoading(true)
        try {
          const fetched = await fetchModels(provider, apiKey.trim(), chat.baseUrl)
          setModels(fetched)
        } catch {
          // Non-fatal — user can still type a model manually
        } finally {
          setModelsLoading(false)
        }
      }
    } else {
      setTestStatus('error')
      setTestError(result.error ?? 'Connection failed')
    }
  }, [provider, apiKey, chat.baseUrl, needsKey, vaultId])

  const handleClearKey = useCallback(async () => {
    if (!provider) return
    await clearChatKey(provider, vaultId)
    notifyChatKeyChanged()
    setApiKey('')
    setKeyStatus('empty')
    setTestStatus('idle')
    // Only clear dynamic models (local providers). Curated list is always available.
    if (!getCuratedModels(provider).length) setModels([])
  }, [provider, vaultId])

  const handleDownloadDeviceModel = useCallback(async () => {
    setDeviceLoading(true)
    setDeviceLoadFailed(false)
    try {
      await ensureDeviceModelDownloaded(chat.model)
      setDeviceLoadFailed(false)
      setDeviceStatus('ready')
      setDeviceProgress(1)
    } catch (err) {
      console.log('Device model download failed', err)
      setDeviceLoadFailed(true)
      setDeviceProgress(0)
    } finally {
      setDeviceLoading(false)
    }
  }, [chat.model])

  return (
    <div>
      <SectionHeader>AI chat</SectionHeader>
      <p className="text-fg-secondary mb-4 text-xs leading-relaxed">
        Bring your own key. API keys are stored locally in this browser&apos;s
        IndexedDB, never synced to Dropbox, and never sent anywhere except
        the provider you select.
      </p>
      <div className="divide-border divide-y">
        <Row label="Provider">
          <select
            value={provider ?? ''}
            onChange={(e) => {
              const val = e.target.value
              const newProvider = val === '' ? null : (val as ChatProviderId)
              // Batch provider + model reset so neither call overwrites the other.
              set('chat', {
                ...chat,
                provider: newProvider,
                model: getDefaultModel(newProvider),
              })
            }}
            className={INPUT_CLS}
          >
            <option value="">Disabled</option>
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </Row>

        {provider && (() => {
          const opt = PROVIDER_OPTIONS.find((p) => p.id === provider)
          return (
            <>
              {opt?.hint && (
                <div className="py-2">
                  <p className="text-fg-muted text-xs leading-relaxed">{opt.hint}</p>
                </div>
              )}

              {/* Model selection — sits right below provider */}
              {provider !== 'device' && (
                <Row label="Model">
                  <div className="flex w-56 flex-col gap-1.5">
                    {hasCurated ? (
                      <>
                        <select
                          value={isCustomMode ? '__custom__' : ((chat.model || curatedModels[0]?.id) ?? '')}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setIsCustomMode(true)
                            } else {
                              setIsCustomMode(false)
                              setChat('model', e.target.value)
                            }
                          }}
                          className={cn(INPUT_CLS, 'w-full')}
                        >
                          {curatedModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                          <option value="__custom__">Other (custom)…</option>
                        </select>
                        {isCustomMode && (
                          <input
                            value={chat.model}
                            onChange={(e) => setChat('model', e.target.value)}
                            placeholder="model id"
                            className={cn(INPUT_CLS, 'w-full')}
                            spellCheck={false}
                            autoFocus
                          />
                        )}
                      </>
                    ) : modelsLoading ? (
                      <div className="text-fg-muted flex items-center gap-1.5 text-xs">
                        <Loader2 className="size-3 animate-spin" />
                        Loading models…
                      </div>
                    ) : models.length > 0 ? (
                      <select
                        value={chat.model}
                        onChange={(e) => setChat('model', e.target.value)}
                        className={cn(INPUT_CLS, 'w-full')}
                      >
                        {!models.some((m) => m.id === chat.model) && chat.model && (
                          <option value={chat.model}>{chat.model}</option>
                        )}
                        {models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={chat.model}
                        onChange={(e) => setChat('model', e.target.value)}
                        placeholder="model-id"
                        className={cn(INPUT_CLS, 'w-full')}
                        spellCheck={false}
                      />
                    )}
                  </div>
                </Row>
              )}

              {/* API key — only for providers that need one */}
              {needsKey && (
                <Row label="API key">
                  <div className="flex w-64 flex-col gap-1.5">
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value)
                        setTestStatus('idle')
                      }}
                      placeholder={opt?.keyPlaceholder ?? 'sk-…'}
                      className={cn(INPUT_CLS, 'w-full')}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-fg-muted text-[10px]">
                        {keyStatus === 'loaded'
                          ? 'Key saved'
                          : 'No key saved for this provider'}
                      </span>
                      {keyStatus === 'loaded' && (
                        <button
                          type="button"
                          onClick={() => void handleClearKey()}
                          className="text-danger hover:underline text-[11px]"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </Row>
              )}

              {/* Base URL — only for providers that use it */}
              {needsBaseUrl && (
                <Row label="Base URL (optional)">
                  <input
                    value={chat.baseUrl ?? ''}
                    onChange={(e) =>
                      setChat('baseUrl', e.target.value || undefined)
                    }
                    placeholder={opt?.baseUrlPlaceholder ?? ''}
                    className={INPUT_CLS}
                    spellCheck={false}
                  />
                </Row>
              )}

              {provider === 'device' && (
                <>
                  <Row label="Model">
                    <select
                      value={chat.model}
                      onChange={(e) => setChat('model', e.target.value)}
                      className={cn(INPUT_CLS, 'w-56')}
                    >
                      {curatedModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </Row>
                  <Row label="Status">
                    <div className="flex max-w-xs flex-col items-start gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDownloadDeviceModel()}
                        disabled={deviceLoading}
                        className={cn(
                          'inline-flex min-w-[9.5rem] shrink-0 justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                          deviceLoading && 'cursor-not-allowed opacity-50',
                          deviceStatus === 'ready' && !deviceLoading
                            ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                            : 'bg-accent text-accent-fg hover:bg-accent/90',
                        )}
                      >
                        {deviceLoading ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <Loader2 className="size-3 shrink-0 animate-spin" />
                            {deviceProgress > 0 && deviceProgress < 1
                              ? `Downloading… ${Math.round(deviceProgress * 100)}%`
                              : 'Downloading…'}
                          </span>
                        ) : deviceStatus === 'ready' ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Check className="size-3 shrink-0" aria-hidden />
                            Ready
                          </span>
                        ) : (
                          'Download'
                        )}
                      </button>
                      {deviceLoadFailed && (
                        <p className="text-danger w-full min-w-0 text-[10px] leading-snug break-words">
                          Error loading model.
                        </p>
                      )}
                    </div>
                  </Row>
                </>
              )}

              {/* Test connection button */}
              <Row label="Connection">
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleTest()}
                    disabled={testStatus === 'testing' || (needsKey && !apiKey.trim())}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      testStatus === 'success'
                        ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                        : testStatus === 'error'
                          ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                          : 'bg-accent/10 text-accent hover:bg-accent/20',
                      (testStatus === 'testing' || (needsKey && !apiKey.trim())) &&
                        'cursor-not-allowed opacity-50',
                    )}
                  >
                    {testStatus === 'testing' && (
                      <span className="inline-flex items-center gap-1.5">
                        <Loader2 className="size-3 animate-spin" />
                        Testing…
                      </span>
                    )}
                    {testStatus === 'success' && (
                      <span className="inline-flex items-center gap-1.5">
                        <Check className="size-3" />
                        Connected
                      </span>
                    )}
                    {testStatus === 'error' && 'Retry'}
                    {testStatus === 'idle' && 'Test'}
                  </button>
                  {testStatus === 'error' && testError && (
                    <p className="text-danger text-[10px] leading-snug">{testError}</p>
                  )}
                </div>
              </Row>

              {/* Context size */}
              <Row
                label="Context size"
                hint="Max characters of the open document sent as context."
              >
                <NumberInput
                  value={chat.maxContextChars}
                  min={2000}
                  max={400_000}
                  suffix="chars"
                  onChange={(v) => setChat('maxContextChars', v)}
                />
              </Row>

              {/* System prompt */}
              <Row label="System prompt override">
                <textarea
                  value={chat.systemPrompt ?? ''}
                  onChange={(e) =>
                    setChat('systemPrompt', e.target.value || undefined)
                  }
                  rows={3}
                  placeholder="Leave blank to use the default."
                  className={cn(INPUT_CLS, 'h-auto w-64 resize-y py-2')}
                />
              </Row>
            </>
          )
        })()}
      </div>
    </div>
  )
}

const TABS = [
  { id: 'vault', label: 'Vault' },
  { id: 'editor', label: 'Editor' },
  { id: 'snapshots', label: 'Snapshots' },
  { id: 'sync', label: 'Sync' },
  { id: 'ai', label: 'AI' },
  { id: 'calendar', label: 'Calendar' },
] as const

type TabId = (typeof TABS)[number]['id']

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = 'vault',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Tab selected when the dialog opens. */
  initialTab?: TabId
}) {
  const { vaultFs, vaultPath } = useVaultSession()
  const config = useVaultStore((s) => s.config)
  const updateConfig = useVaultStore((s) => s.updateConfig)

  const [draft, setDraft] = useState<VaultConfig>(config ?? DEFAULT_VAULT_CONFIG)
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstDraft = useRef(true)
  const vaultFsRef = useRef(vaultFs)
  const updateConfigRef = useRef(updateConfig)
  /** Tracks the last-saved dailyNotesFolder so we can run migration if it changes. */
  const prevDailyFolderRef = useRef<string>(config?.dailyNotesFolder ?? DAILY_NOTES_DIR)
  useEffect(() => { vaultFsRef.current = vaultFs }, [vaultFs])
  useEffect(() => { updateConfigRef.current = updateConfig }, [updateConfig])

  // Reset draft when dialog opens
  useEffect(() => {
    if (open && config) {
      isFirstDraft.current = true
      prevDailyFolderRef.current = config.dailyNotesFolder ?? DAILY_NOTES_DIR
      setDraft({ ...DEFAULT_VAULT_CONFIG, ...config })
      setSaved(false)
    }
  }, [open, config])

  useEffect(() => {
    if (open) setActiveTab(initialTab)
  }, [open, initialTab])

  // Auto-save 600ms after any draft change
  useEffect(() => {
    if (isFirstDraft.current) {
      isFirstDraft.current = false
      return
    }
    setSaved(false)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        // Migrate daily notes if folder changed
        const newFolder = draft.dailyNotesFolder ?? DAILY_NOTES_DIR
        const oldFolder = prevDailyFolderRef.current
        if (newFolder !== oldFolder) {
          await migrateDailyNotesFolder(vaultFsRef.current, oldFolder, newFolder)
          prevDailyFolderRef.current = newFolder
        }
        await saveVaultConfig(vaultFsRef.current, draft)
        updateConfigRef.current(draft)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } finally {
        setSaving(false)
      }
    }, 600)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [draft])

  const setField = useCallback(
    <K extends keyof VaultConfig>(key: K, value: VaultConfig[K]) => {
      setDraft((d) => ({ ...d, [key]: value }))
    },
    [],
  )

  // Used by VaultDropboxSyncPanel before navigating to OAuth — saves immediately without debounce
  const saveConfigNow = useCallback(async (config: VaultConfig) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    isFirstDraft.current = true  // prevent the subsequent setDraft from re-triggering auto-save
    await saveVaultConfig(vaultFs, config)
    updateConfig(config)
    setDraft(config)
    isFirstDraft.current = false
  }, [vaultFs, updateConfig])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (saveTimerRef.current) {
          clearTimeout(saveTimerRef.current)
          saveTimerRef.current = null
        }
        setSaving(true)
        saveVaultConfig(vaultFs, draft)
          .then(() => {
            updateConfig(draft)
            setSaving(false)
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
          })
          .catch(() => setSaving(false))
      }
    },
    [draft, vaultFs, updateConfig],
  )

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[199] bg-black/40 backdrop-blur-[1px]" />
        <Dialog.Content
          onKeyDown={handleKeyDown}
          className="border-border bg-bg fixed top-1/2 left-1/2 z-[200] flex w-[min(100vw-2rem,580px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border shadow-xl outline-none"
          style={{ maxHeight: 'min(90vh, 640px)' }}
        >
          {/* Header */}
          <div className="border-border flex shrink-0 items-center justify-between border-b px-5 py-4">
            <Dialog.Title className="text-fg text-base font-semibold">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="text-fg-muted hover:text-fg rounded p-0.5 transition-colors"
                aria-label="Close settings"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Tabs + body */}
          <Tabs.Root
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabId)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Tabs.List className="border-border bg-bg-secondary flex shrink-0 gap-0 border-b px-5">
              {TABS.map(({ id, label }) => (
                <Tabs.Trigger
                  key={id}
                  value={id}
                  className={cn(
                    'border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                    activeTab === id
                      ? 'border-accent text-accent'
                      : 'border-transparent text-fg-secondary hover:text-fg',
                  )}
                >
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <Tabs.Content value="vault">
                <VaultTab draft={draft} set={setField} />
              </Tabs.Content>
              <Tabs.Content value="editor">
                <EditorTab draft={draft} set={setField} />
              </Tabs.Content>
              <Tabs.Content value="snapshots">
                <SnapshotsTab draft={draft} set={setField} />
              </Tabs.Content>
              <Tabs.Content value="sync">
                <SectionHeader>Cloud sync</SectionHeader>
                <VaultDropboxSyncPanel
                  vaultConfig={draft}
                  setSync={(s) => setField('sync', s)}
                  saveFullConfig={saveConfigNow}
                  persistSyncFieldsToDisk={false}
                />
              </Tabs.Content>
              <Tabs.Content value="ai">
                <AiTab draft={draft} set={setField} vaultId={vaultPath} />
              </Tabs.Content>
              <Tabs.Content value="calendar">
                <CalendarSettingsTab />
              </Tabs.Content>
            </div>
          </Tabs.Root>

          {/* Footer */}
          <div className="border-border flex shrink-0 items-center justify-between border-t px-5 py-3">
            <span className="text-fg-muted flex items-center gap-1.5 text-xs">
              {saving && <Loader2 className="size-3 animate-spin" />}
              {saved && <Check className="size-3 text-green-500" />}
              {saving ? 'Saving…' : saved ? 'Saved' : ''}
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="bg-accent text-accent-fg hover:bg-accent/90 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
            >
              Done
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
