import { useCallback, useState } from 'react'
import type { SettingsPanelProps } from '@/core/registries/settings'
import { INPUT_CLS, NumberInput, Row, SectionHeader, Toggle } from '@/components/settings/fields'
import { migrateChatSettings } from '@/lib/chat/migrate-settings'
import { PROVIDERS_META } from '@/lib/chat/providers/meta'
import type { ChatProviderId, ChatSettings } from '@/types/chat'
import { cn } from '@/utils/cn'
import { ProviderSection } from './provider-section'

/** The AI section of the settings dialog: the switch, the providers with their keys and models. */
export default function AiSettingsPanel({ config, update, saveNow, vaultId }: SettingsPanelProps) {
  const chat = migrateChatSettings(config.chat)
  const [open, setOpen] = useState<ChatProviderId | null>(null)

  const patch = useCallback(
    (next: Partial<ChatSettings>) => update({ chat: { ...chat, ...next } }),
    [chat, update],
  )

  return (
    <div>
      <SectionHeader>AI chat</SectionHeader>
      {chat.enabled && (
        <p className="text-fg-secondary mb-3 text-xs leading-relaxed">
          Keys stay on this device and go only to the provider they belong to.
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
            {PROVIDERS_META.map((p) => (
              <ProviderSection
                key={p.id}
                provider={p.id}
                chat={chat}
                vaultId={vaultId}
                open={open === p.id}
                onToggle={() => setOpen(open === p.id ? null : p.id)}
                onChange={(next) => update({ chat: next })}
              />
            ))}

            <Row label="Context size" hint="Max characters of the open document sent as context.">
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
      </div>
    </div>
  )
}
