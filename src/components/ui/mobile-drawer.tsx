'use client'

import * as Dialog from '@radix-ui/react-dialog'

/**
 * The one mobile drawer for per-view sub-sidebars (vault tree, task
 * lists, bookmark categories, chat threads, …).
 *
 * Policy:
 *   - Every view-level sidebar switches to this drawer below `md`
 *     (768px, `MOBILE_NAV_MEDIA_QUERY`) — never `sm`, never a
 *     hand-rolled fixed/translate overlay (those had no focus trap, no
 *     Escape handling, and invented their own z-indexes).
 *   - The trigger button shows the SECTION'S OWN icon (the same icon
 *     as its main-nav / tab entry: Vault, CheckSquare, Bookmark,
 *     Sparkles, …), not a generic hamburger — the hamburger is
 *     reserved for the app-level masthead menu.
 *   - z-scale: view drawers sit at 210/211; the app masthead drawer
 *     stays above at 240/241.
 *
 * Radix Dialog supplies focus trap, Escape-to-close, and backdrop
 * dismissal for free.
 */
export function MobileDrawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Screen-reader name for the drawer (visually hidden). */
  title: string
  children: React.ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[210] bg-black/40 md:hidden" />
        <Dialog.Content
          className="border-border bg-bg fixed top-0 left-0 z-[211] flex h-full w-[min(100vw-2rem,320px)] flex-col border-r shadow-xl outline-none md:hidden"
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
