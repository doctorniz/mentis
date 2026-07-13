import { describe, it, expect } from 'vitest'
import { resolveSyncConflict } from '@/lib/sync/conflicts'
import type { SyncManifestEntry } from '@/lib/sync/types'

function entry(overrides: Partial<SyncManifestEntry> = {}): SyncManifestEntry {
  return {
    path: 'note.md',
    localHash: 'local-h',
    remoteHash: 'synced-h',
    lastSyncedAt: '2026-07-10T12:00:00.000Z',
    ...overrides,
  }
}

describe('resolveSyncConflict', () => {
  it('no prior sync record → local wins, not a true conflict', () => {
    const d = resolveSyncConflict({
      isLocallyChanged: true,
      remoteHash: 'r1',
      remoteModifiedAt: '2026-07-12T00:00:00.000Z',
      manifestEntry: null,
    })
    expect(d).toEqual({ winner: 'local', isTrueConflict: false })
  })

  it('remote unchanged since last sync → local wins, not a true conflict', () => {
    const d = resolveSyncConflict({
      isLocallyChanged: true,
      remoteHash: 'synced-h', // same as manifest.remoteHash
      remoteModifiedAt: '2026-07-12T00:00:00.000Z',
      manifestEntry: entry(),
    })
    expect(d).toEqual({ winner: 'local', isTrueConflict: false })
  })

  it('only remote changed → remote wins, not a true conflict', () => {
    const d = resolveSyncConflict({
      isLocallyChanged: false,
      remoteHash: 'r-new',
      remoteModifiedAt: '2026-07-12T00:00:00.000Z',
      manifestEntry: entry(),
    })
    expect(d).toEqual({ winner: 'remote', isTrueConflict: false })
  })

  it('both changed, remote newer than last sync → remote wins, TRUE conflict', () => {
    const d = resolveSyncConflict({
      isLocallyChanged: true,
      remoteHash: 'r-new',
      remoteModifiedAt: '2026-07-12T00:00:00.000Z', // after lastSyncedAt
      manifestEntry: entry({ lastSyncedAt: '2026-07-10T12:00:00.000Z' }),
    })
    expect(d).toEqual({ winner: 'remote', isTrueConflict: true })
  })

  it('both changed, remote older than last sync → local wins, TRUE conflict', () => {
    const d = resolveSyncConflict({
      isLocallyChanged: true,
      remoteHash: 'r-new',
      remoteModifiedAt: '2026-07-09T00:00:00.000Z', // before lastSyncedAt
      manifestEntry: entry({ lastSyncedAt: '2026-07-10T12:00:00.000Z' }),
    })
    expect(d).toEqual({ winner: 'local', isTrueConflict: true })
  })

  it('both changed, exact tie → local wins (no accidental remote clobber)', () => {
    const t = '2026-07-10T12:00:00.000Z'
    const d = resolveSyncConflict({
      isLocallyChanged: true,
      remoteHash: 'r-new',
      remoteModifiedAt: t,
      manifestEntry: entry({ lastSyncedAt: t }),
    })
    expect(d).toEqual({ winner: 'local', isTrueConflict: true })
  })

  it('both changed, unparsable remote time → local wins', () => {
    const d = resolveSyncConflict({
      isLocallyChanged: true,
      remoteHash: 'r-new',
      remoteModifiedAt: 'not-a-date',
      manifestEntry: entry(),
    })
    expect(d).toEqual({ winner: 'local', isTrueConflict: true })
  })
})
