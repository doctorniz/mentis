import { describe, it, expect } from 'vitest'
import { resolveSyncConflict, decideRemoteUpdate, decideRemoteDelete } from '@/lib/sync/conflicts'
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

/* ---- delta-pull decisions (S6) ---- */

describe('decideRemoteUpdate (delta pull)', () => {
  const REMOTE_NEW = { remoteHash: 'r-new', remoteModifiedAt: '2026-07-12T00:00:00.000Z' }

  it('remote hash unchanged → none', () => {
    const d = decideRemoteUpdate({
      manifestEntry: entry(),
      localHash: 'anything',
      remoteHash: 'synced-h',
      remoteModifiedAt: '2026-07-12T00:00:00.000Z',
    })
    expect(d).toEqual({ action: 'none', isTrueConflict: false })
  })

  it('new remote file, nothing local → pull', () => {
    const d = decideRemoteUpdate({ manifestEntry: null, localHash: null, ...REMOTE_NEW })
    expect(d).toEqual({ action: 'pull', isTrueConflict: false })
  })

  it('new remote file but a local create occupies the path → local wins (pushed)', () => {
    const d = decideRemoteUpdate({ manifestEntry: null, localHash: 'local-created', ...REMOTE_NEW })
    expect(d).toEqual({ action: 'push-local', isTrueConflict: false })
  })

  it('remote changed, local unchanged → pull (ordinary update)', () => {
    const d = decideRemoteUpdate({ manifestEntry: entry(), localHash: 'local-h', ...REMOTE_NEW })
    expect(d).toEqual({ action: 'pull', isTrueConflict: false })
  })

  it('remote changed, local file missing → pull (restore)', () => {
    const d = decideRemoteUpdate({ manifestEntry: entry(), localHash: null, ...REMOTE_NEW })
    expect(d).toEqual({ action: 'pull', isTrueConflict: false })
  })

  it('remote changed AND unpushed local edit, remote newer → pull, TRUE conflict', () => {
    const d = decideRemoteUpdate({
      manifestEntry: entry({ lastSyncedAt: '2026-07-10T12:00:00.000Z' }),
      localHash: 'local-edited', // differs from manifest localHash
      remoteHash: 'r-new',
      remoteModifiedAt: '2026-07-12T00:00:00.000Z',
    })
    expect(d).toEqual({ action: 'pull', isTrueConflict: true })
  })

  it('remote changed AND unpushed local edit, remote older → local wins (pushed), TRUE conflict', () => {
    // THE S6 clobber case: the old delta path pulled here unconditionally.
    const d = decideRemoteUpdate({
      manifestEntry: entry({ lastSyncedAt: '2026-07-10T12:00:00.000Z' }),
      localHash: 'local-edited',
      remoteHash: 'r-new',
      remoteModifiedAt: '2026-07-09T00:00:00.000Z',
    })
    expect(d).toEqual({ action: 'push-local', isTrueConflict: true })
  })
})

describe('decideRemoteDelete (delta pull)', () => {
  it('nothing local → forget the manifest row', () => {
    expect(decideRemoteDelete({ manifestEntry: entry(), localExists: false, localHash: null })).toBe(
      'forget',
    )
  })

  it('local file exists but was never synced → keep it', () => {
    expect(
      decideRemoteDelete({ manifestEntry: null, localExists: true, localHash: 'whatever' }),
    ).toBe('keep-local')
  })

  it('local file unreadable → keep it (play safe)', () => {
    expect(decideRemoteDelete({ manifestEntry: entry(), localExists: true, localHash: null })).toBe(
      'keep-local',
    )
  })

  it('local unchanged since last sync → delete locally', () => {
    expect(
      decideRemoteDelete({ manifestEntry: entry(), localExists: true, localHash: 'local-h' }),
    ).toBe('delete-local')
  })

  it('local edited since last sync → edit wins over delete (pushed)', () => {
    expect(
      decideRemoteDelete({ manifestEntry: entry(), localExists: true, localHash: 'local-edited' }),
    ).toBe('push-local')
  })
})
