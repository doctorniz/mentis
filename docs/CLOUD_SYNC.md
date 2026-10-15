# Cloud sync (Dropbox)

Mentis can sync a vault's files to **Dropbox**, optionally. It is file by file,
last-write-wins by modification time. When both sides changed the same file,
the other version is kept beside it as `Name (conflict 2026-10-13 14.32).ext`,
synced like any file, and a notification names it. The sync manifest and the OAuth token stay on the
device (IndexedDB), never in the vault. Code: `src/lib/sync/`.

## Setup

1. In the [Dropbox App Console](https://www.dropbox.com/developers/apps):
   **Create app** → **Scoped access** → **Full Dropbox** (the API uses absolute
   paths such as `/Apps/Mentis/<vault>`).
2. **Permissions:** `files.content.read`, `files.content.write`,
   `files.metadata.read`, `files.metadata.write`.
3. **Redirect URIs** — register every one you use:

   | Where you sign in   | Redirect URI                                               |
   | ------------------- | ---------------------------------------------------------- |
   | Web, local dev      | `http://localhost:3000/auth/dropbox` (match your dev port) |
   | Web, deployed       | `https://your-domain.example/auth/dropbox`                 |
   | Desktop and Android | `http://127.0.0.1:53682/auth/dropbox`                      |

4. Put the app key in `.env.local` (read at **build** time, so restart
   `pnpm dev` or rebuild):

   ```
   NEXT_PUBLIC_DROPBOX_CLIENT_ID=your_app_key
   ```

   The app key is not a secret. Without it, **Connect Dropbox** says so.

5. In Mentis: **Settings › Sync** → remote folder (default
   `/Apps/Mentis/<vault name>`) → **Connect Dropbox**. Each vault has its own
   sync section in `_mentis/config.json` and its own token.

### How sign-in returns

- **Web:** Dropbox redirects to `/auth/dropbox`, its own page
  (`auth/dropbox.html`, `src/auth/dropbox-callback.tsx`), which exchanges the
  code (PKCE) and returns to the app. Static hosting must serve that path — see
  [`DEPLOYMENT.md`](./DEPLOYMENT.md).
- **Desktop and Android:** the system browser does the consent step and
  redirects to a one-shot listener on `127.0.0.1:53682` in the app (RFC 8252,
  `src-tauri/src/oauth.rs`). Nothing loads in the app window.

## What syncs

Everything in the vault except:

- `_mentis/snapshots` — pre-edit PDF backups (heavy, per device);
- `_mentis/search-index.json` — a file older versions wrote; nothing uses it now;
- `_mentis/trash` — files sync deleted (below); each side keeps its own;
- any extra patterns in `_mentis/config.json` → `sync.excludePaths`, e.g.
  `["some/folder", "big-file.mp4"]` (an exact path, or anything under it as a
  folder). There is no Settings UI for this yet.

Excluded paths are invisible to sync in both directions; copies already on
Dropbox are left there.

Change detection reads and hashes only files whose size or modification time
changed, using hashes cached in the index.

## Deletes

Sync never deletes a file outright. A file deleted on one side is moved into
`_mentis/trash/<day>/<original path>` on the other: in the vault folder when
it was deleted on Dropbox, and in the Dropbox folder when it was deleted here.
Day folders older than a month are emptied: this device's when a vault opens,
Dropbox's on the first sync after that.

A run that would delete at least 5 files and more than 10% of the files sync
tracks asks first. **Keep files** restores each one on the side it is missing
from, so a renamed or emptied Dropbox folder is filled again rather than
emptying the vault. With nobody to answer, the files are kept.

A file deleted here but edited on Dropbox since the last sync comes back
(as a local edit beats a Dropbox delete). A file on both sides that sync has
no record of — after Disconnect, or a second device using the same folder —
is compared by content: the same, it is just recorded; different, this
device's version stays and Dropbox's is kept as a conflict copy.

## Known gaps

- Nothing lists past conflicts; look for `(conflict …)` files
  (`LAUNCH_DEFERRALS.md`, S7).
- Dropbox only; Marrow Sync (end-to-end encrypted) is on the roadmap.
