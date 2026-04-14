# Cloud sync (Dropbox)

Mentis can optionally sync vault files to **Dropbox**. Sync is **last-write-wins** by file modification time; manifests and OAuth tokens live in **IndexedDB** (see `docs/ARCHITECTURE.md`, Sync Engine). A **self-hosted** sync server may be added later.

## Environment variables (build / dev)

Read at **build time** for the static export (`NEXT_PUBLIC_*`). Set in `.env.local` and restart `pnpm dev` / `pnpm build`.

| Variable | Used for | What it is |
|----------|-----------|------------|
| **`NEXT_PUBLIC_DROPBOX_CLIENT_ID`** | Dropbox OAuth | **App key** from the [Dropbox App Console](https://www.dropbox.com/developers/apps). Not a secret. Register redirect URIs (below). |

If it is missing, **Connect Dropbox** in Settings will alert.

## Dropbox setup

1. [Dropbox App Console](https://www.dropbox.com/developers/apps) → **Create app** → **Scoped access** → **Full Dropbox**: the API uses absolute paths like `/Apps/Mentis/<vault>`.
2. **Permissions** (Scopes tab): enable `files.content.read`, `files.content.write`, `files.metadata.read`, `files.metadata.write`.
3. **OAuth 2** → redirect URIs, e.g. `http://localhost:3000/auth/dropbox` and `https://your-domain.example/auth/dropbox`.
4. `.env.local`: `NEXT_PUBLIC_DROPBOX_CLIENT_ID=your_app_key_here`
5. **Settings** → **Sync**: **Remote folder** defaults to `/Apps/Mentis/<vault name>`. Click **Connect Dropbox**. With Dropbox enabled, use the **sync** icon in the Vault toolbar (next to Preview / Files) to run a full sync on demand. Each vault has its own `_marrow/config.json` sync section and its own OAuth token key (`vaultId` = active vault path).

After OAuth, the app opens **`/auth/dropbox`** (`src/app/auth/dropbox/page.tsx`), exchanges `code` for tokens, returns to `/`. Static hosting must serve the SPA for `/auth/dropbox` (see `docs/DEPLOYMENT.md`).

## Related

- Architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Deferrals: [`LAUNCH_DEFERRALS.md`](./LAUNCH_DEFERRALS.md)
- Deployment: [`DEPLOYMENT.md`](./DEPLOYMENT.md)
