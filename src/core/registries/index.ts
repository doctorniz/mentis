import { createFileTypeRegistry, type FileTypeDefinition } from '@/core/registries/file-types'

export type { FileTypeDefinition, FileTypeRegistry } from '@/core/registries/file-types'

/**
 * Every module registers itself by exporting a definition from
 * `src/modules/<name>/register.ts`. Discovery is by glob, so adding a module
 * never requires editing a central list.
 */
const registrations = import.meta.glob<{ default: FileTypeDefinition }>(
  '/src/modules/*/register.ts',
  { eager: true },
)

export const fileTypes = createFileTypeRegistry(
  Object.keys(registrations)
    .sort()
    .map((key) => registrations[key].default),
)
