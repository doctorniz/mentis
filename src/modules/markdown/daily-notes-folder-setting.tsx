import { useEffect, useState } from 'react'
import type { SettingsPanelProps } from '@/core/registries/settings'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { migrateDailyNotesFolder } from '@/lib/notes/daily-note'
import { BUTTON_CLS, INPUT_CLS, Row } from '@/components/settings/fields'
import { DAILY_NOTES_DIR } from '@/types/vault'
import { toast } from '@/stores/toast'

/**
 * The daily notes folder. Typing changes nothing; Move moves the existing
 * daily notes and then saves the new folder, so a half-typed path never
 * becomes a destination.
 */
export default function DailyNotesFolderSetting({ config, saveNow }: SettingsPanelProps) {
  const { vaultFs } = useVaultSession()
  const current = config.dailyNotesFolder ?? DAILY_NOTES_DIR
  const [value, setValue] = useState(current)
  const [moving, setMoving] = useState(false)

  useEffect(() => setValue(current), [current])

  if (config.dailyNotesEnabled === false) return null

  const next = value.trim()
  const canMove = !moving && next !== '' && next !== current

  async function move() {
    setMoving(true)
    try {
      await migrateDailyNotesFolder(vaultFs, current, next)
      await saveNow({ ...config, dailyNotesFolder: next })
      toast.success(`Daily notes folder is now ${next}`)
    } catch (err) {
      console.error('Moving daily notes failed:', err)
      toast.error('Could not move daily notes')
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="divide-border divide-y">
      <Row
        label="Daily notes folder"
        hint="Type a folder, then Move. Existing daily notes are moved there; the folder is created if needed."
      >
        <div className="flex items-center gap-1.5">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canMove) void move()
            }}
            placeholder={DAILY_NOTES_DIR}
            className={INPUT_CLS}
          />
          <button
            type="button"
            disabled={!canMove}
            onClick={() => void move()}
            className={BUTTON_CLS}
          >
            {moving ? 'Moving…' : 'Move'}
          </button>
        </div>
      </Row>
    </div>
  )
}
