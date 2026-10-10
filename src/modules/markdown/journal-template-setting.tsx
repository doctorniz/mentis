import { useEffect, useState } from 'react'
import type { SettingsPanelProps } from '@/core/registries/settings'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { INPUT_CLS, Row } from '@/components/settings/fields'
import { listTemplates, type NoteTemplate } from '@/lib/notes/template-store'
import { readJournalTemplate } from '@/lib/journal'
import { DEFAULT_VAULT_CONFIG } from '@/types/vault'

/**
 * Which template new journal days start from. Its `##` headings become the
 * day's tabs; `defaultTab` in its frontmatter picks the one to open. Days
 * already written keep the tabs they have.
 */
export default function JournalTemplateSetting({ config, update }: SettingsPanelProps) {
  const { vaultFs } = useVaultSession()
  const [templates, setTemplates] = useState<NoteTemplate[]>([])
  const [tabs, setTabs] = useState<string[]>([])
  const folder = config.templateFolder ?? DEFAULT_VAULT_CONFIG.templateFolder

  useEffect(() => {
    void listTemplates(vaultFs, folder).then(setTemplates)
  }, [vaultFs, folder])

  useEffect(() => {
    let cancelled = false
    void readJournalTemplate(vaultFs, config).then((t) => !cancelled && setTabs(t?.tabs ?? []))
    return () => {
      cancelled = true
    }
  }, [vaultFs, config])

  if (config.dailyNotesEnabled === false) return null
  const chosen = config.journalTemplate ?? ''
  const missing = chosen && !templates.some((t) => t.filename === chosen)

  return (
    <div className="divide-border divide-y">
      <Row
        label="Journal template"
        hint={
          missing
            ? 'That template is no longer in the templates folder; new days start plain.'
            : tabs.length
              ? `New days get the tabs ${tabs.join(' · ')}. Days already written keep theirs.`
              : 'New days start from this template. Its ## headings become the day’s tabs.'
        }
      >
        <select
          aria-label="Journal template"
          value={chosen}
          onChange={(e) => update({ journalTemplate: e.target.value })}
          className={INPUT_CLS}
        >
          <option value="">None (a plain day)</option>
          {missing && <option value={chosen}>{chosen.replace(/\.md$/, '')} (missing)</option>}
          {templates.map((t) => (
            <option key={t.id} value={t.filename}>
              {t.name}
            </option>
          ))}
        </select>
      </Row>
    </div>
  )
}
