import { useEffect, useState } from 'react'
import { ChatAssistantHtml } from '@/components/chat/chat-assistant-html'
import { useVaultSession } from '@/contexts/vault-fs-context'
import type { FileEditorProps } from '@/core/registries/file-types'
import { renderChatMarkdown } from '@/lib/chat/render-markdown'
import { parseNote } from '@/lib/markdown/parse'
import { useEditorStore } from '@/stores/editor'

/** A saved chat, read-only: the conversation as it was exported. */
export default function ChatFileViewer({ path, tabId }: FileEditorProps) {
  const { vaultFs } = useVaultSession()
  const updateTab = useEditorStore((s) => s.updateTab)
  const [state, setState] = useState<{ title: string; html: string } | null>(null)

  useEffect(() => {
    let live = true
    void vaultFs.readTextFile(path).then((raw) => {
      if (!live) return
      const doc = parseNote(path, raw)
      const fm = doc.frontmatter.title
      const title =
        (typeof fm === 'string' && fm) ||
        (path.split('/').pop() ?? path).replace(/\.chat\.md$/i, '')
      updateTab(tabId, { title, isDirty: false })
      setState({ title, html: renderChatMarkdown(doc.content) })
    })
    return () => {
      live = false
    }
  }, [vaultFs, path, tabId, updateTab])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        {state && (
          <>
            <h1 className="text-fg mb-4 text-xl font-semibold">{state.title}</h1>
            <ChatAssistantHtml html={state.html} />
          </>
        )}
      </div>
    </div>
  )
}
