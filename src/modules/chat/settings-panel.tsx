import { useCallback, useEffect, useId, useState } from 'react'
import { Check, Loader2, RefreshCw } from 'lucide-react'
import type { SettingsPanelProps } from '@/core/registries/settings'
import { INPUT_CLS, NumberInput, Row, SectionHeader, Toggle } from '@/components/settings/fields'
import { clearChatKey, getChatKey, setChatKey, notifyChatKeyChanged } from '@/lib/chat/key-store'
import { migrateChatSettings } from '@/lib/chat/migrate-settings'
import { PROVIDERS_META, providerMeta, providerNeedsApiKey } from '@/lib/chat/providers/meta'
import { testConnection } from '@/lib/chat/providers/test-connection'
import { useChatModels } from '@/lib/chat/use-chat-models'
import type { ChatProviderId, ChatSettings } from '@/types/chat'
import { cn } from '@/utils/cn'

/** The AI section of the settings dialog: the switch, provider, address, key, model. */
export default function AiSettingsPanel({ config, update, saveNow, vaultId }: SettingsPanelProps) {
  const chat = migrateChatSettings(config.chat)
  const provider = chat.provider
  const meta = provider ? providerMeta(provider) : null
  const needsKey = provider ? providerNeedsApiKey(provider) : false
  const baseUrl = provider ? (chat.baseUrls?.[provider] ?? '') : ''
  const listId = useId()

  // The key as saved; null while it is being read.
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [typedKey, setTypedKey] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  useEffect(() => {
    setTestStatus('idle')
    setTestError('')
    setTypedKey('')
    setSavedKey(null)
    if (!chat.enabled || !provider) return
    let cancelled = false
    void getChatKey(provider, vaultId)
      .then((rec) => {
        if (cancelled) return
        setSavedKey(rec?.apiKey ?? '')
        setTypedKey(rec?.apiKey ?? '')
      })
      .catch(() => {
        if (!cancelled) setSavedKey('')
      })
    return () => {
      cancelled = true
    }
  }, [chat.enabled, provider, vaultId])

  const models = useChatModels(provider, savedKey, baseUrl || undefined, chat.enabled)

  const patch = useCallback(
    (next: Partial<ChatSettings>) => update({ chat: { ...chat, ...next } }),
    [chat, update],
  )

  // A server with one model: nothing to choose.
  useEffect(() => {
    if (!chat.model && models.models.length === 1) patch({ model: models.models[0]!.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models.models, chat.model])

  const setBaseUrl = (value: string) => {
    if (!provider) return
    const baseUrls = { ...chat.baseUrls }
    if (value.trim()) baseUrls[provider] = value
    else delete baseUrls[provider]
    patch({ baseUrls })
  }

  const handleTest = useCallback(async () => {
    if (!provider) return
    setTestStatus('testing')
    setTestError('')
    const key = typedKey.trim()
    const result = await testConnection(provider, key, baseUrl || undefined)
    if (!result.ok) {
      setTestStatus('error')
      setTestError(result.error ?? 'Connection failed')
      return
    }
    setTestStatus('success')
    if (key) {
      await setChatKey(provider, vaultId, { apiKey: key })
      notifyChatKeyChanged()
    }
    setSavedKey(key)
  }, [provider, typedKey, baseUrl, vaultId])

  const handleClearKey = useCallback(async () => {
    if (!provider) return
    await clearChatKey(provider, vaultId)
    notifyChatKeyChanged()
    setTypedKey('')
    setSavedKey('')
    setTestStatus('idle')
  }, [provider, vaultId])

  const testDisabled = testStatus === 'testing' || (needsKey && !typedKey.trim())

  return (
    <div>
      <SectionHeader>AI chat</SectionHeader>
      {chat.enabled && (
        <p className="text-fg-secondary mb-3 text-xs leading-relaxed">
          Keys stay in this browser and go only to the provider you choose.
        </p>
      )}
      <div className="divide-border divide-y">
        <Row label="Chat">
          {/* Saved at once: the nav, shortcuts and capture follow this switch. */}
          <Toggle
            label="Chat"
            checked={chat.enabled}
            onChange={(enabled) => void saveNow({ ...config, chat: { ...chat, enabled } })}
          />
        </Row>

        {chat.enabled && (
          <>
            <Row label="Provider">
              <select
                aria-label="Provider"
                value={provider ?? ''}
                onChange={(e) => {
                  const next = e.target.value === '' ? null : (e.target.value as ChatProviderId)
                  // The model belongs to the provider; none is chosen for the new one.
                  patch({ provider: next, model: '' })
                }}
                className={INPUT_CLS}
              >
                <option value="">Choose…</option>
                {PROVIDERS_META.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Row>

            {provider && meta && (
              <>
                {meta.hint && (
                  <div className="py-2">
                    <p className="text-fg-muted text-xs leading-relaxed">{meta.hint}</p>
                  </div>
                )}

                <Row label={meta.local ? 'Address' : 'Base URL (optional)'}>
                  <input
                    aria-label="Base URL"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={meta.defaultBaseUrl}
                    className={INPUT_CLS}
                    spellCheck={false}
                  />
                </Row>

                <Row label={needsKey ? 'API key' : 'API key (optional)'}>
                  <div className="flex w-64 flex-col gap-1.5">
                    <input
                      aria-label="API key"
                      type="password"
                      value={typedKey}
                      onChange={(e) => {
                        setTypedKey(e.target.value)
                        setTestStatus('idle')
                      }}
                      placeholder={meta.keyPlaceholder}
                      className={cn(INPUT_CLS, 'w-full')}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-fg-muted text-[10px]">
                        {savedKey ? 'Key saved' : 'No key saved'}
                      </span>
                      {savedKey && (
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

                <Row label="Connection">
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleTest()}
                      disabled={testDisabled}
                      className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                        testStatus === 'success'
                          ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                          : testStatus === 'error'
                            ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                            : 'bg-accent/10 text-accent hover:bg-accent/20',
                        testDisabled && 'cursor-not-allowed opacity-50',
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
                      <p className="text-danger max-w-64 text-[10px] leading-snug break-words">
                        {testError}
                      </p>
                    )}
                  </div>
                </Row>

                <Row label="Model">
                  <div className="flex w-64 flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        aria-label="Model"
                        list={listId}
                        value={chat.model}
                        onChange={(e) => patch({ model: e.target.value })}
                        placeholder={models.loading ? 'Loading models…' : 'Search or type an id'}
                        className={cn(INPUT_CLS, 'min-w-0 flex-1')}
                        spellCheck={false}
                        autoComplete="off"
                      />
                      <datalist id={listId}>
                        {models.models.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label === m.id ? undefined : m.label}
                          </option>
                        ))}
                      </datalist>
                      <button
                        type="button"
                        onClick={models.refresh}
                        disabled={models.loading}
                        aria-label="Refresh models"
                        title="Refresh models"
                        className="text-fg-muted hover:text-fg disabled:opacity-50"
                      >
                        <RefreshCw
                          className={cn('size-3.5', models.loading && 'animate-spin')}
                          aria-hidden
                        />
                      </button>
                    </div>
                    {models.error && (
                      <p className="text-danger text-[10px] leading-snug break-words">
                        {models.error}
                      </p>
                    )}
                    {!models.error && !models.loading && models.models.length > 0 && (
                      <p className="text-fg-muted text-[10px]">{models.models.length} models</p>
                    )}
                  </div>
                </Row>

                <Row
                  label="Context size"
                  hint="Max characters of the open document sent as context."
                >
                  <NumberInput
                    value={chat.maxContextChars}
                    min={2000}
                    max={400_000}
                    suffix="chars"
                    onChange={(v) => patch({ maxContextChars: v })}
                  />
                </Row>

                <Row label="System prompt override">
                  <textarea
                    value={chat.systemPrompt ?? ''}
                    onChange={(e) => patch({ systemPrompt: e.target.value || undefined })}
                    rows={3}
                    placeholder="Leave blank to use the default."
                    className={cn(INPUT_CLS, 'h-auto w-64 resize-y py-2')}
                  />
                </Row>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
