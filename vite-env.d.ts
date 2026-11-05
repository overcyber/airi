/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISTRIBUTION?: 'direct' | 'steam'
  readonly VITE_DISABLE_FLUX_PURCHASE?: string
  /** Offline build of the Alice fork: no AIRI Cloud request and no product analytics. */
  readonly VITE_AIRI_OFFLINE?: string
  readonly VITE_AIRI_PROXY?: string
  /** Alice Docker server of the desktop app, for example `http://192.0.2.10:4173`. See `serverDefaultsOrigin`. */
  readonly VITE_AIRI_SERVER_URL?: string
  readonly VITE_DISABLE_CUSTOM_PROVIDERS?: string
  readonly VITE_ENABLE_ANALYTICS?: string
  readonly VITE_REVENUECAT_WEB_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
