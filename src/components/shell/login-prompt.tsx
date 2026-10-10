import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Zap } from 'lucide-react'
import { answerLoginPrompt, setLaunchAtLogin, type DesktopSettings } from '@/modules/desktop/shell'
import { toast } from '@/stores/toast'

/**
 * Asked once, on the first desktop launch: should Mentis start at login and
 * wait in the tray, so the capture hotkey works before the window is opened?
 * Either answer is final here; Settings › Desktop can change it later.
 */
export default function LoginPrompt({
  settings,
  onDone,
}: {
  settings: DesktopSettings
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const { hotkey } = settings

  async function answer(start: boolean) {
    setBusy(true)
    try {
      if (start) await setLaunchAtLogin(true)
      else await answerLoginPrompt()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setBusy(false)
      onDone()
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && void answer(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[199] bg-black/30" />
        <Dialog.Content className="border-border bg-bg fixed top-1/2 left-1/2 z-[200] w-[min(100vw-2rem,440px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-xl outline-none">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="text-accent size-4" aria-hidden />
            <Dialog.Title className="text-fg text-base font-semibold">
              Capture from anywhere
            </Dialog.Title>
          </div>
          <Dialog.Description asChild>
            <div className="text-fg-secondary space-y-2 text-sm leading-relaxed">
              <p>
                {hotkey.registered ? (
                  <>
                    Press <kbd className="font-mono">{hotkey.label}</kbd> in any app to jot a
                    thought, task or event without switching to Mentis.
                  </>
                ) : (
                  <>
                    A hotkey can open capture over any app. {hotkey.label} is already used by
                    another app, so choose another in Settings › Desktop.
                  </>
                )}
              </p>
              <p>
                For that to work before you open Mentis, it can start when you sign in and wait in
                the tray. Closing the window keeps it there; choose Quit from the tray icon to stop
                it. You can change this in Settings › Desktop.
              </p>
            </div>
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void answer(false)}
              className="text-fg-secondary hover:text-fg rounded-lg px-3 py-1.5 text-sm"
            >
              Not now
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void answer(true)}
              className="bg-accent text-accent-fg hover:bg-accent/90 rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              Start at login
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
