# Ink by Marrow — Risks & Mitigations

## Technical Risks

### 1. OPFS / FSAPI Browser Support

| | |
|---|---|
| **Risk** | Safari has limited File System Access API support |
| **Impact** | High — Safari users can't use "open folder" vault access |
| **Likelihood** | Certain (FSAPI is Chromium-only as of 2026) |
| **Mitigation** | OPFS is well-supported across all modern browsers including Safari. OPFS is the primary adapter; FSAPI is progressive enhancement for Chromium users who want to work with an existing folder on disk. Fallback to IndexedDB virtual FS as a last resort. |
| **Status** | Accepted — design accounts for this |

### 2. PDF.js Performance on Large Files

| | |
|---|---|
| **Risk** | Slow rendering and high memory usage on PDFs with 100+ pages |
| **Impact** | Medium — poor UX for users working with large documents |
| **Likelihood** | Likely |
| **Mitigation** | Lazy page rendering: only render visible pages + 1 adjacent page in each direction. Use PDF.js Web Worker for parsing. Release page canvases when scrolled out of view. LRU cache for rendered pages. Monitor memory usage and show warnings above thresholds. |
| **Monitoring** | Performance benchmarks in CI against 50-page and 200-page test PDFs |

### 3. Freehand Drawing Latency

| | |
|---|---|
| **Risk** | Visible lag between stylus/mouse movement and stroke appearance |
| **Impact** | High — makes drawing unusable, especially on tablets |
| **Likelihood** | Moderate |
| **Mitigation** | Use `PointerEvent.getCoalescedEvents()` for full-resolution input. Consider OffscreenCanvas or direct WebGL rendering for strokes if Fabric.js canvas is too slow. Profile and optimize the hot path. Dedicated requestAnimationFrame loop for stroke rendering. |
| **Monitoring** | Input-to-pixel latency benchmarks on target devices |

### 4. Destructive Write Corruption

| | |
|---|---|
| **Risk** | PDF file corruption if write is interrupted (crash, tab close, power loss) |
| **Impact** | Critical — user data loss |
| **Likelihood** | Low (but catastrophic) |
| **Mitigation** | Write to a temporary file first, then atomic rename to the target path. Pre-edit snapshots in `_marrow/snapshots/` provide a recovery point. Verify PDF integrity after write by checking file header bytes. Show "unsaved changes" indicator in UI. Warn on tab close if dirty. |
| **Monitoring** | Integrity check on file open; corrupt file recovery flow |

### 5. pdf-lib Annotation Fidelity

| | |
|---|---|
| **Risk** | Not all PDF annotation types are fully supported by pdf-lib; some annotations may render differently across viewers |
| **Impact** | Medium — annotations might not look identical in Acrobat vs. Preview vs. Chrome |
| **Likelihood** | Moderate |
| **Mitigation** | Use only standard annotation types: `/Highlight`, `/Ink`, `/FreeText`, `/Stamp`, `/Text`. Test annotations against Acrobat, Preview, Chrome PDF viewer, and Firefox. Document any known cross-viewer differences. Consider using annotation appearance streams for consistent rendering. |
| **Monitoring** | Cross-viewer compatibility test suite with visual regression tests |

### 6. Sync Conflicts on Binary PDFs

| | |
|---|---|
| **Risk** | Data loss when two devices edit the same PDF simultaneously |
| **Impact** | High — user loses annotations |
| **Likelihood** | Moderate (especially with filesystem sync via iCloud/Dropbox) |
| **Mitigation** | CRDTs work for markdown but not binary files. PDF sync uses last-write-wins with automatic `.conflict` file copy creation. Snapshots provide additional recovery. Marrow Sync (Phase 2) can detect conflicts server-side and notify users. |
| **Monitoring** | Conflict detection and notification system |

## Product Risks

### 7. Scope Creep

| | |
|---|---|
| **Risk** | Attempting too many features delays the MVP |
| **Impact** | Critical — no shipped product |
| **Likelihood** | High |
| **Mitigation** | Strict phase gating. Phase 1 = markdown + PDF browser + annotation + canvas. No sync, no mobile, no plugins until Phase 1 ships. Weekly milestone reviews against the plan. Cut features that aren't tracking to schedule. |
| **Monitoring** | Weekly progress checks against DEVELOPMENT_PHASES.md |

### 8. Performance at Scale (10k+ files)

| | |
|---|---|
| **Risk** | UI becomes sluggish with large vaults |
| **Impact** | Medium — power users abandon the app |
| **Likelihood** | Moderate |
| **Mitigation** | Virtualized file lists (only render visible items). Lazy file tree loading (expand on demand). Search index loaded asynchronously. Thumbnail generation on demand (not all at once). Profile with synthetic 10k-file vaults. |
| **Monitoring** | Performance benchmarks with 1k, 5k, 10k file vaults |

### 9. OPFS Storage Limits

| | |
|---|---|
| **Risk** | Browsers may limit or evict OPFS storage |
| **Impact** | High — user loses vault data |
| **Likelihood** | Low (OPFS is designed for persistent storage, but browsers can evict under storage pressure) |
| **Mitigation** | Request persistent storage (`navigator.storage.persist()`). Show storage usage in vault settings. Warn users approaching limits. Encourage FSAPI or desktop app for large vaults. Provide vault export/backup functionality. |
| **Monitoring** | Storage quota monitoring in the app |

## Risk Matrix

| # | Risk | Likelihood | Impact | Priority |
|---|---|---|---|---|
| 4 | Write corruption | Low | Critical | P0 |
| 7 | Scope creep | High | Critical | P0 |
| 3 | Drawing latency | Moderate | High | P1 |
| 6 | Sync conflicts | Moderate | High | P1 |
| 9 | OPFS storage limits | Low | High | P1 |
| 2 | PDF.js performance | Likely | Medium | P2 |
| 5 | Annotation fidelity | Moderate | Medium | P2 |
| 8 | Scale performance | Moderate | Medium | P2 |
| 1 | FSAPI browser support | Certain | Medium | P3 (accepted) |
