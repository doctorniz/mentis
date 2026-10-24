import { useEffect, useState } from 'react'
import type { SettingsPanelProps } from '@/core/registries/settings'
import { useVaultSession } from '@/contexts/vault-fs-context'
import { thoughtsDir } from '@/lib/board'
import { moveThoughtsFolder } from '@/lib/board/move-folder'
import { BUTTON_CLS, INPUT_CLS, Row } from '@/components/settings/fields'
import { THOUGHTS_DIR } from '@/types/vault'
import { toast } from '@/stores/toast'

/**
 * The Thoughts folder. Typing changes nothing; Move moves the thoughts and
 * then saves the new folder, so a half-typed path never becomes a destination.
 */
export default function ThoughtsFolderSetting({ config, saveNow }: SettingsPanelProps) {
  const { vaultFs } = useVaultSession()
  const current = thoughtsDir(config)
  const [value, setValue] = useState(current)
  const [moving, setMoving] = useState(false)

  useEffect(() => setValue(current), [current])

  const next = value.trim().replace(/^\/+|\/+$/g, '')
  const canMove = !moving && next !== '' && next !== current

  async function move() {
    setMoving(true)
    try {
      await moveThoughtsFolder(vaultFs, current, next)
      await saveNow({ ...config, thoughtsFolder: next })
      toast.success(`Thoughts folder is now ${next}`)
    } catch (err) {
      console.error('Moving thoughts failed:', err)
      toast.error(
        err instanceof Error
          ? `Could not move thoughts: ${err.message}`
          : 'Could not move thoughts',
      )
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="divide-border divide-y">
      <Row
        label="Thoughts folder"
        hint="Move to an empty or new folder. Every note in it is a thought."
      >
        <div className="flex items-center gap-1.5">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canMove) void move()
            }}
            placeholder={THOUGHTS_DIR}
            aria-label="Thoughts folder"
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
