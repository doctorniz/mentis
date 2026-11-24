import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { CaptureBar } from '@/modules/capture/capture-bar'
import { useUiStore } from '@/stores/ui'

/** What Capture starts with on each page: what that page shows. */
const DESTINATION_FOR_VIEW: Record<string, string> = {
  tasks: 'task',
  calendar: 'calendar',
  journal: 'journal',
  bookmarks: 'bookmark',
}

/**
 * Capture over whatever is showing: a sheet from the bottom on a phone (the
 * tab bar's Capture), a card in the bottom right on a wide screen (the
 * floating button).
 */
export default function CaptureSheet({ onClose }: { onClose: () => void }) {
  const [initial] = useState(() => DESTINATION_FOR_VIEW[useUiStore.getState().activeView])
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[240] bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="border-border bg-bg safe-bottom fixed inset-x-0 bottom-0 z-[241] rounded-t-2xl border-t p-2 shadow-xl outline-none md:inset-x-auto md:right-6 md:bottom-6 md:w-[32rem] md:max-w-[calc(100vw-3rem)] md:rounded-2xl md:border"
        >
          <Dialog.Title className="sr-only">Capture</Dialog.Title>
          <CaptureBar
            placement="bottom"
            focusSignal={1}
            initialDestination={initial}
            onSaved={(result, { stay }) => {
              if (stay) return
              onClose()
              // A new note opens straight away: the bar's Open goes with the sheet.
              result.open?.()
            }}
            onEscapeEmpty={onClose}
            recordable
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
