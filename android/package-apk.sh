#!/bin/sh
# Bake ENVELOP_SUPABASE_* via Gradle properties, assemble APK, copy to website/downloads.
set -eu
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
VERSION="${ENVELOP_VERSION:-0.2.0}"
OUT_DIR="$ROOT/website/downloads"
APK_NAME="envelop-android-${VERSION}.apk"

# Prefer JDK 17 when Homebrew openjdk@17 is present (system Java 25 breaks current AGP).
if [ -z "${JAVA_HOME:-}" ] && [ -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]; then
  export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
  export PATH="$JAVA_HOME/bin:$PATH"
fi

if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi

if [ ! -x ./gradlew ]; then
  echo "Missing ./gradlew — generate the Gradle wrapper first." >&2
  exit 1
fi

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

URL="${ENVELOP_SUPABASE_URL:-}"
KEY="${ENVELOP_SUPABASE_KEY:-}"
if [ -z "$URL" ] || [ -z "$KEY" ]; then
  echo "Set ENVELOP_SUPABASE_URL and ENVELOP_SUPABASE_KEY (publishable) before packaging." >&2
  exit 1
fi

if [ -n "${ANDROID_HOME:-}" ] && [ ! -f local.properties ]; then
  printf 'sdk.dir=%s\n' "$ANDROID_HOME" > local.properties
fi

# Prefer debug APK (signed with debug keystore) so sideload works without a release keystore.
./gradlew :app:assembleDebug \
  -Penvelop.url="$URL" \
  -Penvelop.key="$KEY" \
  --no-daemon

APK="app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK" ]; then
  echo "Expected APK missing: $APK" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
cp "$APK" "$OUT_DIR/$APK_NAME"
printf 'Wrote %s (%s bytes)\n' "$OUT_DIR/$APK_NAME" "$(wc -c < "$OUT_DIR/$APK_NAME" | tr -d ' ')"
