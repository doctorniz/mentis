import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

import type { FileSystemAdapter } from '@/lib/fs'
import {
  buildVaultContext,
  buildVaultSystemMessage,
  mergeVaultSourcesSection,
  type VaultContext,
} from '@/lib/chat/vault-rag'
import {
  deleteThread as deleteThreadOnDisk,
  listThreadsFull,
  newMessage,
  newThread,
  writeThread,
  VAULT_CHAT_ASSET_FOLDER,
} from '@/lib/chat/chat-io'
import {
  readVaultChatLastThreadId,
  writeVaultChatLastThreadId,
  clearVaultChatSession,
} from '@/lib/chat/vault-chat-session'
import { getProvider, toWire } from '@/lib/chat/providers'
import { useVaultStore } from '@/stores/vault'
import type {
  ChatMessage,
  ChatSettings,
  ChatThread,
  ChatProviderId,
} from '@/types/chat'

/**
 * Vault-scoped chat store (tier 1).
 *
 * Unlike the per-document `useChatStore`, this one is *vault-scoped*: there
 * is no "active document" — every prompt is answered from a RAG pass over
 * the whole vault's MiniSearch index. Threads live at
 * `_marrow/_chats/_vault/<threadId>.json` so they sit next to (but don't
 * collide with) per-document thread folders. The `_vault` segment is a
 * reserved sentinel — documents use UUIDs for their `chatAssetId`, which
 * can never equal this literal.
 *
 * Streaming + cancellation + per-turn persistence match the per-document
 * store's contract; the only meaningful divergence is the context builder.
 */

/** Reserved chatAssetId for vault-wide threads. Documents mint UUIDs; this literal is safe. */
export const VAULT_CHAT_ASSET_ID = VAULT_CHAT_ASSET_FOLDER

interface SendArgs {
  vaultFs: FileSystemAdapter
  settings: ChatSettings
  apiKey: string
  input: string
}

interface InitArgs {
  vaultFs: FileSystemAdapter
  /** Session-scoped last-active thread (sessionStorage). */
  vaultPath: string
}

interface VaultChatState {
  /** True once the store has loaded threads for the current vault session. */
  initialized: boolean
  /** All vault-scoped threads, newest first. */
  threads: ChatThread[]
  activeThreadId: string | null
  isStreaming: boolean
  abort: AbortController | null
  error: string | null

  init: (args: InitArgs) => Promise<void>
  reset: () => void
  selectThread: (threadId: string) => void
  createThread: () => Promise<ChatThread>
  deleteThread: (args: {
    vaultFs: FileSystemAdapter
    threadId: string
  }) => Promise<void>
  sendMessage: (args: SendArgs) => Promise<void>
  cancel: () => void
  toggleFavourite: (args: {
    vaultFs: FileSystemAdapter
    threadId: string
  }) => Promise<void>
}

const MAX_TITLE_CHARS = 60

function titleFromFirstUserMessage(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (!trimmed) return 'New chat'
  return trimmed.length <= MAX_TITLE_CHARS
    ? trimmed
    : `${trimmed.slice(0, MAX_TITLE_CHARS - 1)}…`
}

