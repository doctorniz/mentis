import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useToastStore, toast } from '@/stores/toast'

describe('Toast Store', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })

  it('adds a toast', () => {
    toast.info('Hello')
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0]!.message).toBe('Hello')
    expect(useToastStore.getState().toasts[0]!.variant).toBe('info')
  })

  it('toast.error sets error variant', () => {
    toast.error('Oops')
    expect(useToastStore.getState().toasts[0]!.variant).toBe('error')
  })

  it('toast.success sets success variant', () => {
    toast.success('Done')
    expect(useToastStore.getState().toasts[0]!.variant).toBe('success')
  })

  it('toast.warning sets warning variant', () => {
    toast.warning('Careful')
    expect(useToastStore.getState().toasts[0]!.variant).toBe('warning')
  })

  it('auto-dismisses after duration', () => {
    toast.info('Temp', 1000)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    vi.advanceTimersByTime(1100)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('manual dismiss removes toast', () => {
    const id = toast.info('Sticky', 0)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    toast.dismiss(id)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('returns unique ids', () => {
    const id1 = toast.info('One')
    const id2 = toast.info('Two')
    expect(id1).not.toBe(id2)
  })

  it('queues multiple toasts', () => {
    toast.info('A')
    toast.error('B')
    toast.warning('C')
    expect(useToastStore.getState().toasts).toHaveLength(3)
  })

  it('uses default durations per variant', () => {
    toast.info('i')
    expect(useToastStore.getState().toasts[0]!.durationMs).toBe(4000)
    toast.error('e')
    const errToast = useToastStore.getState().toasts.find((t) => t.variant === 'error')
    expect(errToast!.durationMs).toBe(6000)
  })
})
