# Deploying the web app

The web build is a static site in `out/` (`pnpm build`); there is no server.
The desktop and Android apps embed the same front end and are built by Tauri —
see the README, [`ANDROID.md`](./ANDROID.md) and Releasing below.

## What the host must do

- **Serve `out/`.** Any static host works. `pnpm start` serves it locally
  (`serve out -L`).
- **Serve `/auth/dropbox`** from `out/auth/dropbox.html` — the Dropbox sign-in
  returns to that extensionless path ([`CLOUD_SYNC.md`](./CLOUD_SYNC.md)).
  `serve -L` does this; on Vercel, `cleanUrls` in `vercel.json` does; with
  nginx, spell it out with `try_files`.

`vercel.json` sets the Vite preset, `pnpm install --frozen-lockfile`,
`pnpm build`, the `out/` directory and `cleanUrls`.

## Offline and updates

`public/sw.js` is a hand-written service worker. Navigations are
**network-first**, falling back to the cache offline, so a new deploy is picked
up on the next load instead of serving a stale `index.html` against new
assets; other assets are stale-while-revalidate. `public/boot.js`,
loaded by every page, registers it and warms the cache. Each build writes its
own id into the cache name (`stampServiceWorker` in `vite.config.ts`), so a
deploy starts a fresh cache and drops the old one with its assets.

`public/mp3-recorder-worker.js`, `public/vmsg.wasm` and
`public/pdf.worker.min.mjs` are copied from `node_modules` on install
(`postinstall`) and are not in git.

## Content security policy

The website sends a `Content-Security-Policy` header (`vercel.json`); the
desktop and phone apps carry the same policy in `src-tauri/tauri.conf.json`,
minus `frame-ancestors`, which only works as a header. `tests/csp.test.ts`
keeps the two, and the e2e server's `tests/e2e/serve.json`, identical.

- Script runs only from the app itself (plus `cdn.jsdelivr.net`, where
  transcription's transformers.js loads its ONNX runtime, pinned to the
  installed version): no inline script, no `eval`. `tests/csp.test.ts` fails if
  any other origin is added. Self-hosting that runtime would let the CDN go.
  `'wasm-unsafe-eval'` is for SQLite, PDF and that runtime. The canvas loads `pixi.js/unsafe-eval`, which despite its name
  is Pixi's renderer without `eval`.
- Network requests may go to any `http:` or `https:` address: AI providers
  take a custom base URL and Ollama or llama.cpp run anywhere on the LAN.
- Images may come from any `https:` address (bookmark previews, remote images
  in notes). Inline styles are allowed; the editors set them.
- The apps keep inline styles working by not letting Tauri hash them
  (`dangerousDisableAssetCspModification: ["style-src"]`); hashes would switch
  `'unsafe-inline'` off. In development (`devCsp: null`) there is no policy.

In CI the e2e suite runs against the policy, and any violation fails the test
that caused it (`tests/e2e/fixtures.ts`).

## CI

Workflows use third-party actions pinned to a commit, with the tag as a
comment; Dependabot (`.github/dependabot.yml`) proposes updates monthly. CI
runs with read-only repository access. The release jobs, which hold the
signing secrets, restore no caches, so they build only from what they
fetched themselves.

## Releasing

A version tag builds every app and publishes them as one GitHub release
(`.github/workflows/release.yml`):

| Platform | Files                                                      | Built on     |
| -------- | ---------------------------------------------------------- | ------------ |
| Windows  | `Mentis_<version>_x64-setup.exe`                           | Windows      |
| macOS    | `Mentis_<version>_universal.dmg` (Apple silicon and Intel) | macOS 15     |
| Linux    | `.AppImage` and `.deb` (x64)                               | Ubuntu 22.04 |
| Android  | `mentis-v<version>.apk` and `.aab` (for Play)              | Ubuntu       |

The release is a draft until all four builds have attached their files; if
one fails, re-run the failed jobs and it publishes then.

1. Set the same version in `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml`, and merge it.
2. `git tag v0.2.0 && git push origin v0.2.0`.
3. Upload the `.aab` in the Play Console.

**Once:** the Android secrets ([`ANDROID.md`](./ANDROID.md), Releasing) and
the `NEXT_PUBLIC_DROPBOX_CLIENT_ID` variable; a release without it stops
before building.

