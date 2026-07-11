/**
 * Matches Tailwind `md` (768px): phones and narrow tablets.
 *
 * POLICY: this is the app's single mobile breakpoint. ALL mobile layout
 * switches key off it — the main sidebar/masthead swap, and every
 * view-level sub-sidebar collapsing into a `MobileDrawer`
 * (`components/ui/mobile-drawer.tsx`). Never branch mobile behavior on
 * `sm` (640px) or an ad-hoc width: between two breakpoints the app ends
 * up half-mobile (masthead shown, but a view still rendering its
 * desktop sidebar).
 */
export const MOBILE_NAV_MEDIA_QUERY = '(max-width: 767px)'

/**
 * Below this width the PPTX editor switches to a compact read-only
 * slide viewer (no ribbon, no slide reel, vault tree auto-collapsed).
 */
export const PPTX_COMPACT_MEDIA_QUERY = '(max-width: 1380px)'

/**
 * Below this width, full-width editors (docx, xlsx, pptx) auto-collapse
 * the vault tree to give the editor more room.
 */
export const WIDE_EDITOR_MEDIA_QUERY = '(max-width: 1380px)'

/**
 * Below this width, the canvas editor auto-collapses the vault tree.
 * More aggressive than WIDE_EDITOR because canvas benefits most from
 * horizontal space.
 */
export const CANVAS_TREE_MEDIA_QUERY = '(max-width: 1200px)'

/**
 * Below this width, the canvas editor also auto-collapses the nav sidebar.
 */
export const CANVAS_SIDEBAR_MEDIA_QUERY = '(max-width: 1050px)'
