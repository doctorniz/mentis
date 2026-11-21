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

/** The tab bar's Capture: the capture bar in a sheet over whatever is showing. */
export default function CaptureSheet({ onClose }: { onClose: () => void }) {
  const [initial] = useState(() => DESTINATION_FOR_VIEW[useUiStore.getState().activeView])
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[240] bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="border-border bg-bg safe-bottom fixed inset-x-0 bottom-0 z-[241] rounded-t-2xl border-t p-2 shadow-xl outline-none"
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
            onRecord={() => {
              onClose()
              useUiStore.getState().requestRecord()
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
