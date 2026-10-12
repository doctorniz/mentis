/// <reference types="vite/client" />

/** True in the builds embedded in the app shell (`--mode desktop` or `--mode mobile`). */
declare const __MENTIS_DESKTOP__: boolean
/** True in the build embedded in the mobile app (`vite build --mode mobile`). */
declare const __MENTIS_MOBILE__: boolean
