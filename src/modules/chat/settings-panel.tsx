import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import type { SettingsPanelProps } from '@/core/registries/settings'
import { INPUT_CLS, NumberInput, Row, SectionHeader } from '@/components/settings/fields'
import { clearChatKey, getChatKey, setChatKey, notifyChatKeyChanged } from '@/lib/chat/key-store'
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
import { DEFAULT_CHAT_SETTINGS, type ChatProviderId, type ChatSettings } from '@/types/chat'
import type { VaultConfig } from '@/types/vault'
import { cn } from '@/utils/cn'

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

function chatDraft(config: VaultConfig): ChatSettings {
  return { ...DEFAULT_CHAT_SETTINGS, ...(config.chat ?? {}) }
}

/** The AI section of the settings dialog: provider, model, key, connection test. */
export default function AiSettingsPanel({ config, update, vaultId }: SettingsPanelProps) {
  const chat = chatDraft(config)
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
      update({ chat: { ...chat, [key]: value } })
    },
    [chat, update],
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
        Bring your own key. API keys are stored locally in this browser&apos;s IndexedDB, never
        synced to Dropbox, and never sent anywhere except the provider you select.
      </p>
      <div className="divide-border divide-y">
        <Row label="Provider">
          <select
            value={provider ?? ''}
            onChange={(e) => {
              const val = e.target.value
              const newProvider = val === '' ? null : (val as ChatProviderId)
              // Batch provider + model reset so neither call overwrites the other.
              update({
                chat: {
                  ...chat,
                  provider: newProvider,
                  model: getDefaultModel(newProvider),
                },
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

        {provider &&
          (() => {
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
                            value={
                              isCustomMode
                                ? '__custom__'
                                : ((chat.model || curatedModels[0]?.id) ?? '')
                            }
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
                          {keyStatus === 'loaded' ? 'Key saved' : 'No key saved for this provider'}
                        </span>
                        {keyStatus === 'loaded' && (
                          <button
                            type="button"
                            onClick={() => void handleClearKey()}
                            className="text-danger text-[11px] hover:underline"
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
                      onChange={(e) => setChat('baseUrl', e.target.value || undefined)}
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
                    onChange={(e) => setChat('systemPrompt', e.target.value || undefined)}
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
