'use client'

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'

export function InlineFileTitle({
  path,
  autoFocus = false,
  onFocused,
  onRename,
}: {
  path: string
  autoFocus?: boolean
  onFocused?: () => void
  onRename: (oldPath: string, newName: string) => void
}) {
  const nameWithExt = path.split('/').pop() ?? path
  const ext = nameWithExt.includes('.') ? nameWithExt.slice(nameWithExt.lastIndexOf('.')) : ''
  const stem = nameWithExt.slice(0, nameWithExt.length - ext.length)
  const [value, setValue] = useState(stem)
  const pathRef = useRef(path)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    pathRef.current = path
    const n = path.split('/').pop() ?? path
    const e = n.includes('.') ? n.slice(n.lastIndexOf('.')) : ''
    setValue(n.slice(0, n.length - e.length))
  }, [path])

  useEffect(() => {
    if (!autoFocus) return
    const t = window.setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
      onFocused?.()
    }, 120)
    return () => window.clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus])

  function commit() {
    const trimmed = value.trim()
    if (!trimmed) { setValue(stem); return }
    if (trimmed !== stem) onRename(pathRef.current, trimmed)
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) =>
        setValue(e.target.value.replace(/[/\\:*?"<>|]/g, ''))
      }
      onBlur={commit}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
        if (e.key === 'Escape') { setValue(stem); (e.target as HTMLInputElement).blur() }
      }}
      aria-label="File title"
      className="text-fg placeholder:text-fg-muted min-w-0 flex-1 border-none bg-transparent text-lg font-bold leading-tight tracking-tight outline-none"
      placeholder="Untitled"
    />
  )
}
