import { useEffect, useState } from 'react'
import { BUTTON_CLS, Row, Toggle } from '@/components/settings/fields'
import { cn } from '@/utils/cn'
import { hotkeyFromEvent, hotkeyLabel } from './hotkey'
import {
  getDesktopSettings,
  setCaptureHotkey,
  setLaunchAtLogin,
  type DesktopSettings,
} from './shell'

/**
 * The capture hotkey and launch at login. These are this machine's, saved by
 * the desktop shell, not in the vault's config — so they apply at once and
 * are not part of the dialog's draft.
 */
export default function DesktopSettingsPanel() {
  const [settings, setSettings] = useState<DesktopSettings | null>(null)
  const [recording, setRecording] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getDesktopSettings()
      .then(setSettings)
      .catch(() => setMessage({ text: 'Could not read the desktop settings', error: true }))
  }, [])

  async function applyHotkey(hotkey: string | null) {
    setBusy(true)
    try {
      const status = await setCaptureHotkey(hotkey)
      setSettings((s) => (s ? { ...s, hotkey: status } : s))
      setMessage({ text: `Capture is now ${status.label}`, error: false })
    } catch (err) {
      setMessage({ text: String(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  function onRecordKey(e: React.KeyboardEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      setRecording(false)
      setMessage(null)
      return
    }
    const recorded = hotkeyFromEvent(e)
    if (recorded.kind === 'incomplete') return
    if (recorded.kind === 'invalid') {
      setMessage({ text: recorded.reason, error: true })
      return
    }
    setRecording(false)
    void applyHotkey(recorded.hotkey)
  }

  async function onLaunchAtLogin(enabled: boolean) {
    setBusy(true)
    try {
      const now = await setLaunchAtLogin(enabled)
      setSettings((s) => (s ? { ...s, launchAtLogin: now, loginPromptAnswered: true } : s))
    } catch (err) {
      setMessage({ text: String(err), error: true })
    } finally {
      setBusy(false)
    }
  }

  if (!settings) {
    return message ? <p className="text-danger text-xs">{message.text}</p> : null
  }
  const hotkey = settings.hotkey

  return (
    <div>
      <div className="divide-border divide-y">
        <Row
          label="Capture hotkey"
          hint={
            hotkey.registered
              ? 'Opens capture over any app.'
              : `${hotkey.label} is used by another app, so it does nothing. Choose another.`
          }
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRecording(true)
                setMessage({ text: 'Press the new hotkey, or Esc to cancel', error: false })
              }}
              onKeyDown={recording ? onRecordKey : undefined}
              onBlur={() => setRecording(false)}
              aria-label={recording ? 'Press the new hotkey' : `Capture hotkey: ${hotkey.label}`}
              className={cn(
                BUTTON_CLS,
                'min-w-[9rem] font-mono',
                recording && 'ring-accent ring-2',
                !hotkey.registered && !recording && 'text-danger line-through',
              )}
            >
              {recording ? 'Press keys…' : hotkeyLabel(hotkey.hotkey)}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void applyHotkey(null)}
              className="text-fg-muted hover:text-fg text-xs"
            >
              Reset
            </button>
          </div>
        </Row>
        <Row
          label="Start Mentis when you sign in"
          hint="Mentis waits in the tray, so the hotkey works before you open it. Closing the window keeps it in the tray; choose Quit from the tray icon to stop it."
        >
          <Toggle checked={settings.launchAtLogin} onChange={(v) => void onLaunchAtLogin(v)} />
        </Row>
      </div>
      {message && (
        <p
          role={message.error ? 'alert' : 'status'}
          className={cn('mt-2 text-xs', message.error ? 'text-danger' : 'text-fg-muted')}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
