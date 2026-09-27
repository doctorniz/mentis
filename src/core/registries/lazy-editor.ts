import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { fileTypes } from '@/core/registries'
import type { FileEditorProps, FileTypeDefinition } from '@/core/registries/file-types'

type LazyEditor = LazyExoticComponent<ComponentType<FileEditorProps>>

// One lazy wrapper per type for the life of the app. Creating a new lazy()
// per render would remount the editor and re-suspend on every render.
const cache = new Map<string, LazyEditor>()

export function lazyEditorFor(def: FileTypeDefinition): LazyEditor | undefined {
  if (!def.editor) return undefined
  let component = cache.get(def.id)
  if (!component) {
    component = lazy(def.editor)
    cache.set(def.id, component)
  }
  return component
}

/**
 * Start fetching a type's editor chunk without rendering it, so the first open
 * doesn't wait on the network. Safe to call repeatedly — the module loader
 * dedupes the import.
 */
export function preloadEditor(id: string): void {
  void fileTypes
    .get(id)
    ?.editor?.()
    .catch(() => {
      // A failed preload is retried by the real open, which surfaces the error.
    })
}