**Signing.** The Windows installer is not signed: Windows SmartScreen warns
on first run (More info › Run anyway). Linux packages are not signed. The Mac
app is signed ad hoc until the Apple secrets below are set, so macOS will not
open it until it is allowed in System Settings › Privacy & Security. With
them it is signed with the Developer ID and notarized, and opens normally.
In GitHub, Settings › Secrets and variables › Actions:

| Secret                       | Value                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `APPLE_CERTIFICATE`          | the Developer ID Application certificate, exported as `.p12`, `base64 -i cert.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | the password given when exporting it                                               |
| `APPLE_SIGNING_IDENTITY`     | `Developer ID Application: <name> (<team id>)`                                     |
| `APPLE_API_ISSUER`           | the Issuer ID (App Store Connect › Users and Access › Integrations)                |
| `APPLE_API_KEY`              | the Key ID of an App Store Connect API key with the Developer role                 |
| `APPLE_API_KEY_CONTENT`      | the text of that key's `.p8` file, which Apple lets you download once              |

Notarization signs in with the API key, not the Apple ID: an Apple ID's
password can be locked by Apple, and a locked one fails the build with a 401.

iOS is not in the release: an iPhone installs only from TestFlight or the
App Store ([`IOS.md`](./IOS.md)).

## TestFlight

`.github/workflows/testflight.yml` builds the iPhone and iPad app, signs it for
the App Store and uploads it to TestFlight. Run it from Actions › TestFlight ›
Run workflow, or push a tag such as `ios-v0.1.3`. It is separate from the
release workflow, so an iOS problem never holds back the other platforms.

Once, in Apple's tools: register the bundle id `ink.mentis.app` (Identifiers),
and create the app in App Store Connect with it. Then these secrets, besides
`APPLE_API_ISSUER` and `APPLE_TEAM_ID` from above:

| Secret                      | Value                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `APPLE_IOS_API_KEY`         | the Key ID of an App Store Connect API key with the App Manager role                 |
| `APPLE_IOS_API_KEY_CONTENT` | the text of that key's `.p8` file, which Apple lets you download once                |
| `IOS_CERTIFICATE`           | an Apple Distribution certificate as a `.p12`, base64                                |
| `IOS_CERTIFICATE_PASSWORD`  | the password given when exporting it                                                 |
| `IOS_MOBILE_PROVISION`      | an App Store provisioning profile for `ink.mentis.app` with that certificate, base64 |

The certificate and profile sign the app (Tauri installs them in the build);
the key only uploads it. Cloud signing, where Xcode makes them itself, is not
used: Apple allows it only to Admin API keys, and those fail at times too. The
profile lasts a year and the certificate as long; renew both and replace the
secrets before then. Make the `.p12` with `-keypbe PBE-SHA1-3DES -certpbe
PBE-SHA1-3DES -macalg sha1`, or macOS refuses it.

The build number is the workflow run's number. A build shows in TestFlight
after Apple has processed it, 10 to 30 minutes; internal testers (App Store
Connect › Users and Access) can install it at once, and external testers once
Beta App Review has passed its first build.

## Audits

CI's `audit` job checks dependencies for known vulnerabilities.

- **Rust:** `cargo audit` fails the build on any vulnerability. Two warnings
  remain (unmaintained `proc-macro-error`, unsound `glib`), both in Tauri's
  Linux GTK stack; warnings do not fail it.
- **npm:** `pnpm audit --prod` only reports, as a warning and in the job
  summary. The advisories in shipped code were fixed in October 2026
  (`prosemirror-view`, `fabric` 7, `@xmldom/xmldom`, `linkify-it`, `js-yaml`,
  `protobufjs`, and SheetJS 0.20.3 from its own CDN, since npm stopped getting
  releases). About 30 high or critical remain, all in code that only runs in
  Node and never ships: Next.js and its tooling through `slidecanvas`, `tar`
  and `sharp` through `@huggingface/transformers`, and `image-size`, which
  `slidecanvas` only uses to write PowerPoint files.
- `package.json` overrides `@xmldom/xmldom` for `speech-rule-engine` (slide
  maths), which pins a vulnerable 0.9 release.

## Cross-origin isolation (optional)

Nothing in Mentis requires `SharedArrayBuffer` today, so COOP/COEP headers are
not set. If a future feature needs cross-origin isolation, send on every route:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

and check third-party embeds (link previews, images) still load, since
`require-corp` blocks cross-origin assets without CORP/CORS headers.
