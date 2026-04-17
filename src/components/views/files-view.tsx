'use client'

import { FileBrowserView } from '@/components/views/file-browser-view'

/** Full file browser — all folders visible, including hidden system ones like _marrow, _board, etc. */
export function FilesView() {
  return <FileBrowserView showHidden />
}
