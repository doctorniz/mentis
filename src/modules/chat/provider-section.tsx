import { useCallback, useEffect, useId, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Loader2, RefreshCw, Star, X } from 'lucide-react'
import { INPUT_CLS } from '@/components/settings/fields'
import { clearChatKey, getChatKey, setChatKey, notifyChatKeyChanged } from '@/lib/chat/key-store'
import { pickValue, samePick, withoutPick, withPick } from '@/lib/chat/picks'
import { formatTokens } from '@/lib/chat/usage'
import { providerMeta, providerNeedsApiKey } from '@/lib/chat/providers/meta'
import { testConnection } from '@/lib/chat/providers/test-connection'
import { useChatModels } from '@/lib/chat/use-chat-models'
import type { ChatProviderId, ChatSettings } from '@/types/chat'
import { cn } from '@/utils/cn'

interface Props {
  provider: ChatProviderId
  chat: ChatSettings
  open: boolean
  onToggle: () => void
  onChange: (next: ChatSettings) => void
}

/** One provider in Settings › AI: its key, address and the models chosen from it. */
export function ProviderSection({ provider, chat, open, onToggle, onChange }: Props) {
  const meta = providerMeta(provider)
  const needsKey = providerNeedsApiKey(provider)
  const baseUrl = chat.baseUrls?.[provider] ?? ''
  const mine = chat.picks.filter((p) => p.provider === provider)
  const listId = useId()

  // The key as saved; null while it is being read.
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [typedKey, setTypedKey] = useState('')
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [adding, setAdding] = useState('')

  useEffect(() => {
    let cancelled = false
    void getChatKey(provider)
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
  }, [provider])

  const models = useChatModels(provider, savedKey, baseUrl || undefined, open)

  // A local server with exactly one model: nothing to choose, so it is picked.
  useEffect(() => {
    if (open && meta.local && mine.length === 0 && models.models.length === 1) {
      onChange(withPick(chat, { provider, model: models.models[0]!.id }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, models.models])

  const setBaseUrl = (value: string) => {
    const baseUrls = { ...chat.baseUrls }
    if (value.trim()) baseUrls[provider] = value
    else delete baseUrls[provider]
    onChange({ ...chat, baseUrls })
  }

  const handleTest = useCallback(async () => {
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
      await setChatKey(provider, { apiKey: key })
      notifyChatKeyChanged()
    }
    setSavedKey(key)
  }, [provider, typedKey, baseUrl])

  const handleClearKey = useCallback(async () => {
    await clearChatKey(provider)
    notifyChatKeyChanged()
    setTypedKey('')
    setSavedKey('')
    setTestStatus('idle')
  }, [provider])

  const addModel = (id: string) => {
    const model = id.trim()
    if (!model) return
    onChange(withPick(chat, { provider, model }))
    setAdding('')
  }

  const testDisabled = testStatus === 'testing' || (needsKey && !typedKey.trim())
  const status = savedKey === null ? '' : needsKey && !savedKey ? 'No key' : `${mine.length} models`

  return (
    <div data-testid={`provider-${provider}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="hover:bg-bg-hover flex w-full items-center gap-2 px-1 py-2.5 text-left"
      >
        {open ? (
          <ChevronDown className="text-fg-muted size-3.5" aria-hidden />
        ) : (
          <ChevronRight className="text-fg-muted size-3.5" aria-hidden />
        )}
        <span className="text-fg flex-1 text-sm font-medium">{meta.label}</span>
        <span className="text-fg-muted text-xs">{status}</span>
      </button>

      {open && (
        <div className="space-y-3 pt-1 pb-4 pl-6">
          {meta.hint && <p className="text-fg-muted text-xs leading-relaxed">{meta.hint}</p>}

          <label className="flex items-center justify-between gap-3">
            <span className="text-fg-secondary text-xs">
              {meta.local ? 'Address' : 'Base URL (optional)'}
            </span>
            <input
              aria-label={`${meta.label} address`}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={meta.defaultBaseUrl}
              className={cn(INPUT_CLS, 'w-64')}
              spellCheck={false}
            />
          </label>

          <div className="flex items-start justify-between gap-3">
            <span className="text-fg-secondary pt-1.5 text-xs">
              {needsKey ? 'API key' : 'API key (optional)'}
            </span>
            <div className="flex w-64 flex-col gap-1.5">
              <input
                aria-label={`${meta.label} API key`}
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
                <button
                  type="button"
                  onClick={() => void handleTest()}
                  disabled={testDisabled}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
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
              {testStatus === 'error' && testError && (
                <p className="text-danger text-[10px] leading-snug break-words">{testError}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-fg-secondary text-xs">Models</span>
              <div className="flex w-64 items-center gap-1.5">
                <input
                  aria-label={`Add a ${meta.label} model`}
                  list={listId}
                  value={adding}
                  onChange={(e) => setAdding(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addModel(adding)
                    }
                  }}
                  onInput={(e) => {
                    // Choosing a suggestion adds it; typing does not.
                    const native = e.nativeEvent as InputEvent
                    const value = (e.target as HTMLInputElement).value
                    if (!native.inputType && models.models.some((m) => m.id === value)) {
                      addModel(value)
                    }
                  }}
                  placeholder={models.loading ? 'Loading models…' : 'Search or type an id'}
                  className={cn(INPUT_CLS, 'min-w-0 flex-1')}
                  spellCheck={false}
                  autoComplete="off"
                />
                <datalist id={listId}>
                  {models.models
                    .filter((m) => !mine.some((p) => p.model === m.id))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label === m.id ? undefined : m.label}
                      </option>
                    ))}
                </datalist>
                <button
                  type="button"
                  onClick={() => addModel(adding)}
                  disabled={!adding.trim()}
                  className="text-accent text-xs font-medium disabled:opacity-40"
                >
                  Add
                </button>
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
            </div>
            {models.error && (
              <p className="text-danger text-right text-[10px] leading-snug break-words">
                {models.error}
              </p>
            )}
            {!models.error && !models.loading && models.models.length > 0 && (
              <p className="text-fg-muted text-right text-[10px]">
                {models.models.length} available
              </p>
            )}
            {mine.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {mine.map((p) => {
                  const current = samePick(p, {
                    provider: chat.provider as ChatProviderId,
                    model: chat.model,
                  })
                  return (
                    <li
                      key={p.model}
                      className={cn(
                        'flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2 text-xs',
                        current ? 'border-accent text-accent' : 'border-border text-fg-secondary',
                      )}
                    >
                      <span className="max-w-48 truncate" title={p.model}>
                        {p.model}
                      </span>
                      <input
                        aria-label={`Context window of ${p.model}`}
                        title="Context window, in tokens"
                        inputMode="numeric"
                        value={chat.contextWindows?.[pickValue(p)] ?? ''}
                        placeholder={(() => {
                          const reported = models.models.find(
                            (m) => m.id === p.model,
                          )?.contextWindow
                          return reported ? formatTokens(reported) : 'tokens'
                        })()}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/\D/g, ''))
                          const contextWindows = { ...chat.contextWindows }
                          if (n > 0) contextWindows[pickValue(p)] = n
                          else delete contextWindows[pickValue(p)]
                          onChange({ ...chat, contextWindows })
                        }}
                        className="bg-bg-muted text-fg w-16 rounded px-1 py-0.5 text-center text-[11px]"
                      />
                      <button
                        type="button"
                        aria-label={`Use ${p.model}`}
                        aria-pressed={current}
                        title={current ? 'In use' : 'Use this one'}
                        onClick={() => onChange({ ...chat, provider: p.provider, model: p.model })}
                        className="hover:text-accent"
                      >
                        <Star className={cn('size-3', current && 'fill-current')} aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${p.model}`}
                        title="Remove"
                        onClick={() => onChange(withoutPick(chat, p))}
                        className="hover:text-danger"
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
