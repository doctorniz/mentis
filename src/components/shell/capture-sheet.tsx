import * as Dialog from '@radix-ui/react-dialog'
import { CaptureBar } from '@/modules/capture/capture-bar'
import { useUiStore } from '@/stores/ui'

/** The tab bar's Capture: the capture bar in a sheet over whatever is showing. */
export default function CaptureSheet({ onClose }: { onClose: () => void }) {
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
            onSaved={(_, { stay }) => !stay && onClose()}
            onEscapeEmpty={onClose}
            onRecord={() => {
              onClose()
              useUiStore.getState().setActiveView('board')
              setTimeout(
                () => window.dispatchEvent(new CustomEvent('ink:board-start-recording')),
                100,
              )
            }}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
