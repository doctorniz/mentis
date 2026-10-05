import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'
import { useVaultSession } from '@/contexts/vault-fs-context'
import type { SettingsField, SettingsPanelProps, SettingsSection } from '@/core/registries/settings'
import { listVaultFolders } from '@/components/settings/folder-list'
import { cn } from '@/utils/cn'

/* Shared primitives — also used by the modules' own settings panels. */

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-fg-tertiary mb-3 text-[10px] font-bold tracking-widest uppercase">
      {children}
    </h3>
  )
}

export function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
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

export const INPUT_CLS =
  'border-border bg-bg-secondary text-fg rounded-md border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent/50 w-48'

export const BUTTON_CLS =
  'border-border bg-bg-secondary text-fg hover:bg-bg-hover rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50'

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
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

export function NumberInput({
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
        className="border-border bg-bg-secondary text-fg focus:ring-accent/50 w-20 rounded-md border px-2.5 py-1.5 text-sm focus:ring-1 focus:outline-none"
      />
      {suffix && <span className="text-fg-muted text-xs">{suffix}</span>}
    </div>
  )
}

function FolderPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { vaultFs } = useVaultSession()
  const [folders, setFolders] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    void listVaultFolders(vaultFs).then((list) => {
      if (!cancelled) setFolders(list)
    })
    return () => {
      cancelled = true
    }
  }, [vaultFs])

  return (
    <div className="relative flex items-center gap-1.5">
      <FolderOpen className="text-fg-muted pointer-events-none absolute left-2.5 size-3.5" />
      <select
        value={value || '/'}
        onChange={(e) => onChange(e.target.value)}
        className="border-border bg-bg-secondary text-fg focus:ring-accent/50 w-48 rounded-md border py-1.5 pr-2.5 pl-8 text-sm focus:ring-1 focus:outline-none"
      >
        {folders.map((f) => (
          <option key={f} value={f}>
            {f === '/' ? 'Root' : f}
          </option>
        ))}
      </select>
    </div>
  )
}

function ActionButton({ field }: { field: Extract<SettingsField, { kind: 'action' }> }) {
  const { vaultFs } = useVaultSession()
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true)
        void field.run({ vaultFs }).finally(() => setBusy(false))
      }}
      className={BUTTON_CLS}
    >
      {busy ? field.busyButton : field.button}
    </button>
  )
}

/* Rendering a registered section. */

function FieldControl({ field, props }: { field: SettingsField; props: SettingsPanelProps }) {
  const { config, update } = props
  switch (field.kind) {
    case 'toggle':
      return <Toggle checked={field.get(config)} onChange={(v) => update(field.set(config, v))} />
    case 'number':
      return (
        <NumberInput
          value={field.get(config)}
          min={field.min}
          max={field.max}
          suffix={field.suffix}
          onChange={(v) => update(field.set(config, v))}
        />
      )
    case 'text':
      return (
        <input
          value={field.get(config)}
          onChange={(e) => update(field.set(config, e.target.value))}
          placeholder={field.placeholder}
          className={INPUT_CLS}
        />
      )
    case 'select':
      return (
        <select
          value={field.get(config)}
          onChange={(e) => update(field.set(config, e.target.value))}
          className={INPUT_CLS}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case 'folder':
      return (
        <FolderPicker value={field.get(config)} onChange={(v) => update(field.set(config, v))} />
      )
    case 'action':
      return <ActionButton field={field} />
  }
}

const panels = new Map<string, ComponentType<SettingsPanelProps>>()

/** One lazy component per section, so a panel keeps its state across renders. */
function panelFor(section: SettingsSection): ComponentType<SettingsPanelProps> {
  let Panel = panels.get(section.id)
  if (!Panel) {
    Panel = lazy(section.panel!)
    panels.set(section.id, Panel)
  }
  return Panel
}

export function SettingsSectionView({
  section,
  props,
}: {
  section: SettingsSection
  props: SettingsPanelProps
}) {
  const fields = (section.fields ?? []).filter((f) => !f.visible || f.visible(props.config))
  const Panel = section.panel ? panelFor(section) : null
  return (
    <div>
      {section.title && <SectionHeader>{section.title}</SectionHeader>}
      {section.description && (
        <p className="text-fg-secondary mb-4 text-xs leading-relaxed">{section.description}</p>
      )}
      {fields.length > 0 && (
        <div className="divide-border divide-y">
          {fields.map((field) => (
            <Row key={field.id} label={field.label} hint={field.hint}>
              <FieldControl field={field} props={props} />
            </Row>
          ))}
        </div>
      )}
      {Panel && (
        <Suspense fallback={<div className="min-h-16" />}>
          <Panel {...props} />
        </Suspense>
      )}
    </div>
  )
}
