// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

async function freshStore() {
  vi.resetModules()
  return import('@/stores/tab-bar')
}

describe('tab bar store', () => {
  beforeEach(() => localStorage.clear())

  it('starts on Today, Calendar, Notes and Chat', async () => {
    const { useTabBarStore } = await freshStore()
    expect(useTabBarStore.getState().tabs).toEqual(['today', 'calendar', 'notes', 'chat'])
  })

  it('keeps a choice for the next launch', async () => {
    const first = await freshStore()
    first.useTabBarStore.getState().setTabs(['tasks', 'search'])
    const { useTabBarStore } = await freshStore()
    expect(useTabBarStore.getState().tabs).toEqual(['tasks', 'search'])
  })

  it('holds four at most', async () => {
    const { useTabBarStore } = await freshStore()
    useTabBarStore.getState().setTabs(['today', 'calendar', 'notes', 'chat', 'tasks'])
    expect(useTabBarStore.getState().tabs).toHaveLength(4)
  })

  it('drops unknown and repeated tabs from storage', async () => {
    localStorage.setItem('ink-tab-bar', JSON.stringify(['files', 'chat', 'chat', 'tasks']))
    const { useTabBarStore } = await freshStore()
    expect(useTabBarStore.getState().tabs).toEqual(['chat', 'tasks'])
  })

  it('falls back to the default when storage is unreadable', async () => {
    localStorage.setItem('ink-tab-bar', '{not json')
    const { useTabBarStore } = await freshStore()
    expect(useTabBarStore.getState().tabs).toEqual(['today', 'calendar', 'notes', 'chat'])
  })
})