export const useVaultChatStore = create<VaultChatState>()(
  immer((set, get) => ({
    initialized: false,
    threads: [],
    activeThreadId: null,
    isStreaming: false,
    abort: null,
    error: null,

    init: async ({ vaultFs, vaultPath }) => {
      // Cancel anything still streaming from a previous vault session.
      get().abort?.abort()

      set((s) => {
        s.threads = []
        s.activeThreadId = null
        s.isStreaming = false
        s.abort = null
        s.error = null
        s.initialized = false
      })

      const existing = await listThreadsFull(vaultFs, VAULT_CHAT_ASSET_ID)
      const remembered = readVaultChatLastThreadId(vaultPath)

      if (existing.length > 0) {
        const replay =
          remembered != null && existing.some((t) => t.id === remembered)

        if (replay) {
          set((s) => {
            s.threads = existing
            s.activeThreadId = remembered!
            s.initialized = true
          })
          return
        }

        const draft = newThread({
          documentAssetId: VAULT_CHAT_ASSET_ID,
          documentPath: '',
        })
        set((s) => {
          s.threads = [draft, ...existing]
          s.activeThreadId = draft.id
          s.initialized = true
        })
        writeVaultChatLastThreadId(vaultPath, draft.id)
        return
      }

      // First open — seed a draft in memory. Persisted only after the first
      // successful send so closing the view immediately leaves no artifacts.
      const draft = newThread({
        documentAssetId: VAULT_CHAT_ASSET_ID,
        documentPath: '',
      })
      set((s) => {
        s.threads = [draft]
        s.activeThreadId = draft.id
        s.initialized = true
      })
      writeVaultChatLastThreadId(vaultPath, draft.id)
    },

    reset: () => {
      get().abort?.abort()
      set((s) => {
        s.threads = []
        s.activeThreadId = null
        s.isStreaming = false
        s.abort = null
        s.error = null
        s.initialized = false
      })
    },

    selectThread: (threadId) => {
      set((s) => {
        if (s.threads.some((t) => t.id === threadId)) {
          s.activeThreadId = threadId
        }
      })
      const path = useVaultStore.getState().activeVaultPath
      if (path && get().activeThreadId === threadId) {
        writeVaultChatLastThreadId(path, threadId)
      }
    },

    createThread: async () => {
      const draft = newThread({
        documentAssetId: VAULT_CHAT_ASSET_ID,
        documentPath: '',
      })
      set((s) => {
        s.threads.unshift(draft)
        s.activeThreadId = draft.id
        s.error = null
      })
      const path = useVaultStore.getState().activeVaultPath
      if (path) writeVaultChatLastThreadId(path, draft.id)
      return draft
    },

    deleteThread: async ({ vaultFs, threadId }) => {
      await deleteThreadOnDisk(vaultFs, VAULT_CHAT_ASSET_ID, threadId)
      set((s) => {
        s.threads = s.threads.filter((t) => t.id !== threadId)
        if (s.activeThreadId === threadId) {
          s.activeThreadId = s.threads[0]?.id ?? null
        }
      })
      const path = useVaultStore.getState().activeVaultPath
      if (!path) return
      const active = get().activeThreadId
      if (active) writeVaultChatLastThreadId(path, active)
      else clearVaultChatSession(path)
    },

    sendMessage: async ({ vaultFs, settings, apiKey, input }) => {
      const text = input.trim()
      if (!text) return

      const state = get()
      if (state.isStreaming) return
      const thread = state.threads.find((t) => t.id === state.activeThreadId)
      if (!thread) return
      if (!settings.provider) {
        set((s) => {
          s.error = 'Select a chat provider in Settings → AI first.'
        })
        return
      }
      if (
        thread.chatBinding &&
        (thread.chatBinding.provider !== settings.provider ||
          thread.chatBinding.model !== settings.model)
      ) {
        set((s) => {
          s.error =
            'This chat was started with a different provider or model. Switch back in Settings → AI to continue.'
        })
        return
      }
      const LOCAL_PROVIDERS = ['device', 'ollama']
      if (!apiKey && !LOCAL_PROVIDERS.includes(settings.provider!)) {
        set((s) => {
          s.error = 'Add an API key in Settings → AI to start chatting.'
        })
        return
      }
      const provider = getProvider(settings.provider)
      if (!provider) {
        set((s) => {
          s.error = `Provider "${settings.provider}" is not available yet.`
        })
        return
      }

      const userMsg: ChatMessage = newMessage('user', text)
      const assistantMsg: ChatMessage = {
        ...newMessage('assistant', '', settings.model),
        streaming: true,
      }

      const abort = new AbortController()

      set((s) => {
        s.error = null
        s.isStreaming = true
        s.abort = abort
        const t = s.threads.find((x) => x.id === thread.id)
        if (!t) return
        const priorUserCount = t.messages.filter((m) => m.role === 'user').length
        t.messages.push(userMsg, assistantMsg)
        if (priorUserCount === 0) {
          t.chatBinding = { provider: settings.provider!, model: settings.model }
        }
        if (t.messages.filter((m) => m.role === 'user').length === 1) {
          t.title = titleFromFirstUserMessage(text)
        }
        t.modifiedAt = new Date().toISOString()
      })

      // RAG over the live search index for every turn. Doing this per-turn
      // (not once per thread) matters: the user's question changes, so the
      // relevant vault excerpts should too.
      let systemMessage: string
      let ctx: VaultContext
      try {
        ctx = await buildVaultContext(vaultFs, text, settings)
        systemMessage = buildVaultSystemMessage(ctx, settings)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        set((s) => {
          s.isStreaming = false
          s.abort = null
          const t = s.threads.find((x) => x.id === thread.id)
          const last = t?.messages[t.messages.length - 1]
          if (last && last.role === 'assistant') {
            last.streaming = false
            last.error = `Context build failed: ${msg}`
          }
        })
        const failedThread = get().threads.find((t) => t.id === thread.id)
        if (failedThread) {
          try {
            await writeThread(vaultFs, failedThread)
          } catch (persistErr) {
            const pmsg =
              persistErr instanceof Error ? persistErr.message : String(persistErr)
            set((s) => {
              s.error = `Failed to save chat: ${pmsg}`
            })
          }
        }
        return
      }

      const prior = thread.messages.concat(userMsg)
      const wire = [
        { role: 'system' as const, content: systemMessage },
        ...toWire(prior),
      ]

      let sawDelta = false
      let streamError: string | null = null

      try {
        for await (const chunk of provider.streamChat({
          model: settings.model,
          messages: wire,
          apiKey,
          baseUrl: settings.baseUrl,
          signal: abort.signal,
        })) {
          if (abort.signal.aborted) break
          if (chunk.type === 'delta') {
            sawDelta = true
            set((s) => {
              const t = s.threads.find((x) => x.id === thread.id)
              const last = t?.messages[t.messages.length - 1]
              if (last && last.role === 'assistant') {
                last.content += chunk.content
              }
            })
          } else if (chunk.type === 'error') {
            streamError = chunk.message
            break
          } else if (chunk.type === 'done') {
            break
          }
        }
      } catch (err) {
        streamError = err instanceof Error ? err.message : String(err)
      }

      set((s) => {
        const t = s.threads.find((x) => x.id === thread.id)
        const last = t?.messages[t.messages.length - 1]
        if (last && last.role === 'assistant') {
          last.streaming = false
          if (streamError) last.error = streamError
          if (!sawDelta && !streamError && abort.signal.aborted) {
            last.error = 'Cancelled'
          }
          if (
            !streamError &&
            !last.error &&
            ctx.hits.length > 0 &&
            sawDelta
          ) {
            last.content = mergeVaultSourcesSection(last.content, ctx.hits)
            last.vaultRagHitPaths = ctx.hits.map((h) => h.path)
          }
        }
        if (t) t.modifiedAt = new Date().toISOString()
        s.isStreaming = false
        s.abort = null
      })

      // Persist once per turn — same cadence as the per-doc store.
      const finalThread = get().threads.find((t) => t.id === thread.id)
      if (finalThread) {
        try {
          await writeThread(vaultFs, finalThread)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          set((s) => {
            s.error = `Failed to save chat: ${msg}`
          })
        }
      }
    },

    cancel: () => {
      const { abort } = get()
      if (abort && !abort.signal.aborted) abort.abort()
    },

    toggleFavourite: async ({ vaultFs, threadId }) => {
      set((s) => {
        const t = s.threads.find((x) => x.id === threadId)
        if (!t) return
        t.favouritedAt = t.favouritedAt
          ? undefined
          : new Date().toISOString()
        t.modifiedAt = new Date().toISOString()
      })
      const t = get().threads.find((x) => x.id === threadId)
      if (t) {
        try {
          await writeThread(vaultFs, t)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          set((s) => {
            s.error = `Failed to save chat: ${msg}`
          })
        }
      }
    },
  })),
)

/** Selector: the currently visible thread, or null if none. */
export function selectActiveVaultThread(
  s: VaultChatState,
): ChatThread | null {
  if (!s.activeThreadId) return null
  return s.threads.find((t) => t.id === s.activeThreadId) ?? null
}

/** Provider ids that are wired end-to-end. Kept in sync with the per-doc store's constant. */
export const VAULT_IMPLEMENTED_PROVIDERS: ChatProviderId[] = [
  'openrouter',
  'openai',
  'anthropic',
  'gemini',
  'ollama',
  'device',
]
