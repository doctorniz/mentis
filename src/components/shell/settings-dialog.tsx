import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { useVaultStore } from '@/stores/vault'
import { DEFAULT_VAULT_CONFIG, type VaultConfig } from '@/types/vault'
import { saveVaultConfig } from '@/lib/vault'
import { settings } from '@/core/registries'
import type { ConfigPatch } from '@/core/registries/settings'
import { SettingsSectionView } from '@/components/settings/fields'
import { resetFolderList } from '@/components/settings/folder-list'
import { cn } from '@/utils/cn'

/**
 * The settings dialog. Its tabs and sections come from the settings registry;
 * this file only keeps the draft and saves it. Loaded lazily, when first opened.
 */
export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = 'vault',
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** Tab selected when the dialog opens: a tab label in lower case. */
  initialTab?: string
}) {
  const { vaultFs, vaultPath } = useVaultSession()
  const config = useVaultStore((s) => s.config)
  const updateConfig = useVaultStore((s) => s.updateConfig)
  const tabs = settings.tabs()

  const [draft, setDraft] = useState<VaultConfig>(config ?? DEFAULT_VAULT_CONFIG)
  const [activeTab, setActiveTab] = useState(initialTab)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Set when the next draft change is not an edit (opening, a save that already ran). */
  const skipNextSave = useRef(true)

  // Reset the draft when the dialog OPENS — and only then. Each save calls
  // updateConfig, which changes `config`'s identity; resetting on that too
  // would clobber keystrokes typed while a save is in flight.
  const wasOpenRef = useRef(false)
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current
    wasOpenRef.current = open
    if (justOpened && config) {
      skipNextSave.current = true
      resetFolderList()
      setDraft({ ...DEFAULT_VAULT_CONFIG, ...config })
      setSaved(false)
    }
  }, [open, config])

  useEffect(() => {
    if (open) setActiveTab(initialTab)
  }, [open, initialTab])

  const cancelPendingSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
  }

  /** The one way the dialog writes config.json. */
  const persist = useCallback(
    async (next: VaultConfig) => {
      setSaving(true)
      try {
        await saveVaultConfig(vaultFs, next)
        updateConfig(next)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } finally {
        setSaving(false)
      }
    },
    [vaultFs, updateConfig],
  )

  // Save 600 ms after the last edit.
  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    setSaved(false)
    cancelPendingSave()
    saveTimerRef.current = setTimeout(() => void persist(draft), 600)
    return cancelPendingSave
  }, [draft, persist])

  const update = useCallback((patch: ConfigPatch) => {
    setDraft((d) => ({ ...d, ...patch }))
  }, [])

  const saveNow = useCallback(
    async (next: VaultConfig) => {
      cancelPendingSave()
      // Only a draft that actually changes re-runs the save effect to skip.
      setDraft((d) => {
        if (d !== next) skipNextSave.current = true
        return next
      })
      await persist(next)
    },
    [persist],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      void saveNow(draft).catch(() => {})
    }
  }

  const panelProps = { config: draft, update, saveNow, vaultId: vaultPath }

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
            onValueChange={setActiveTab}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Tabs.List className="border-border bg-bg-secondary flex shrink-0 gap-0 border-b px-5">
              {tabs.map(({ id, label }) => (
                <Tabs.Trigger
                  key={id}
                  value={id}
                  className={cn(
                    'border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                    activeTab === id
                      ? 'border-accent text-accent'
                      : 'text-fg-secondary hover:text-fg border-transparent',
                  )}
                >
                  {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {tabs.map((tab) => (
                <Tabs.Content key={tab.id} value={tab.id} className="space-y-6">
                  {tab.sections.map((section) => (
                    <SettingsSectionView key={section.id} section={section} props={panelProps} />
                  ))}
                </Tabs.Content>
              ))}
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
