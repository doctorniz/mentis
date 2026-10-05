import {
  createViewRegistry,
  HOME_VIEW,
  type ViewDefinition,
  type ViewId,
} from '@/core/registries/views'
import { createFileTypeRegistry, type FileTypeDefinition } from '@/core/registries/file-types'
import { createSettingsRegistry, type SettingsSection } from '@/core/registries/settings'

export type { FileTypeDefinition, FileTypeRegistry } from '@/core/registries/file-types'
export type { ViewDefinition, ViewRegistry, ResolvedView, ViewId } from '@/core/registries/views'
export type {
  SettingsField,
  SettingsPanelProps,
  SettingsSection,
  SettingsTab,
} from '@/core/registries/settings'
export { HOME_VIEW } from '@/core/registries/views'

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

/** Registry id for a path, or `'other'` for files no module claims. */
export function fileTypeIdOf(path: string): string {
  return fileTypes.resolve(path)?.id ?? 'other'
}

/**
 * Display title for a vault path: the file name without its type's suffix
 * (the whole compound suffix — `deck.slides.md` → `deck`), or with the
 * extension kept for types that ask (code: `a.ts` vs `a.py`). Unknown files
 * lose their last extension.
 */
export function titleForPath(path: string): string {
  const name = path.split('/').pop() ?? path
  if (fileTypes.resolve(path)?.keepExtensionInTitle) return name
  const suffix = fileTypes.matchedSuffix(path)
  if (suffix && name.length > suffix.length) return name.slice(0, name.length - suffix.length)
  return name.replace(/\.[^/.]+$/i, '')
}

const viewRegistrations = import.meta.glob<{ default: ViewDefinition }>('/src/modules/*/view.ts', {
  eager: true,
})

/** Every full-screen view, discovered from `src/modules/<name>/view.ts`. */
export const views = createViewRegistry(
  Object.keys(viewRegistrations)
    .sort()
    .map((key) => viewRegistrations[key].default),
)

/** A view id from outside the type system (a vault's config.json); home if it names no view. */
export function viewIdOrHome(id: string | undefined): ViewId {
  return id && views.resolve(id) ? (id as ViewId) : HOME_VIEW
}

const settingsRegistrations = import.meta.glob<{ default: readonly SettingsSection[] }>(
  '/src/modules/*/settings.ts',
  { eager: true },
)

/** Every settings section, discovered from `src/modules/<name>/settings.ts`. */
export const settings = createSettingsRegistry(
  Object.keys(settingsRegistrations)
    .sort()
    .flatMap((key) => settingsRegistrations[key].default),
)
