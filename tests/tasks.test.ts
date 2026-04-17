import { describe, expect, it } from 'vitest'
import type { TaskFrontmatter } from '@/types/tasks'
import { defaultTaskFrontmatter, serializeTask, bodyFromTitle } from '@/lib/tasks'

describe('tasks serialize', () => {
  it('defaultTaskFrontmatter ignores undefined overrides so priority stays 3', () => {
    const fm = defaultTaskFrontmatter({
      priority: undefined,
      due: '',
      tags: [],
      parent: '',
    })
    expect(fm.priority).toBe(3)
    expect(() => serializeTask(fm, bodyFromTitle('Hello'))).not.toThrow()
  })

  it('serializeTask strips undefined keys from frontmatter', () => {
    const fm = defaultTaskFrontmatter({})
    const dirty = { ...(fm as Record<string, unknown>), stray: undefined }
    expect(() => serializeTask(dirty as unknown as TaskFrontmatter, '\n# T\n')).not.toThrow()
  })
})
