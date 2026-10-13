# Mentis — Risks

The risks that matter now, what already mitigates each, and what is still
open. _Last reviewed 2026-10-13._ Open items with IDs are tracked in
[`LAUNCH_DEFERRALS.md`](./LAUNCH_DEFERRALS.md).

| #   | Risk                                        | Likelihood | Impact   | Priority |
| --- | ------------------------------------------- | ---------- | -------- | -------- |
| 1   | A write interrupted mid-way corrupts a file | Low        | Critical | P0       |
| 2   | Sync conflicts lose an edit                 | Moderate   | High     | P1       |
| 3   | Play rejects the exact-alarm permission     | Moderate   | High     | P1       |
| 4   | Android file access is slow for big vaults  | Certain    | Medium   | P1       |
| 5   | Phone cold start misses its budget          | Likely     | Medium   | P2       |
| 6   | The browser evicts a web vault              | Low        | High     | P2       |
| 7   | The startup bundle outgrows its budget      | Likely     | Medium   | P2       |
| 8   | Losing the Android upload key               | Low        | Medium   | P3       |
| 9   | Licence misread; errors in AI-assisted code | Moderate   | Medium   | P3       |

## 1. Interrupted writes

A crash, closed tab or power loss during a save could leave a broken file.

- **In place:** PDFs are written to a temporary file, checked for a `%PDF-`
  header, then renamed over the original; a snapshot is taken before the first
  edit (`_mentis/snapshots/`). Canvases write their layer PNGs before the JSON
  that points at them. Chat files use temp-and-rename.
- **Open:** there is no shared "atomic write" helper; each feature does its
  own. Notes are written directly.

## 2. Sync conflicts

Two devices editing the same file between syncs.

- **In place:** last-write-wins by modification time, a notification naming
  the kept version, and no silent overwrite of an unpushed local edit on poll.
- **Open:** the losing version is not kept and there is no conflict history
  (S7). Marrow Sync, with merging for Markdown, is a roadmap item.

## 3. Exact alarms on Google Play

The Android app declares `USE_EXACT_ALARM` so reminders fire on the minute.
Google Play allows it only for apps whose core function is an alarm, a timer
or a calendar, and reviews the declaration.

- **Mitigation:** Mentis has a calendar and reminders; state that in the Play
  declaration. If it is refused, fall back to `SCHEDULE_EXACT_ALARM` (the user
  grants it in system settings) and ask when the first reminder is set.

## 4. Android file access speed

A vault in a picked folder is reached through Android's Storage Access
Framework: about 40 ms to open each file on the emulator.

- **In place:** reads run in parallel from Rust over JNI; the first index of
  2,000 notes took 43 s in the background, and later launches only re-list
  folders (~5.5 s, also in the background) while the tree draws from the index.
- **Open:** measure on real phones; very large vaults will be slow to index
  the first time.

## 5. Phone cold start

The budget is 1.8 s to a usable shell. The emulator measured 2.0–2.4 s on a
Windows host, which is not representative either way.

- **Next:** measure on a mid-range phone (`docs/ANDROID.md`, "Cold start")
  before tuning.

## 6. Web vault eviction

A web vault in the browser's private storage (OPFS) can be evicted under
storage pressure.

- **In place:** the app asks for persistent storage
  (`navigator.storage.persist()`); Chromium users can open a real folder
  instead; the desktop and Android apps use real folders. Sync gives an
  off-device copy.

## 7. Startup bundle

Initial JS + CSS is ~206 of 209 KB (the ratchet); every always-loaded
component adds to it.

- **In place:** the budget is enforced in CI; editors, views and most
  features load lazily.
- **Rule:** a budget is raised only as a deliberate, separate commit.

## 8. The Android upload key

- **In place:** Play App Signing holds the app signing key; the upload key
  lives in GitHub secrets and a password manager, and Play can reset a lost
  upload key.

## 9. Licence and AI-assisted code

- **Licence:** Business Source License 1.1, which is less familiar than MIT or
  Apache. `LICENSE` is the single source; the README summary must agree with
  it; change parameters only after legal review.
- **AI-assisted code:** human review before merging; CI runs typecheck, lint,
  unit, Rust and end-to-end tests; security-sensitive paths (vault path
  resolution, sign-in, signing) get extra scrutiny.
