import type { CapacitorConfig } from '@capacitor/cli'

import { argv, env } from 'node:process'

const serverURL = env.CAPACITOR_DEV_SERVER_URL

const appId = argv.includes('android') ? 'ai.moeru.airi_pocket' : 'ai.moeru.airi-pocket'

const config: CapacitorConfig = {
  appId,
  appName: 'AIRI',
  webDir: 'dist',
  server: serverURL
    ? {
        url: serverURL,
        cleartext: false,
      }
    : undefined,
  android: {
    // NOTICE:
    // The Alice fork calls its Docker server and the NeoAlice broker on the local network over http:// and
    // ws://, because the device does not trust the local certificate of the HTTPS port. The app page is
    // https://localhost, and the WebView blocks http:// from it without this option. The owner chose it.
    // Source: deploy/alice (Plan 05) and Plan 06 in docs/alice-motion-engine.
    // Removal condition: the device trusts the server certificate, and the app uses HTTPS and WSS only.
    allowMixedContent: true,
    buildOptions: {
      keystorePath: env.CAPACITOR_ANDROID_KEYSTORE_PATH,
      keystoreAlias: env.CAPACITOR_ANDROID_KEYSTORE_ALIAS,
      keystorePassword: env.CAPACITOR_ANDROID_KEYSTORE_PASSWORD,
      keystoreAliasPassword: env.CAPACITOR_ANDROID_KEYSTORE_ALIAS_PASSWORD,
      releaseType: 'APK',
      signingType: 'apksigner',
    },
  },
}

export default config
