#!/usr/bin/env bash
# Builds the AIRI Android app (apps/stage-pocket) as a debug APK.
#
# 1. Installs the Android SDK in ANDROID_SDK_ROOT when it is missing: command-line tools,
#    platform 36, build-tools 36.0.0, and platform-tools.
# 2. Builds the web part, runs `cap sync android`, and runs Gradle.
#
# Use:
#   deploy/alice/scripts/android-apk.sh
#   ANDROID_SDK_ROOT=/caminho/do/Sdk deploy/alice/scripts/android-apk.sh
#   ALICE_SERVER_URL=http://192.0.2.10:4173 deploy/alice/scripts/android-apk.sh
#
# ALICE_SERVER_URL is the address of the Alice server (airi-web, HTTP port). The app then loads the chat, the voice,
# the models, and the NeoAlice bridge from it at the first start. Without it, set the address in the app:
# Settings > Modules > NeoAlice bridge > Alice server URL, then "Load settings from the server".
#
# Needs: JDK 21, pnpm, curl, unzip, and about 6 GB of free disk.
set -euo pipefail

sdk="${ANDROID_SDK_ROOT:-/mnt/dockers/Android/Sdk}"
here="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$here/../../.." && pwd)"
pocket="$repo_root/apps/stage-pocket"
# Version of the command-line tools zip of dl.google.com.
tools_zip="commandlinetools-linux-13114758_latest.zip"

java_major="$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1)"
if [ "${java_major:-0}" -lt 21 ]; then
  echo "android-apk: ERROR JDK 21 is needed (found: ${java_major:-none}). Debian/Ubuntu: sudo apt install openjdk-21-jdk" >&2
  exit 1
fi

sdkmanager="$sdk/cmdline-tools/latest/bin/sdkmanager"
if [ ! -x "$sdkmanager" ]; then
  echo "android-apk: installing the command-line tools in $sdk/cmdline-tools/latest"
  mkdir -p "$sdk/cmdline-tools"
  tmp="$(mktemp -d)"
  curl -fSL -o "$tmp/tools.zip" "https://dl.google.com/android/repository/$tools_zip"
  unzip -q "$tmp/tools.zip" -d "$tmp"
  rm -rf "$sdk/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$sdk/cmdline-tools/latest"
  rm -rf "$tmp"
fi

export ANDROID_HOME="$sdk" ANDROID_SDK_ROOT="$sdk"
echo "android-apk: SDK packages in $sdk"
# `yes` ends with SIGPIPE when sdkmanager stops reading, so pipefail is off for this line.
(set +o pipefail; yes | "$sdkmanager" --sdk_root="$sdk" --licenses > /dev/null)
"$sdkmanager" --sdk_root="$sdk" "platforms;android-36" "build-tools;36.0.0" "platform-tools" > /dev/null

# The build downloads the Live2D SDK from cubism.live2d.com. When that site is blocked, the copy of the web app is used.
for dir in .cache/assets/js public/assets/js; do
  if [ ! -d "$pocket/$dir/CubismSdkForWeb-5-r.3" ] && [ -d "$repo_root/apps/stage-web/$dir/CubismSdkForWeb-5-r.3" ]; then
    mkdir -p "$pocket/$dir"
    cp -r "$repo_root/apps/stage-web/$dir/CubismSdkForWeb-5-r.3" "$pocket/$dir/"
  fi
done

cd "$pocket"
if [ -n "${ALICE_SERVER_URL:-}" ]; then
  export VITE_AIRI_SERVER_URL="$ALICE_SERVER_URL"
  echo "android-apk: the app loads its settings from $ALICE_SERVER_URL"
else
  echo "android-apk: WARNING no ALICE_SERVER_URL. The app has no chat, voice or NeoAlice bridge until the server URL is set in its settings." >&2
fi
echo "android-apk: building the web part"
pnpm run build
pnpm exec cap sync android
echo "sdk.dir=$sdk" > android/local.properties

echo "android-apk: building the APK with Gradle"
(cd android && ./gradlew assembleDebug)

apk="$(find "$pocket/android/app/build/outputs/apk/debug" -name '*.apk' | head -1)"
echo "android-apk: done: $apk"
echo "android-apk: install on a phone with USB debugging: $sdk/platform-tools/adb install -r \"$apk\""
